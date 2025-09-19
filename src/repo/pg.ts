// src/repo/pg.ts
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL!;
if (!connectionString) {
  throw new Error("SUPABASE_DB_URL is required");
}

export const pool = new pg.Pool({
  connectionString,
  // Supabase requires SSL in most environments:
  ssl: { rejectUnauthorized: false },
});

export async function withTx<T>(
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
