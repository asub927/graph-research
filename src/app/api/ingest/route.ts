import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { absoluteUrl } from '@/lib/config';
import { problem } from '@/lib/http';
import { requireIngestAuth } from '@/lib/http';
import { ExtractionError } from '@/lib/extract';
import {
  PublishError,
  publishEssay,
  publishLink,
  publishRiff,
  type PublishResult,
} from '@/lib/publish';

/**
 * The authenticated capture endpoint (R1, R15).
 *
 * Paste a URL and the pipeline does the rest: fetch, summarise, embed, judge
 * connections, persist, recompute derived structure. Riffs and essay pointers
 * come in through the same door with a different `kind`.
 *
 * Revalidation happens here rather than inside the pipeline, because
 * `revalidatePath` only works in a request context and the pipeline also runs
 * from scripts.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const linkSchema = z.object({
  kind: z.literal('link'),
  url: z.string().url(),
  commentary: z.string().max(4000).optional(),
  title: z.string().max(300).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  published_at: z.string().datetime().optional(),
});

const riffSchema = z.object({
  kind: z.literal('riff'),
  body: z.string().min(1).max(8000),
  title: z.string().max(300).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  published_at: z.string().datetime().optional(),
});

const essaySchema = z.object({
  kind: z.literal('essay'),
  url: z.string().url(),
  title: z.string().min(1).max(300),
  commentary: z.string().min(1).max(4000),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  published_at: z.string().datetime().optional(),
});

const requestSchema = z.discriminatedUnion('kind', [
  linkSchema,
  riffSchema,
  essaySchema,
]);

export async function POST(request: Request): Promise<Response> {
  const auth = requireIngestAuth(request);
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return problem({
      status: 400,
      title: 'Malformed request body',
      detail: 'The body must be JSON.',
      type: 'malformed-body',
    });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return problem({
      status: 422,
      title: 'Invalid capture request',
      detail: 'The body did not match any supported capture shape.',
      type: 'validation',
      extensions: {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }

  const input = parsed.data;
  const publishedAt = input.published_at ? new Date(input.published_at) : undefined;

  let result: PublishResult;
  try {
    switch (input.kind) {
      case 'link':
        result = await publishLink({
          url: input.url,
          commentary: input.commentary,
          title: input.title,
          tags: input.tags,
          publishedAt,
        });
        break;
      case 'riff':
        result = await publishRiff({
          body: input.body,
          title: input.title,
          tags: input.tags,
          publishedAt,
        });
        break;
      case 'essay':
        result = await publishEssay({
          url: input.url,
          title: input.title,
          commentary: input.commentary,
          tags: input.tags,
          publishedAt,
        });
        break;
    }
  } catch (error) {
    if (error instanceof ExtractionError) {
      return problem({
        status: 422,
        title: 'Could not read the source',
        detail: error.message,
        type: 'extraction-failed',
      });
    }
    if (error instanceof PublishError) {
      return problem({
        status: 422,
        title: 'Could not publish',
        detail: error.message,
        type: 'publish-failed',
      });
    }
    console.error('[ingest] unexpected failure', error);
    return problem({
      status: 500,
      title: 'Publish failed',
      detail: 'The item was not published. The failure has been logged.',
      type: 'internal',
    });
  }

  for (const path of result.affectedPaths) {
    revalidatePath(path);
  }
  // Stream pages beyond the first shift as items are added.
  revalidatePath('/page/[n]', 'page');

  return new Response(
    JSON.stringify(
      {
        short_id: result.item.shortId,
        id: result.item.id,
        type: result.item.type,
        title: result.item.title,
        permalink: absoluteUrl(`/i/${result.item.shortId}`),
        published_at: result.item.publishedAt.toISOString(),
        edges_created: result.edgesCreated,
        // Disclosed so the caller knows whether a model or a fallback produced
        // what was just published (R1's provenance concern).
        summary_generated: result.summaryGenerated,
        edges_generated: result.edgesGenerated,
      },
      null,
      2,
    ),
    {
      status: 201,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        location: absoluteUrl(`/i/${result.item.shortId}`),
        'cache-control': 'no-store',
      },
    },
  );
}
