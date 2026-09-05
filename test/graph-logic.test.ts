import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectEdges, type EdgeProposal } from '../src/lib/llm.ts';
import { groupConnections } from '../src/lib/queries.ts';
import { themeBudget } from '../src/lib/derive.ts';
import { EDGE_TYPES, edgeTypesForSection, isEdgeType } from '../src/lib/types.ts';
import type { ResolvedEdge } from '../src/lib/types.ts';
import { asBlockquote, displayDomain, excerpt, markdownToText } from '../src/lib/markdown.ts';
import { groupByDay } from '../src/lib/dates.ts';
import { localEmbedding, sharedTerms, tokenize } from '../src/lib/embeddings.ts';
import { isShortId, isUuid, shortIdFromUuid } from '../src/lib/shortid.ts';

function edge(overrides: Partial<ResolvedEdge> = {}): ResolvedEdge {
  return {
    edgeId: Math.random().toString(36).slice(2),
    type: 'related_to',
    direction: 'outgoing',
    confidence: 0.7,
    reason: 'A stated reason.',
    otherId: 'id',
    otherShortId: 'abcd1234',
    otherTitle: 'Other item',
    otherType: 'link',
    ...overrides,
  };
}

function proposal(overrides: Partial<EdgeProposal> = {}): EdgeProposal {
  return {
    targetId: Math.random().toString(36).slice(2),
    type: 'related_to',
    confidence: 0.7,
    reason: 'A stated reason.',
    ...overrides,
  };
}

describe('edge type metadata', () => {
  it('assigns every declared type a theme section or none', () => {
    // The reference site leaves superseded_by out of its published spec and
    // defines corrected_by only in a colour map. Both must be fully wired here.
    for (const type of EDGE_TYPES) {
      assert.ok(isEdgeType(type));
    }
    assert.deepEqual(edgeTypesForSection('tensions'), ['challenges', 'corrected_by']);
    assert.deepEqual(edgeTypesForSection('development'), [
      'develops_into',
      'superseded_by',
    ]);
  });

  it('covers all six types across the two sections plus the neutral ones', () => {
    const sectioned = [
      ...edgeTypesForSection('tensions'),
      ...edgeTypesForSection('development'),
    ];
    const neutral = EDGE_TYPES.filter((type) => !sectioned.includes(type));
    assert.deepEqual(neutral.sort(), ['related_to', 'supports']);
    assert.equal(sectioned.length + neutral.length, EDGE_TYPES.length);
  });
});

describe('groupConnections', () => {
  it('labels outgoing edges actively and incoming edges passively', () => {
    const groups = groupConnections([
      edge({ type: 'supports', direction: 'outgoing' }),
      edge({ type: 'supports', direction: 'incoming' }),
    ]);
    assert.deepEqual(
      groups.map((group) => group.label).sort(),
      ['Supported by', 'Supports'],
    );
  });

  it('collapses related_to into one group, since it reads the same both ways', () => {
    const groups = groupConnections([
      edge({ type: 'related_to', direction: 'outgoing' }),
      edge({ type: 'related_to', direction: 'incoming' }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.label, 'Related to');
    assert.equal(groups[0]!.edges.length, 2);
  });

  it('orders high-signal relationships before generic relatedness', () => {
    const groups = groupConnections([
      edge({ type: 'related_to', direction: 'outgoing' }),
      edge({ type: 'challenges', direction: 'outgoing' }),
      edge({ type: 'supports', direction: 'outgoing' }),
    ]);
    assert.deepEqual(groups.map((group) => group.type), [
      'challenges',
      'supports',
      'related_to',
    ]);
  });

  it('renders every incoming direction with its own inverse label', () => {
    const groups = groupConnections([
      edge({ type: 'develops_into', direction: 'incoming' }),
      edge({ type: 'superseded_by', direction: 'incoming' }),
      edge({ type: 'corrected_by', direction: 'incoming' }),
      edge({ type: 'challenges', direction: 'incoming' }),
    ]);
    assert.deepEqual(groups.map((group) => group.label), [
      'Challenged by',
      'Developed from',
      'Supersedes',
      'Corrects',
    ]);
  });
});

describe('selectEdges', () => {
  it('discards proposals below the confidence floor', () => {
    const selected = selectEdges([
      proposal({ confidence: 0.9 }),
      proposal({ confidence: 0.2 }),
      proposal({ confidence: 0.54 }),
    ]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.confidence, 0.9);
  });

  it('caps edges per item, keeping the most confident', () => {
    const selected = selectEdges(
      Array.from({ length: 30 }, (_, index) =>
        proposal({ confidence: 0.6 + index * 0.01 }),
      ),
    );
    // Default cap is 8; the guard against a related_to hairball.
    assert.equal(selected.length, 8);
    assert.ok(selected.every((edgeProposal) => edgeProposal.confidence >= 0.79));
  });

  it('keeps only the most confident edge per target', () => {
    const selected = selectEdges([
      proposal({ targetId: 'same', type: 'related_to', confidence: 0.7 }),
      proposal({ targetId: 'same', type: 'supports', confidence: 0.95 }),
    ]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.type, 'supports');
  });

  it('returns nothing when every proposal is weak', () => {
    assert.deepEqual(selectEdges([proposal({ confidence: 0.1 })]), []);
  });
});

describe('themeBudget', () => {
  it('promotes nothing on a corpus too small to have hubs', () => {
    assert.equal(themeBudget(0), 0);
    assert.equal(themeBudget(3), 0);
  });

  it('scales sub-linearly, so themes stay a minority of the corpus', () => {
    assert.equal(themeBudget(14), 4);
    assert.equal(themeBudget(160), 13);
    assert.equal(themeBudget(1000), 32);
    // The whole point: a growing corpus does not turn the themes index into a
    // second copy of the stream.
    for (const count of [20, 100, 500, 2000]) {
      assert.ok(themeBudget(count) < count / 3);
    }
  });
});

describe('markdown helpers', () => {
  it('wraps prose as a blockquote, preserving paragraph breaks', () => {
    assert.equal(asBlockquote('One.\n\nTwo.'), '> One.\n>\n> Two.');
  });

  it('strips blockquote markers when flattening to text', () => {
    // Descriptions on the reference site begin with a stray "> "; this is the
    // check that ours do not.
    assert.equal(markdownToText('> A summary.'), 'A summary.');
    assert.ok(!excerpt('> A summary of the thing.').startsWith('>'));
  });

  it('removes embedded HTML rather than passing it through', () => {
    assert.equal(markdownToText('<b>bold</b> text'), 'bold text');
  });

  it('shows source domains without the www prefix', () => {
    assert.equal(displayDomain('https://www.example.com/a/b?c=d'), 'example.com');
    assert.equal(displayDomain('not a url'), 'not a url');
  });

  it('truncates on a word boundary', () => {
    const result = excerpt('alpha beta gamma delta epsilon', 14);
    assert.ok(result.endsWith('\u2026'));
    assert.ok(result.length <= 15);
  });
});

describe('groupByDay', () => {
  it('groups consecutive items and preserves incoming order', () => {
    const records = [
      { at: new Date('2026-09-04T18:00:00Z') },
      { at: new Date('2026-09-04T09:00:00Z') },
      { at: new Date('2026-09-03T09:00:00Z') },
    ];
    const groups = groupByDay(records, (record) => record.at);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]!.records.length, 2);
    assert.equal(groups[0]!.key, '2026-09-04');
    assert.equal(groups[1]!.key, '2026-09-03');
  });

  it('groups by UTC day, so a late-evening item does not drift', () => {
    const groups = groupByDay(
      [{ at: new Date('2026-09-04T23:30:00Z') }, { at: new Date('2026-09-04T00:30:00Z') }],
      (record) => record.at,
    );
    assert.equal(groups.length, 1);
  });
});

describe('local embedding fallback', () => {
  it('produces a unit vector of the requested width', () => {
    const vector = localEmbedding('retrieval latency and reranking', 64);
    assert.equal(vector.length, 64);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
  });

  it('stays defined for text with no significant terms', () => {
    const vector = localEmbedding('a the of', 32);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
  });

  it('is deterministic, so re-embedding does not churn the graph', () => {
    assert.deepEqual(localEmbedding('same text', 32), localEmbedding('same text', 32));
  });

  it('drops stopwords and short tokens when tokenising', () => {
    assert.deepEqual(tokenize('The retrieval of a document'), ['retrieval', 'document']);
  });

  it('reports genuinely shared terms, most weighted first', () => {
    const shared = sharedTerms(
      'retrieval latency reranking retrieval',
      'reranking adds retrieval latency',
    );
    assert.deepEqual(shared.slice(0, 3).sort(), ['latency', 'reranking', 'retrieval']);
  });

  it('reports nothing shared between unrelated texts', () => {
    assert.deepEqual(sharedTerms('quantum chromodynamics', 'sourdough baking'), []);
  });
});

describe('identifiers', () => {
  it('accepts short ids and uuids as public identifiers', () => {
    assert.ok(isShortId('0d82be51'));
    assert.ok(!isShortId('0D82BE51'));
    assert.ok(!isShortId('0d82be5'));
    assert.ok(isUuid('0d82be51-1234-4abc-8def-0123456789ab'));
    assert.ok(!isUuid('0d82be51'));
  });

  it('derives the short id from the uuid prefix', () => {
    assert.equal(shortIdFromUuid('0D82BE51-1234-4abc-8def-0123456789ab'), '0d82be51');
  });
});
