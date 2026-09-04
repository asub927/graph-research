import { createHash } from 'node:crypto';
import { embeddingConfig } from './config.ts';

/**
 * Embeddings.
 *
 * With `LLM_API_KEY` set we call the configured OpenAI-compatible embeddings
 * endpoint. Without one we fall back to a local hashing vectoriser: tokens are
 * hashed into buckets and the resulting term-frequency vector is L2-normalised,
 * so cosine similarity degrades to weighted term overlap.
 *
 * The fallback is not a substitute for real embeddings — it cannot see that
 * "LLM" and "language model" are related — but it is deterministic, needs no
 * network, and produces a genuinely ranked ordering. That makes the whole
 * publish pipeline runnable and testable before any provider is configured,
 * rather than leaving semantic search dead until a key appears.
 */

const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'but', 'by', 'can', 'do', 'does', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'his', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'more', 'most', 'my', 'no', 'not', 'of', 'on', 'one',
  'or', 'our', 'out', 'over', 'she', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'to', 'up', 'was', 'we', 'were', 'what', 'when', 'which', 'who', 'why',
  'will', 'with', 'would', 'you', 'your',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && token.length < 32 && !STOPWORDS.has(token));
}

/** Significant terms shared between two texts, most frequent first. */
export function sharedTerms(a: string, b: string, limit = 4): string[] {
  const countsA = new Map<string, number>();
  for (const token of tokenize(a)) countsA.set(token, (countsA.get(token) ?? 0) + 1);

  const countsB = new Map<string, number>();
  for (const token of tokenize(b)) countsB.set(token, (countsB.get(token) ?? 0) + 1);

  return [...countsA.entries()]
    .filter(([token]) => countsB.has(token))
    .map(([token, count]) => ({ token, weight: count + (countsB.get(token) ?? 0) }))
    .sort((x, y) => y.weight - x.weight || x.token.localeCompare(y.token))
    .slice(0, limit)
    .map((entry) => entry.token);
}

function bucketFor(token: string, dimensions: number): number {
  const digest = createHash('sha1').update(token).digest();
  return digest.readUInt32BE(0) % dimensions;
}

/** Deterministic hashing vectoriser used when no provider is configured. */
export function localEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    // Sign derived from a second hash byte so unrelated tokens colliding in the
    // same bucket are as likely to cancel as to reinforce.
    const digest = createHash('sha1').update(token).digest();
    const sign = digest[4]! % 2 === 0 ? 1 : -1;
    vector[bucketFor(token, dimensions)]! += sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    // An empty or all-stopword text has no direction. Return a fixed unit
    // vector so the value is still storable and comparisons stay defined.
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / norm);
}

export function isEmbeddingProviderConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

async function remoteEmbedding(text: string): Promise<number[]> {
  const baseUrl = (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(
    /\/$/,
    '',
  );

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: embeddingConfig.model,
      input: text.slice(0, 8000),
      dimensions: embeddingConfig.dimensions,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `embedding request failed: ${response.status} ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as { data: Array<{ embedding: number[] }> };
  const embedding = payload.data[0]?.embedding;
  if (!embedding) throw new Error('embedding response contained no vector');
  if (embedding.length !== embeddingConfig.dimensions) {
    throw new Error(
      `embedding width ${embedding.length} does not match the configured ` +
        `EMBEDDING_DIMENSIONS=${embeddingConfig.dimensions}; the schema stores ` +
        'a fixed-width vector, so these must agree',
    );
  }
  return embedding;
}

/**
 * Embed a text. Falls back to the local vectoriser when no provider is
 * configured, or when the provider call fails — a publish should not be lost
 * because an embedding endpoint was briefly unavailable.
 */
export async function embed(text: string): Promise<number[]> {
  if (!isEmbeddingProviderConfigured()) {
    return localEmbedding(text, embeddingConfig.dimensions);
  }
  try {
    return await remoteEmbedding(text);
  } catch (error) {
    console.warn(
      `[embeddings] provider failed, using local fallback: ${(error as Error).message}`,
    );
    return localEmbedding(text, embeddingConfig.dimensions);
  }
}
