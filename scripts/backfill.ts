/**
 * Rebuild the derived half of the corpus.
 *
 * Everything an item carries beyond what was captured — its summary, its
 * embedding, its edges — is produced by a model, and models and prompts change.
 * When they do, the corpus is inconsistent: items published last month were
 * judged by a different reader than items published today, and the graph mixes
 * the two without saying so. This re-runs the whole pass so the corpus is
 * internally consistent again.
 *
 * Nothing captured is touched. Titles, commentary, URLs, tags, and publication
 * dates come from the author and are never regenerated. Neither are edges
 * asserted by hand: only `origin = 'generated'` rows are cleared before the
 * judging pass, which is what the origin column exists for.
 *
 * Usage:
 *   npm run backfill                      re-embed and re-connect everything
 *   npm run backfill -- --resummarise     also rewrite link summaries
 *   npm run backfill -- --dry-run         report what would change
 *   npm run backfill -- --limit 10        stop after N items, to cost it first
 */

import { finish, query } from '../src/lib/db.ts';
import { connectItem } from '../src/lib/publish.ts';
import { recomputeDerived } from '../src/lib/derive.ts';
import { generateSummary, isLlmConfigured } from '../src/lib/llm.ts';
import { isEmbeddingProviderConfigured } from '../src/lib/embeddings.ts';
import { asBlockquote, splitBody } from '../src/lib/markdown.ts';
import type { Item } from '../src/lib/types.ts';

interface Options {
  resummarise: boolean;
  dryRun: boolean;
  limit: number | null;
}

function parseOptions(argv: readonly string[]): Options {
  const limitIndex = argv.indexOf('--limit');
  const limit =
    limitIndex === -1 ? null : Number.parseInt(argv[limitIndex + 1] ?? '', 10);

  return {
    resummarise: argv.includes('--resummarise') || argv.includes('--resummarize'),
    dryRun: argv.includes('--dry-run'),
    limit: Number.isFinite(limit) && limit !== null && limit > 0 ? limit : null,
  };
}

interface Row {
  id: string;
  short_id: string;
  type: string;
  title: string | null;
  content: string;
  url: string | null;
  source_text: string | null;
  published_at: unknown;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  console.log(
    `embeddings: ${isEmbeddingProviderConfigured() ? 'model' : 'local fallback'}, ` +
      `judge: ${isLlmConfigured() ? 'model' : 'term-overlap fallback'}`,
  );
  if (options.dryRun) console.log('dry run: nothing will be written\n');

  const rows = await query<Row>(
    `SELECT id, short_id, type, title, content, url, source_text, published_at
       FROM items
      WHERE status = 'published'
      ORDER BY published_at ASC, id ASC
      ${options.limit === null ? '' : `LIMIT ${options.limit}`}`,
  );

  if (rows.length === 0) {
    console.log('nothing to backfill');
    return;
  }

  const [{ count: generatedEdges }] = await query<{ count: string }>(
    `SELECT count(*) AS count FROM edges WHERE origin = 'generated'`,
  );
  const [{ count: assertedEdges }] = await query<{ count: string }>(
    `SELECT count(*) AS count FROM edges WHERE origin = 'asserted'`,
  );

  console.log(
    `${rows.length} items; clearing ${generatedEdges} generated edges, ` +
      `keeping ${assertedEdges} asserted\n`,
  );

  if (options.dryRun) {
    for (const row of rows) {
      const resummarisable =
        options.resummarise && row.type === 'link' && Boolean(row.source_text);
      const steps = ['re-embed', 're-connect'];
      if (resummarisable) steps.splice(1, 0, 're-summarise');
      console.log(
        `  /i/${row.short_id}  ${row.type.padEnd(5)}  ${steps.join(', ')}` +
          (options.resummarise && !resummarisable && row.type === 'link'
            ? '  (no stored source text; summary kept as captured)'
            : ''),
      );
    }
    return;
  }

  // Clear first, so the judging pass sees a clean slate and cannot merely
  // re-confirm what a previous prompt decided.
  await query(`DELETE FROM edges WHERE origin = 'generated'`);

  let resummarised = 0;
  let edgesCreated = 0;

  for (const [index, row] of rows.entries()) {
    let content = row.content;

    if (options.resummarise && row.type === 'link' && row.source_text) {
      const { summary, commentary } = splitBody(row.content);
      const regenerated = await generateSummary({
        url: row.url ?? '',
        sourceTitle: row.title ?? undefined,
        text: row.source_text,
      });

      // A degraded summariser must not overwrite a good summary with a worse
      // one. Only take the new text when a model actually produced it.
      if (regenerated.generated && regenerated.summary.trim().length > 0) {
        content = [asBlockquote(regenerated.summary), commentary]
          .filter(Boolean)
          .join('\n\n');
        await query('UPDATE items SET content = $2, updated_at = now() WHERE id = $1', [
          row.id,
          content,
        ]);
        resummarised += 1;
      } else if (summary.length === 0) {
        console.warn(`  /i/${row.short_id}: no summary available, left as captured`);
      }
    }

    const item: Item = {
      id: row.id,
      shortId: row.short_id,
      type: row.type as Item['type'],
      title: row.title,
      content,
      url: row.url,
      tags: [],
      publishedAt:
        row.published_at instanceof Date
          ? row.published_at
          : new Date(String(row.published_at)),
      updatedAt: null,
      edgeCount: 0,
    };

    const result = await connectItem(item);
    edgesCreated += result.edgesCreated;

    console.log(
      `  [${String(index + 1).padStart(String(rows.length).length)}/${rows.length}] ` +
        `/i/${row.short_id}  ${result.edgesCreated} edge(s)  ` +
        (row.title ?? `untitled ${row.type}`),
    );
  }

  await recomputeDerived();
  const [{ count: themeCount }] = await query<{ count: string }>(
    'SELECT count(*) AS count FROM themes',
  );

  console.log(
    `\nre-embedded ${rows.length} items` +
      (options.resummarise ? `, re-summarised ${resummarised}` : '') +
      `, wrote ${edgesCreated} generated edges`,
  );
  console.log(`themes after recompute: ${themeCount}`);
  console.log(
    '\nStatic pages are now stale. Redeploy, or POST to /api/ingest once to ' +
      'trigger revalidation.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
    await finish();
  } catch (error) {
    console.error(error);
    await finish(1);
  }
}
