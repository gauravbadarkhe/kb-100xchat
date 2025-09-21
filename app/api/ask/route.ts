import { NextRequest, NextResponse } from 'next/server'
import { repos } from '../../../src/repo'
import { embedOne } from '../../../src/embeddings'
import { chatAsObject } from '../../../src/ai'
import { withAuth, createErrorResponse, createSuccessResponse, AuthenticatedRequest } from '@/src/auth/middleware'
import { projectsRepo } from '@/src/auth/repositories'
import { z } from 'zod'

type Retrieved = {
  score: number;
  repo: string;
  path: string;
  symbol?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  commit: string;
  preview: string;
  link: string;
};

type Citation = {
  link: string;
  repo: string;
  path: string;
  start_line?: number;
  end_line?: number;
};

type RepoFilterInput = { all?: boolean; repos?: string[]; projects?: number[] };
type Hints = { paths?: string[]; identifiers?: string[]; aggressive?: boolean };
type AskPayload = {
  q: string;
  k?: number;
  filter?: RepoFilterInput;
  hints?: Hints;
};

function uniqueByFile(items: Retrieved[]) {
  const seen = new Set<string>();
  const out: Retrieved[] = [];
  for (const it of items) {
    const key = `${it.repo}::${it.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function buildPrompt(question: string, sources: Retrieved[]) {
  const srcList = sources.map((s, i) => `[${i + 1}] ${s.link}`).join("\n");
  const ctx = sources
    .map((s, i) => {
      const header =
        `SOURCE [${i + 1}] ${s.repo}/${s.path}` +
        (s.symbol ? ` · ${s.symbol}` : "") +
        (s.start_line
          ? ` · L${s.start_line}${s.end_line ? `-${s.end_line}` : ""}`
          : "") +
        `\n${s.link}`;
      const sep = "\n----\n";
      const body =
        s.preview.length > 1000
          ? s.preview.slice(0, 1000) + "\n..."
          : s.preview;
      return `${header}${sep}${body}`;
    })
    .join("\n\n");

  const system =
    `You are a senior engineer. Answer ONLY with facts grounded in the provided sources.\n` +
    `Rules:\n` +
    `- Cite with [n] markers, where n matches the index in the SOURCES list.\n` +
    `- Prefer short code snippets (≤ 30 lines) and concrete steps.\n` +
    `- If info is missing, say "Not enough information in the provided sources."`;

  const user =
    `QUESTION:\n${question}\n\n` +
    `SOURCES:\n${srcList}\n\n` +
    `CONTEXT:\n${ctx}\n\n` +
    `RESPONSE FORMAT (JSON):\n` +
    `{\n  "answer": "final answer in markdown with [n] citations",\n  "citations": [\n    {"link":"<url>","repo":"<org/repo>","path":"<file>","start_line":10,"end_line":30}\n  ]\n}\n\n` +
    `Instructions:\n` +
    `- Insert [n] markers where you rely on a source.\n` +
    `- In "citations", include ONLY the sources you referenced in the answer.\n` +
    `- If unsupported, set "answer" accordingly and return empty "citations".`;

  return { system, user };
}

function groupPathsByRepo(paths: string[]) {
  return paths.reduce(
    (acc, full) => {
      const parts = full.split("/");
      if (parts.length < 3) return acc;
      const repoFull = parts.slice(0, 2).join("/");
      const path = parts.slice(2).join("/");
      (acc[repoFull] ||= []).push(path);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

async function retrieveHybrid(
  question: string,
  topK: number,
  filter: RepoFilterInput | undefined,
  organizationProjects?: string[], // NEW: Organization-scoped repos
) {
  const qv = await embedOne(question);
  const queryVectorLiteral = `[${qv.join(",")}]`;
  
  // Build filter with organization scope
  let normFilter: any;
  
  if (organizationProjects && organizationProjects.length > 0) {
    // If user has organization projects, scope to those
    if (filter?.all || !filter?.repos?.length) {
      normFilter = { mode: "subset", repos: organizationProjects } as const;
    } else {
      // Intersect user's filter with organization projects
      const allowedRepos = filter.repos.filter(repo => organizationProjects.includes(repo));
      normFilter = { mode: "subset", repos: allowedRepos } as const;
    }
  } else {
    // Fallback to original behavior for backward compatibility
    normFilter = 
      filter?.all || !filter?.repos?.length
        ? ({ mode: "all" } as const)
        : ({ mode: "subset", repos: filter!.repos! } as const);
  }

  return repos.search.hybridSearch({
    query: question,
    queryVectorLiteral,
    topK,
    filter: normFilter,
  });
}

async function keywordOnly(
  question: string,
  filter: RepoFilterInput | undefined,
  organizationProjects?: string[],
) {
  return retrieveHybrid(`"${question}"`, 32, filter, organizationProjects);
}

// Get user's accessible repositories based on their projects
async function getUserRepositories(organizationId: number): Promise<string[]> {
  try {
    const projects = await projectsRepo.findActive(organizationId);
    
    // For now, we'll get all repositories from the database that are linked to projects
    // In the future, this could be more sophisticated based on project settings
    const { db } = await import('../../../src/db');
    const result = await db.query(`
      SELECT DISTINCT d.repo_full
      FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE p.organization_id = $1 AND p.is_active = true
    `, [organizationId]);
    
    return result.rows.map(row => row.repo_full);
  } catch (error) {
    console.error('Error getting user repositories:', error);
    return [];
  }
}

// Handler function for the POST endpoint
async function handlePost(request: AuthenticatedRequest): Promise<NextResponse> {
  try {
    const { authContext } = request;
    const body: AskPayload = await request.json()
    const question = String(body.q || "").trim();
    
    if (!question) {
      return createErrorResponse("Question is required", 400);
    }

    const TOP_K_BASE = Number.isFinite(body.k as any) ? Number(body.k) : 16;
    const filter = body.filter;

    // Get user's accessible repositories
    const organizationRepos = await getUserRepositories(authContext.organization_id);
    
    if (organizationRepos.length === 0) {
      return createSuccessResponse({
        answer: "No data sources are available for your organization. To get started, please add data sources (like GitHub repositories, documentation sites, or file uploads) on the Sources page. Once you've connected your data sources and they've been indexed, you'll be able to ask questions about their content.",
        citations: [] as Citation[],
      });
    }

    // Pass 1: normal retrieval
    let retrieved = await retrieveHybrid(question, TOP_K_BASE, filter, organizationRepos);

    // Guard/dedupe
    const prune = (items: Retrieved[], minScore = 0.25) =>
      uniqueByFile(items.filter((r) => r.score >= minScore));

    let pruned = prune(retrieved, 0.25);

    // If weak, try retry ladder
    if (!pruned.length || (body.hints?.aggressive && pruned.length < 3)) {
      // Pass 2: bump K and lower threshold
      const more = await retrieveHybrid(
        question,
        Math.max(48, TOP_K_BASE * 2),
        filter,
        organizationRepos
      );
      pruned = prune([...retrieved, ...more], 0.15);
    }

    if (!pruned.length || (body.hints?.aggressive && pruned.length < 3)) {
      // Pass 3: keyword-only bias
      const kw = await keywordOnly(question, filter, organizationRepos);
      pruned = prune([...pruned, ...kw], 0.0);
    }

    // If caller gave exact file hints, force-include them
    const hintPaths = body.hints?.paths || [];
    if (hintPaths.length) {
      const grouped = groupPathsByRepo(hintPaths);
      const forced: Retrieved[] = [];
      for (const [repoFull, paths] of Object.entries(grouped)) {
        // Only include paths from repos the user has access to
        if (organizationRepos.includes(repoFull)) {
          for (const p of paths) {
            const rows = await repos.search.getByPath({
              repoFull,
              path: p,
              limitChunks: 8,
            });
            forced.push(...rows);
          }
        }
      }
      // De-dupe and give forced ones a tiny boost so they make the top 8
      forced.forEach((f) => (f.score = Math.max(f.score, 0.99)));
      pruned = uniqueByFile([...forced, ...pruned]);
    }

    // Final top context (no rerank as requested)
    const top = pruned.slice(0, 8);

    if (!top.length) {
      return createSuccessResponse({
        answer: "Not enough information in the provided sources.",
        citations: [] as Citation[],
      });
    }

    const { system, user } = buildPrompt(question, top);

    // Schema for safe JSON
    const AnswerSchema = z.object({
      answer: z.string(),
      citations: z
        .array(
          z.object({
            link: z.string().url(),
            repo: z.string(),
            path: z.string(),
            start_line: z.number().optional(),
            end_line: z.number().optional(),
          }),
        )
        .optional()
        .default([]),
    });

    const parsed = await chatAsObject({ system, user, schema: AnswerSchema });

    // Post-filter citations
    const valid = new Map<string, Retrieved>(top.map((t) => [t.link, t]));
    const citations: Citation[] = (parsed.citations || [])
      .filter((c: any) => valid.has(c.link))
      .map((c) => {
        const t = valid.get(c.link)!;
        return {
          link: t.link,
          repo: t.repo,
          path: t.path,
          start_line: t.start_line ?? undefined,
          end_line: t.end_line ?? undefined,
        };
      });

    const answerStr = String(parsed.answer || "").trim();
    const hasMarkers = /\[\d+\]/.test(answerStr);
    const finalAnswer =
      (hasMarkers && citations.length) || answerStr
        ? answerStr
        : "Not enough information in the provided sources.";

    return createSuccessResponse({ answer: finalAnswer, citations });
  } catch (error: any) {
    console.error("ask error:", error?.stack || error?.message || error);
    return createErrorResponse("Ask failed", 500, error?.message || "unknown");
  }
}

// Export the POST handler with auth middleware
export const POST = withAuth(handlePost);
