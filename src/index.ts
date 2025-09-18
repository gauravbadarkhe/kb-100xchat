// src/index.ts
import "dotenv/config";
import express from "express";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { handleWebhook } from "./webhook";
import { search } from "./util";
import { fullSync } from "./sync";
import { ask } from "./rag";

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! });
webhooks.onAny(handleWebhook);

const app = express();
app.use(createNodeMiddleware(webhooks, { path: "/webhooks" }));
app.get("/health", (_req, res) => res.send("ok"));

app.get("/search", async (req, res) => {
  const q = String(req.query.q || "");
  if (!q) return res.status(400).json({ error: "missing q" });
  const results = await search(q, Number(req.query.k || 8));
  res.json(results);
});

app.post("/index/full", express.json(), async (req, res) => {
  const { installationId, repoFullName } = req.body || {};
  if (!installationId || !repoFullName)
    return res
      .status(400)
      .json({ error: "installationId, repoFullName required" });
  await fullSync(Number(installationId), String(repoFullName));
  res.json({ ok: true });
});

app.post("/ask", express.json(), ask);

app.listen(process.env.PORT || 3000, () =>
  console.log("up on", process.env.PORT || 3000),
);
