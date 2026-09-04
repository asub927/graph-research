import { EDGE_META, EDGE_TYPES, type EdgeType, isEdgeType } from './types.ts';
import { graphConfig } from './config.ts';
import { markdownToText, truncate } from './markdown.ts';
import { sharedTerms } from './embeddings.ts';

/**
 * The generative half of the publish pipeline: writing an item's summary, and
 * judging how it connects to what came before.
 *
 * Both operations degrade rather than fail. With no provider configured the
 * summariser becomes extractive and the judge falls back to term overlap,
 * proposing only `related_to` with a reason that states the shared terms
 * instead of inventing a rationale. That distinction matters: a fabricated
 * "why these connect" sentence is worse than no edge, because the reason text
 * is published verbatim and readers will take it as authored.
 */

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

async function chat(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const baseUrl = (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(
    /\/$/,
    '',
  );

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`chat request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices[0]?.message?.content;
  if (!content) throw new Error('chat response contained no content');
  return content;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Some providers wrap JSON in prose or a fenced block even when asked not
    // to; recover the outermost object rather than discarding the response.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('response was not JSON');
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

// --- Summarisation ----------------------------------------------------------

export interface SummaryRequest {
  url?: string;
  /** Title as extracted from the source, used as a hint and a fallback. */
  sourceTitle?: string;
  /** Extracted article prose. */
  text: string;
}

export interface SummaryResult {
  title: string | null;
  /** Plain prose. The caller wraps it as a blockquote. */
  summary: string;
  generated: boolean;
}

const SUMMARY_SYSTEM = `You summarise sources for a personal link log.

Reply with JSON: {"title": string, "summary": string}.

The title should name the source plainly, under 90 characters, with no site
name suffix and no clickbait. The summary is one to three sentences, under 60
words, stating what the source actually says. Write plainly and factually.
Do not evaluate it, do not recommend it, do not address the reader, and do not
begin with filler like "This article".`;

/** Extractive fallback: the opening sentences of the source prose. */
function extractiveSummary(text: string): string {
  const clean = markdownToText(text);
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let summary = '';
  for (const sentence of sentences) {
    if (summary.length + sentence.length > 320) break;
    summary += (summary ? ' ' : '') + sentence;
  }
  return summary || truncate(clean, 320);
}

export async function generateSummary(
  request: SummaryRequest,
): Promise<SummaryResult> {
  const fallback: SummaryResult = {
    title: request.sourceTitle?.trim() || null,
    summary: extractiveSummary(request.text),
    generated: false,
  };

  if (!isLlmConfigured() || request.text.trim().length === 0) return fallback;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SUMMARY_SYSTEM },
        {
          role: 'user',
          content: [
            request.url ? `URL: ${request.url}` : '',
            request.sourceTitle ? `Extracted title: ${request.sourceTitle}` : '',
            '',
            truncate(markdownToText(request.text), 12_000),
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      400,
    );

    const parsed = parseJsonObject(raw);
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (summary.length === 0) return fallback;

    return {
      title: title || fallback.title,
      summary,
      generated: true,
    };
  } catch (error) {
    console.warn(`[llm] summary failed, using extractive fallback: ${(error as Error).message}`);
    return fallback;
  }
}

// --- Edge judging -----------------------------------------------------------

export interface EdgeCandidate {
  id: string;
  shortId: string;
  title: string | null;
  content: string;
  /** Similarity to the new item, 0-1. Used by the fallback judge. */
  score: number;
}

export interface EdgeProposal {
  /** UUID of the candidate this edge points at. */
  targetId: string;
  type: EdgeType;
  confidence: number;
  reason: string;
}

const JUDGE_SYSTEM = `You identify typed relationships between items in a personal knowledge graph.

You receive a NEW item and a list of CANDIDATE items, each with an id. Decide
which candidates the new item genuinely relates to, and how.

Relationship types, from the new item's point of view:
${EDGE_TYPES.map((type) => `- ${type}: ${EDGE_META[type].description}`).join('\n')}

Reply with JSON: {"edges": [{"id": string, "type": string, "confidence": number, "reason": string}]}

Rules:
- Only include a candidate when the relationship is real and specific. Omitting
  a weak connection is always better than inventing one.
- "reason" is published verbatim to readers as the explanation of the link. It
  must be one sentence naming the specific claim, finding, or subject the two
  items share or dispute. Never write a generic reason like "both discuss AI".
- Prefer a precise type over related_to. Reserve related_to for items that share
  subject matter without one bearing on the other.
- "confidence" is 0 to 1, reflecting how sure you are the relationship holds.
- Return an empty list if nothing genuinely connects.`;

/**
 * Term-overlap fallback.
 *
 * Proposes `related_to` only, with a reason that reports the actual overlapping
 * terms. It never claims a direction of argument, because term overlap cannot
 * establish one.
 *
 * Confidence is derived from how many significant terms the two texts share,
 * not from embedding distance. Cosine similarity between two short documents
 * under the local hashing vectoriser lands well below the publication floor
 * even for obviously related items, so scoring on distance would silently
 * discard every fallback edge. Term overlap is also the thing the published
 * reason actually cites, which makes it the honest basis for the number.
 */
const FALLBACK_MIN_SHARED_TERMS = 2;

function fallbackJudge(
  newItemText: string,
  candidates: readonly EdgeCandidate[],
): EdgeProposal[] {
  return candidates
    .map((candidate) => ({
      candidate,
      terms: sharedTerms(newItemText, `${candidate.title ?? ''} ${candidate.content}`, 8),
    }))
    .filter(({ terms }) => terms.length >= FALLBACK_MIN_SHARED_TERMS)
    .map(({ candidate, terms }) => {
      // Two shared terms sits at the floor; each additional term adds a little,
      // capped short of the confidence a real judge would assert.
      const strength = Math.min(terms.length, 6) - FALLBACK_MIN_SHARED_TERMS;
      const confidence = Math.min(
        0.75,
        graphConfig.edgeConfidenceFloor + 0.04 * strength,
      );
      const cited = terms.slice(0, 4);
      const list =
        cited.length === 1
          ? cited[0]
          : `${cited.slice(0, -1).join(', ')} and ${cited.at(-1)}`;

      return {
        targetId: candidate.id,
        type: 'related_to' as EdgeType,
        confidence: Number(confidence.toFixed(3)),
        reason: `Both items refer to ${list}.`,
      };
    });
}

export async function judgeEdges(
  newItem: { title: string | null; content: string },
  candidates: readonly EdgeCandidate[],
): Promise<{ proposals: EdgeProposal[]; generated: boolean }> {
  const newItemText = `${newItem.title ?? ''}\n${markdownToText(newItem.content)}`;

  if (candidates.length === 0) return { proposals: [], generated: false };

  if (!isLlmConfigured()) {
    return { proposals: fallbackJudge(newItemText, candidates), generated: false };
  }

  try {
    const raw = await chat(
      [
        { role: 'system', content: JUDGE_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            new_item: {
              title: newItem.title,
              content: truncate(markdownToText(newItem.content), 1500),
            },
            candidates: candidates.map((candidate) => ({
              id: candidate.shortId,
              title: candidate.title,
              content: truncate(markdownToText(candidate.content), 600),
            })),
          }),
        },
      ],
      1600,
    );

    const parsed = parseJsonObject(raw);
    const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
    const byShortId = new Map(candidates.map((c) => [c.shortId, c]));

    const proposals: EdgeProposal[] = [];
    for (const entry of rawEdges) {
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const candidate = byShortId.get(String(record.id));
      const type = record.type;
      const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
      const confidence = Number(record.confidence);

      // Drop anything malformed rather than coercing it. A hallucinated id or
      // an unknown type means the model was not answering the question asked.
      if (!candidate || !isEdgeType(type) || reason.length < 12) continue;
      if (!Number.isFinite(confidence) || confidence <= 0 || confidence > 1) continue;

      proposals.push({ targetId: candidate.id, type, confidence, reason });
    }

    return { proposals, generated: true };
  } catch (error) {
    console.warn(`[llm] edge judging failed, using term overlap: ${(error as Error).message}`);
    return { proposals: fallbackJudge(newItemText, candidates), generated: false };
  }
}

/**
 * Apply the publication policy to proposed edges: enforce the confidence floor,
 * then keep the highest-confidence edges up to the per-item cap.
 *
 * This is the guard against the failure the plan flags as the main product
 * risk — a permissive judge turning the graph into a hairball of weak
 * `related_to` links.
 */
export function selectEdges(proposals: readonly EdgeProposal[]): EdgeProposal[] {
  const seen = new Set<string>();
  return [...proposals]
    .filter((proposal) => proposal.confidence >= graphConfig.edgeConfidenceFloor)
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        EDGE_META[a.type].weight - EDGE_META[b.type].weight,
    )
    .filter((proposal) => {
      // One edge per target: if the judge proposed two relationships to the
      // same item, the more confident one wins.
      if (seen.has(proposal.targetId)) return false;
      seen.add(proposal.targetId);
      return true;
    })
    .slice(0, graphConfig.edgeMaxPerItem);
}
