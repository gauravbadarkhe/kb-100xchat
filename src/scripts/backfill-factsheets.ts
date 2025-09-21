// src/scripts/backfill-factsheets.ts
import "dotenv/config";
import { pool as db, withTx } from "../repo/pg";
import { persistAnalysis } from "../analysis/presists";
import { upsertFactsheetsForDocument } from "../analysis/factsheet";

async function main() {
  const { rows } = await db.query(
    `select id, path, lang
       from documents
      order by id asc`,
  );

  let ok = 0,
    fail = 0;
  for (const r of rows) {
    try {
      // Pull latest file text from chunks as a fallback
      const file = await db.query(
        `select text, meta from chunks
          where document_id=$1
          order by ordinal asc
          limit 1`,
        [r.id],
      );
      const content = file.rows?.[0]?.text || "";
      await persistAnalysis({
        documentId: r.id,
        path: r.path,
        lang: r.lang,
        content,
      });
      await upsertFactsheetsForDocument(r.id);
      ok++;
      if (ok % 50 === 0) console.log(`factsheets: ${ok}/${rows.length}`);
    } catch (e: any) {
      fail++;
      console.warn("backfill failed", r.id, r.path, e?.message);
    }
  }
  console.log(`done: ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
