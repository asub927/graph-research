---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
date: 2026-09-04
topic: dual-audience FYI site with an LLM-built knowledge graph
reference: https://mattwood.fyi
---

# Dual-Audience FYI Site - Plan

## Goal Capsule

**Objective.** Build a personal "For Your Information" site: a chronological stream of
annotated links and original riffs, sitting on top of an LLM-generated typed knowledge
graph that derives theme hubs, tension lists, and a most-connected leaderboard — published
simultaneously for human readers and for agents, via a complete machine-readable surface.

**Product authority.** Anantha. Modelled on [mattwood.fyi](https://mattwood.fyi), whose
live surfaces were probed directly on 2026-09-04; findings from that probe are treated as
requirements below.

**Active scope.** The full site: capture, publish pipeline, human pages, derived structure,
agent surface, and read-only query API. Long-form essays remain out of scope — the reference
points offsite for those, and so do we.

**Open blockers.** None. Stack, capture model, and AI automation level are all settled.

## Product Contract

### Key Decisions

- **Stack** — Next.js (App Router) on Vercel, Postgres with `pgvector`.
  `session-settled: chosen from a four-option comparison against static-first, Cloudflare,
  and stack-agnostic alternatives; picked as the closest match to the reference's
  publish-time-regeneration model while still serving a live query API.`
- **Capture** — mirror the reference: an authenticated ingest path where a pasted URL is
  fetched, summarized, embedded, and connected automatically. Explicitly *not*
  Markdown-in-Git.
  `session-settled: user directed "how it is done in the site" when offered
  Markdown-in-Git, an admin UI, an ingest pipeline, or a hybrid.`
- **AI automation** — full. On publish an LLM writes the summary, proposes typed edges with
  confidence and a written reason, and theme eligibility is recomputed. No human approval
  queue.
  `session-settled: chosen over suggest-and-approve, manual-only, and defer-the-graph.`

This supersedes the prior ideation doc
([docs/ideation/2026-09-04-personal-musings-site-ideation.md](../ideation/2026-09-04-personal-musings-site-ideation.md)),
which recommended deferring the agent API and keeping edges human-authored. Both of those
recommendations are reversed by the decisions above.

### Requirements

**R1 — Commentary is mandatory.** No naked URLs are publishable. Every item carries a
blockquote summary; author commentary, when added, renders as a bare paragraph after the
blockquote. A standing disclaimer ("Links indicate relevance, not agreement") appears
site-wide.

**R2 — Items are typed.** `riff | link | essay`. Unlike the reference — where the enum
exists but all 160 items are `link` — riffs are a first-class capture path and render in
the stream.

**R3 — Edges are typed, directional, confidence-scored, and carry a written reason.** Six
types: `supports`, `challenges`, `develops_into`, `related_to`, `superseded_by`,
`corrected_by`. All six are documented and rendered; the reference leaves the last two
half-wired.

**R4 — Connections render with inverse labels.** Outgoing `supports` reads "Supports";
incoming reads "Supported by". Backlinks merge into the same connections block rather than
a separate section.

**R5 — Themes are derived, not authored.** A theme is a hub item that has accumulated
enough connections; its public ID *is* the hub item's short ID. Membership comes from the
hub's edge neighborhood. There is no tag taxonomy. The hub threshold is configurable.

**R6 — Theme sections are conditional.** `challenges` edges within a cluster render as
"Tensions" (`A vs B — reason`); `develops_into` edges render as "Lines of development"
(`A → B — reason`). A theme with neither shows neither.

**R7 — Connection counts are a visible affordance.** An edge-count badge appears beside
each stream item's permalink, and is reused on the themes index and the connected
leaderboard.

**R8 — The stream is classically paginated.** 25 items per page at `/page/N/`, with
older/newer links and `rel=prev`/`rel=next`. No infinite scroll. Regeneration must prune
pages that no longer exist, so a stale orphan page cannot persist (the reference serves one).

**R9 — Two feeds with distinct jobs.** Atom (`/feed.xml`) carries full HTML content for
human readers; JSON Feed 1.1 (`/feed.json`) carries a per-item `_fyi` extension for agents.

**R10 — Content negotiation is a feature.** `Accept: text/markdown` returns a Markdown
representation of any page; an unsupported Accept type returns 406 with a plain-text list
of available representations. Responses vary on `Accept`.

**R11 — The 404 is agent-facing.** Served as Markdown listing the machine-readable entry
points with a one-line explanation of each.

**R12 — Crawlers are segmented editorially.** Answer-engine and user-triggered agents are
allowed; training-only crawlers are disallowed.

**R13 — The agent context block regenerates on every publish**, embedding a generation
timestamp, the most recent items, and self-invalidating guidance.

**R14 — Path-based API endpoints are preferred** over query strings for identifiers,
because some agent fetch tools strip query params that look like IDs.

**R15 — The query API is public, read-only, unauthenticated**, and returns
`application/problem+json` on error. Documented rate limits must match enforced ones — the
reference's docs claim none while its headers advertise a policy.

**R16 — No JavaScript by default.** Permitted exceptions: the random-item redirect, the
search page, the graph visualization, and the copy-to-clipboard control on the agent page.
Each must degrade without JS.

**R17 — Correct document semantics.** One `<h1>` per page naming the page subject (not the
site tagline), one `<main>`, item titles as real headings, and `<time datetime=...>`. The
reference inverts all of these.

**R18 — Structured data per resource.** A site-wide `@graph` (`Person`, `Organization`,
`WebSite`, `FAQPage`) plus per-item `Article` and per-theme `CollectionPage`, which the
reference omits. A real ~1200x630 OpenGraph card, not a 24px icon.

**R19 — Privacy and security baseline.** Zero cookies, analytics, or trackers. Dark mode
via `prefers-color-scheme`. Baseline security headers, which the reference ships without.

**R20 — Stable permalinks.** Every item is addressable at `/i/{shortId}` forever. The API
accepts both short ID and full UUID.

### Flows

**Publish.** Author submits a URL (or composes a riff) to an authenticated ingest endpoint.
The pipeline fetches and extracts readable content, asks an LLM for a title and blockquote
summary, computes an embedding, retrieves nearest neighbors, asks an LLM to assign an edge
type, confidence, and reason for each candidate, persists item and edges, recomputes theme
eligibility and connection counts, then revalidates affected pages and regenerates the
feeds, `llms.txt`, sitemap, and agent context block.

**Human read.** Visitor lands on the stream, scans day-grouped items with commentary, opens
a permalink, and follows typed connections outward — or enters through a theme hub, the
connected leaderboard, semantic search, the graph, or a random item.

**Agent read.** Agent fetches `/llms.txt` for orientation, `/feed.json` for the corpus, or
queries `/api/fyi/q/*` for search, filtering, connections, and a graph summary — with
`/openapi.json` describing the contract.

### Acceptance Examples

- Publishing a URL with no commentary is rejected; the summary is required before it
  becomes public.
- An item with six connections shows a `6` badge in the stream, and its permalink groups
  those six under directional headings with each reason sentence visible.
- A theme page whose cluster contains no `challenges` edges renders no Tensions section.
- `curl -H 'Accept: text/markdown' /` returns Markdown; `-H 'Accept: application/json'`
  returns 406 listing `text/html` and `text/markdown`.
- `/api/fyi/q/edges/{shortId}` and `/api/fyi/q/edges/{uuid}` return the same edges.
- Requesting a nonexistent path returns a Markdown 404 naming `/llms.txt` and `/feed.json`.
- With JavaScript disabled, every page except the graph remains fully readable, and
  `/random` offers a link to the stream.

### Non-Goals

- Long-form essay hosting (points offsite, as the reference does).
- Multi-author support, comments, or any social feature.
- A human approval queue for AI-proposed edges (explicitly decided against).
- A tag taxonomy — structure emerges from the edge graph instead.

### Assumptions

- An LLM provider and an embedding model are available at ingest time. Prompt and model
  choices are tunable, and a backfill path exists for when they change.
- Corpus size stays in the low thousands of items, so nearest-neighbor search over
  `pgvector` needs no sharding.

### Outstanding Questions

- The hub threshold for theme promotion is configurable; the starting value needs tuning
  against a real corpus rather than being fixed now.
- The graph payload filter rule (one link per pair vs. a confidence floor) affects what the
  visualization communicates. The reference drops roughly two-thirds of its edges to keep
  the page at 141KB.

## How This Work Fits Together

The site is one coherent unit: capture feeds the pipeline, the pipeline builds the graph,
and the graph is what every derived surface reads from. The human pages and the agent
surface are two renderings of the same data, which is why they ship together rather than
one after the other. Long-form essays sit outside this boundary and stay there.
