/**
 * Development seed.
 *
 * Publishes a small corpus through the real pipeline — same inserts, same
 * embedding, same edge selection — but supplies source prose inline so nothing
 * is fetched over the network. Source text is paraphrased fixture content, not
 * copied from any real page.
 *
 * A handful of typed edges are then asserted directly. The term-overlap
 * fallback judge can only ever propose `related_to`, so without these the
 * Tensions and Lines of development sections would have nothing to render and
 * four of the six edge types would go unexercised.
 *
 * Usage: npm run db:seed [-- --reset]
 */

import { randomUUID } from 'node:crypto';
import { query } from '../src/lib/db.ts';
import { publishEssay, publishLink, publishRiff } from '../src/lib/publish.ts';
import { recomputeDerived } from '../src/lib/derive.ts';
import { isEdgeType, type EdgeType } from '../src/lib/types.ts';

interface LinkSeed {
  kind: 'link';
  url: string;
  title: string;
  sourceText: string;
  commentary?: string;
  day: string;
}

interface RiffSeed {
  kind: 'riff';
  title: string;
  body: string;
  day: string;
}

interface EssaySeed {
  kind: 'essay';
  url: string;
  title: string;
  commentary: string;
  day: string;
}

const SEEDS: Array<LinkSeed | RiffSeed | EssaySeed> = [
  {
    kind: 'link',
    url: 'https://example.com/retrieval-latency-budget',
    title: 'A Latency Budget for Retrieval Pipelines',
    day: '2026-08-02',
    sourceText:
      'Retrieval pipelines fail on latency long before they fail on relevance. ' +
      'The author proposes a fixed latency budget for retrieval, allocating ' +
      'milliseconds across embedding, vector search, reranking, and prompt ' +
      'assembly. Reranking consumes most of the budget in practice, and the ' +
      'piece argues teams should measure each retrieval stage separately ' +
      'rather than reporting a single end-to-end number that hides where the ' +
      'time actually goes.',
  },
  {
    kind: 'link',
    url: 'https://example.com/rerankers-considered',
    title: 'Rerankers Are Usually the Wrong First Optimisation',
    day: '2026-08-05',
    commentary:
      'The latency argument here lands harder than the relevance one. Worth ' +
      'reading alongside the retrieval budget piece.',
    sourceText:
      'Teams reach for a reranking model when retrieval quality disappoints, ' +
      'but reranking adds latency to every query while improving only the ' +
      'tail. The author measures relevance gains against added latency across ' +
      'several retrieval configurations and finds that fixing chunking and ' +
      'embedding choice recovers most of the relevance a reranker would, at no ' +
      'latency cost. Reranking is presented as a late-stage optimisation.',
  },
  {
    kind: 'link',
    url: 'https://example.com/chunking-is-the-whole-game',
    title: 'Chunking Is the Whole Game',
    day: '2026-08-09',
    sourceText:
      'A study of retrieval quality across chunking strategies finds document ' +
      'segmentation dominates every other retrieval parameter, including the ' +
      'embedding model. Semantic chunking on section boundaries outperforms ' +
      'fixed-size windows substantially. The author concludes that retrieval ' +
      'relevance work should begin with chunking and only then consider ' +
      'embedding or reranking changes.',
  },
  {
    kind: 'riff',
    title: 'Retrieval is a data-modelling problem',
    day: '2026-08-11',
    body:
      'Every retrieval system I have debugged turned out to be a data-modelling ' +
      'problem wearing a machine-learning costume. The embedding model is ' +
      'rarely the constraint. What breaks is that nobody decided what a ' +
      'document *is* — so chunking is arbitrary, and arbitrary chunks retrieve ' +
      'arbitrarily.\n\nThe uncomfortable implication is that retrieval quality ' +
      'is mostly upstream of the retrieval pipeline, which means it is mostly ' +
      'not the ML team\u2019s to fix.',
  },
  {
    kind: 'link',
    url: 'https://example.com/embedding-drift-in-production',
    title: 'Embedding Drift in Production Search',
    day: '2026-08-14',
    sourceText:
      'When an embedding model is upgraded, previously indexed vectors become ' +
      'incomparable with newly computed ones, silently degrading retrieval ' +
      'relevance. The piece documents a production incident traced to a ' +
      'partial reindex, and recommends versioning the embedding model alongside ' +
      'the index so a mismatch fails loudly rather than degrading quietly.',
  },
  {
    kind: 'link',
    url: 'https://example.com/typed-knowledge-graphs',
    title: 'Typed Edges Beat Untyped Similarity',
    day: '2026-08-18',
    sourceText:
      'Similarity-only knowledge graphs collapse into hairballs because every ' +
      'node is somewhat similar to every other node. Assigning each edge a ' +
      'type and a written justification makes the graph legible and keeps its ' +
      'density in check. The author reports that requiring a stated reason per ' +
      'edge reduced edge count substantially while improving the usefulness of ' +
      'graph navigation.',
  },
  {
    kind: 'link',
    url: 'https://example.com/graph-visualisations-mislead',
    title: 'Most Knowledge Graph Visualisations Mislead',
    day: '2026-08-21',
    commentary:
      'A useful corrective. The force-directed layout is doing rhetoric, not ' +
      'analysis \u2014 clusters appear because of the physics, not the data.',
    sourceText:
      'Force-directed graph layouts imply structure that the underlying data ' +
      'does not contain: node proximity reflects simulation parameters as much ' +
      'as relatedness, and edge density overwhelms the eye past a few hundred ' +
      'links. The author argues that graph pages should be treated as ' +
      'navigation aids rather than analysis, and that typed local views of a ' +
      'single node communicate more than any global layout.',
  },
  {
    kind: 'riff',
    title: 'The graph is an index, not an argument',
    day: '2026-08-24',
    body:
      'I keep having to relearn this: a knowledge graph is an index. It tells ' +
      'you where to look. It does not tell you what is true, and a dense ' +
      'cluster is not evidence of a coherent idea \u2014 it is evidence that I ' +
      'read several things in a row.\n\nThe useful unit is the *typed local ' +
      'view*: this claim supports that one, this finding challenges that ' +
      'conclusion. That reads as an argument. The global picture only ever ' +
      'reads as weather.',
  },
  {
    kind: 'link',
    url: 'https://example.com/agent-readable-websites',
    title: 'Designing Websites for Agent Consumption',
    day: '2026-08-27',
    sourceText:
      'Sites intended to be read by agents as well as people should publish a ' +
      'structured feed, a plain-text index describing when the corpus is ' +
      'useful, and a documented query API. The author argues that agent ' +
      'readability is mostly a documentation problem rather than a protocol ' +
      'problem, and that a stable feed plus honest when-to-use guidance ' +
      'outperforms a bespoke integration.',
  },
  {
    kind: 'link',
    url: 'https://example.com/llms-txt-considered',
    title: 'What Belongs in llms.txt',
    day: '2026-08-30',
    sourceText:
      'A plain-text index for language models should state what a corpus ' +
      'covers, when an agent should reach for it, and when it should not. The ' +
      'author warns that listing every URL turns the file into a sitemap with ' +
      'no added judgement, and that the negative guidance \u2014 what this ' +
      'corpus is not good for \u2014 is the part agents most need and authors ' +
      'most often omit.',
  },
  {
    kind: 'link',
    url: 'https://example.com/content-negotiation-returns',
    title: 'Content Negotiation Is Suddenly Useful Again',
    day: '2026-09-01',
    commentary:
      'Twenty years of `Accept` being vestigial, and agents make it load-bearing ' +
      'overnight.',
    sourceText:
      'HTTP content negotiation went largely unused on the public web because ' +
      'browsers all wanted HTML. Agents want Markdown, and serving it from the ' +
      'same URL rather than a parallel path keeps one canonical address per ' +
      'resource. The piece walks through varying on Accept and returning 406 ' +
      'with a list of available representations for unsupported types.',
  },
  {
    kind: 'essay',
    url: 'https://example.com/essays/publishing-for-two-audiences',
    title: 'Publishing for Two Audiences',
    day: '2026-09-02',
    commentary:
      'Long-form version of what I have been circling for a month: the human ' +
      'page and the machine feed are the same content with different ' +
      'affordances, and treating either as a derivative of the other produces ' +
      'a worse version of both.',
  },
  {
    kind: 'link',
    url: 'https://example.com/summaries-need-provenance',
    title: 'Model-Written Summaries Need Provenance',
    day: '2026-09-03',
    sourceText:
      'When a summary is generated rather than written, readers cannot tell ' +
      'whether a claim comes from the source or from the model. The author ' +
      'recommends marking generated text distinctly and preserving the source ' +
      'prose so a summary can be re-derived and checked. Undisclosed generated ' +
      'commentary is described as a trust problem rather than a quality one.',
  },
  {
    kind: 'riff',
    title: 'Automated edges, authored voice',
    day: '2026-09-04',
    body:
      'Letting a model propose the connections between items but never the ' +
      'stance on them feels like the right split. The edge reason is a factual ' +
      'claim about two texts \u2014 checkable, and boring enough that I do not ' +
      'mind delegating it. The commentary is a position, and delegating a ' +
      'position is how a site stops being worth reading.',
  },
];

/** Typed edges the fallback judge cannot infer. Keyed by item title. */
const ASSERTED_EDGES: Array<{
  from: string;
  to: string;
  type: EdgeType;
  confidence: number;
  reason: string;
}> = [
  {
    from: 'Rerankers Are Usually the Wrong First Optimisation',
    to: 'A Latency Budget for Retrieval Pipelines',
    type: 'supports',
    confidence: 0.86,
    reason:
      'Both measure reranking as the dominant consumer of retrieval latency, ' +
      'and both conclude it should be optimised last rather than first.',
  },
  {
    from: 'Chunking Is the Whole Game',
    to: 'Rerankers Are Usually the Wrong First Optimisation',
    type: 'supports',
    confidence: 0.81,
    reason:
      'The finding that chunking dominates embedding choice reinforces the ' +
      'argument that relevance work should start upstream of reranking.',
  },
  {
    from: 'Retrieval is a data-modelling problem',
    to: 'Chunking Is the Whole Game',
    type: 'develops_into',
    confidence: 0.78,
    reason:
      'The claim that nobody decides what a document is becomes concrete in ' +
      'the chunking study, which measures exactly that decision.',
  },
  {
    from: 'Embedding Drift in Production Search',
    to: 'Chunking Is the Whole Game',
    type: 'challenges',
    confidence: 0.72,
    reason:
      'If an embedding upgrade alone can silently destroy relevance, embedding ' +
      'choice cannot be as secondary to chunking as the chunking study claims.',
  },
  {
    from: 'Most Knowledge Graph Visualisations Mislead',
    to: 'Typed Edges Beat Untyped Similarity',
    type: 'challenges',
    confidence: 0.75,
    reason:
      'Typed edges are offered as the fix for hairball graphs, but this piece ' +
      'argues the global layout misleads regardless of how the edges are typed.',
  },
  {
    from: 'The graph is an index, not an argument',
    to: 'Most Knowledge Graph Visualisations Mislead',
    type: 'develops_into',
    confidence: 0.83,
    reason:
      'The critique of force-directed layouts is carried forward into a ' +
      'positive claim that typed local views are the useful unit.',
  },
  {
    from: 'What Belongs in llms.txt',
    to: 'Designing Websites for Agent Consumption',
    type: 'develops_into',
    confidence: 0.8,
    reason:
      'The general argument that agent readability is a documentation problem ' +
      'is narrowed here to what a single index file should and should not say.',
  },
  {
    from: 'Content Negotiation Is Suddenly Useful Again',
    to: 'Designing Websites for Agent Consumption',
    type: 'supports',
    confidence: 0.77,
    reason:
      'Serving Markdown from the canonical URL is a concrete mechanism for the ' +
      'dual-audience publishing this piece advocates.',
  },
  {
    from: 'Model-Written Summaries Need Provenance',
    to: 'Publishing for Two Audiences',
    type: 'corrected_by',
    confidence: 0.7,
    reason:
      'The essay treats the human and machine renderings as equivalent, which ' +
      'overlooks that a generated summary needs disclosure the feed does not carry.',
  },
  {
    from: 'Automated edges, authored voice',
    to: 'Model-Written Summaries Need Provenance',
    type: 'supports',
    confidence: 0.88,
    reason:
      'Both draw the same line between delegating a checkable factual claim ' +
      'and delegating a stance the author should own.',
  },
  {
    from: 'Chunking Is the Whole Game',
    to: 'A Latency Budget for Retrieval Pipelines',
    type: 'superseded_by',
    confidence: 0.68,
    reason:
      'The stage-by-stage latency budget is largely subsumed by the finding ' +
      'that segmentation decides relevance before any stage timing matters.',
  },
];

function at(day: string): Date {
  // Spread items through the working day so ordering within a day is stable.
  return new Date(`${day}T12:00:00.000Z`);
}

async function reset(): Promise<void> {
  await query('DELETE FROM edges');
  await query('DELETE FROM themes');
  await query('DELETE FROM items');
}

async function main(): Promise<void> {
  if (process.argv.includes('--reset')) {
    await reset();
    console.log('cleared existing items, edges, and themes');
  }

  const existing = await query<{ count: string }>('SELECT count(*) AS count FROM items');
  if (Number(existing[0]?.count ?? 0) > 0) {
    console.log('items already present; pass --reset to replace them');
    process.exit(0);
  }

  const idsByTitle = new Map<string, string>();

  for (const seed of SEEDS) {
    const result =
      seed.kind === 'link'
        ? await publishLink({
            url: seed.url,
            title: seed.title,
            sourceText: seed.sourceText,
            sourceTitle: seed.title,
            commentary: seed.commentary,
            publishedAt: at(seed.day),
          })
        : seed.kind === 'riff'
          ? await publishRiff({
              title: seed.title,
              body: seed.body,
              publishedAt: at(seed.day),
            })
          : await publishEssay({
              url: seed.url,
              title: seed.title,
              commentary: seed.commentary,
              publishedAt: at(seed.day),
            });

    idsByTitle.set(seed.title, result.item.id);
    console.log(
      `  ${seed.kind.padEnd(5)} /i/${result.item.shortId}  ` +
        `${result.edgesCreated} edge(s)  ${seed.title}`,
    );
  }

  let asserted = 0;
  for (const edge of ASSERTED_EDGES) {
    const fromId = idsByTitle.get(edge.from);
    const toId = idsByTitle.get(edge.to);
    if (!fromId || !toId || !isEdgeType(edge.type)) {
      console.warn(`  ! skipped asserted edge: ${edge.from} -> ${edge.to}`);
      continue;
    }
    const rows = await query<{ id: string }>(
      `INSERT INTO edges (id, from_id, to_id, type, confidence, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (from_id, to_id, type) DO NOTHING
       RETURNING id`,
      [randomUUID(), fromId, toId, edge.type, edge.confidence, edge.reason],
    );
    if (rows.length > 0) asserted += 1;
  }

  await recomputeDerived();

  const [{ count: itemCount }] = await query<{ count: string }>(
    'SELECT count(*) AS count FROM items',
  );
  const [{ count: edgeCount }] = await query<{ count: string }>(
    'SELECT count(*) AS count FROM edges',
  );
  const themes = await query<{ short_id: string; title: string; item_count: number }>(
    `SELECT i.short_id, i.title, th.item_count FROM themes th
       JOIN items i ON i.id = th.hub_item_id
      ORDER BY th.item_count DESC`,
  );

  console.log(
    `\nseeded ${itemCount} items and ${edgeCount} edges ` +
      `(${asserted} asserted typed edges)`,
  );
  console.log(`themes promoted: ${themes.length}`);
  for (const theme of themes) {
    console.log(`  /themes/${theme.short_id}  ${theme.item_count} items  ${theme.title}`);
  }
  process.exit(0);
}

await main();
