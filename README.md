# graph-research

A dual-audience "For Your Information" site: a chronological stream of links,
riffs, and essays — every one carrying commentary — sitting on top of an
LLM-generated typed edge graph that derives theme hubs, tension lists, and a
most-connected leaderboard. Everything a person can read, an agent can read too,
from the same data.

Built to the plan in
[`docs/plans/2026-09-04-001-feature-fyi-site-plan.md`](docs/plans/2026-09-04-001-feature-fyi-site-plan.md).

## Running it

```bash
npm install
cp .env.example .env.local     # then set INGEST_TOKEN at minimum
npm run db:migrate
npm run db:seed                # optional: a small corpus to look at
npm run dev
```

No database server is needed for local work. With `DATABASE_URL` unset the app
runs against [PGlite](https://pglite.dev), an in-process WASM Postgres that
loads the same `vector` extension and speaks the same SQL, storing its data
under `.pgdata/`. Set `DATABASE_URL` and the identical queries run against real
Postgres.

One consequence of PGlite being in-process: `.pgdata/` takes a single writer,
so `npm run build` fails to read the database while `npm run dev` or
`npm start` is still holding it. Stop the server first. This is a local-only
constraint — nothing about it applies to a `DATABASE_URL` deployment.

Without `LLM_API_KEY` the pipeline still works end to end: summaries become
extractive and edges fall back to term overlap. Every surface that depends on
either says which one it got, rather than presenting a degraded result as a
model's judgement.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build, prerendering every page from the database |
| `npm run db:migrate` | Apply `db/migrations/*.sql` in order, once each |
| `npm run db:seed` | Populate a small corpus. `-- --reset` replaces what is there |
| `npm run backfill` | Re-embed and re-connect the whole corpus. `-- --dry-run` first |
| `npm test` | Unit tests plus database-backed tests on a throwaway PGlite instance |
| `npm run typecheck` / `npm run lint` | The usual |

## Publishing something

`POST /api/ingest` with `Authorization: Bearer $INGEST_TOKEN`. There is also a
small form at `/admin`.

```bash
curl -X POST localhost:3000/api/ingest \
  -H "authorization: Bearer $INGEST_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"kind":"link","url":"https://example.com/a","commentary":"Why this mattered."}'
```

Three shapes: `link` (fetched, extracted, summarised), `riff` (written here, no
source), and `essay` (a pointer to longer writing elsewhere, commentary
required). Behind any of them the pipeline embeds the item, pulls its nearest
neighbours as edge candidates, has a model assign each one a type, a confidence,
and a written reason, applies a confidence floor and a per-item cap, then
recomputes edge counts and theme eligibility and revalidates the affected pages.

Posting a URL that is already published refreshes that item instead of creating
a second one: same permalink, same publication date, `updated_at` set, and a
`200` with `"created": false` rather than a `201`. The regenerated part is the
blockquote summary; commentary is only replaced if the repeat supplies new
commentary. So a retry after a timeout is safe, and re-running the pipeline over
one item converges rather than accumulating duplicates.

## How it is put together

```
src/lib/         domain: db, queries, publish pipeline, llm, embeddings, derive
src/app/         routes: pages, the query API, feeds, and generated documents
src/components/  rendering, including the four client components
db/migrations/   schema, applied in filename order
scripts/         migrate, seed, backfill
test/            pure logic, database-backed behaviour, and the published contract
```

Three tables. **Items** carry the content, an embedding, and a denormalised
connection count. **Edges** are stored once and directional, with a type, a
confidence, and a reason that is published verbatim — and an `origin` marking
whether a model or a person asserted it, which is what lets the backfill rebuild
the generated half without touching curated links. **Themes** are derived: an
item that accumulates enough connections becomes a hub, and the hub plus its
neighbours is a theme. There is no tag taxonomy.

`src/lib/types.ts` holds the edge vocabulary, and it is the single source of
truth for the OpenAPI enum, the directional labels on item pages, the graph
legend colours, and which conditional theme section each type feeds. Adding a
type there wires it through every surface at once, and a test asserts the
published spec matches what the code emits.

## The agent surface

| Path | What it is |
| --- | --- |
| `/llms.txt` | When this corpus is useful and when it is not. Start here |
| `/feed.json` | JSON Feed 1.1, whole corpus, with a `_fyi` extension per item |
| `/feed.xml` | Atom, with full rendered content |
| `/index.md` | The site as Markdown. Any page serves it for `Accept: text/markdown` |
| `/agents` | A copyable, self-dating context block for a system prompt |
| `/docs` | The query API in prose, with a worked `curl` per endpoint |
| `/openapi.json` | OpenAPI 3.1, generated from the handlers' own schemas |
| `/api/fyi/q/*` | Six read-only endpoints. Public, no key, problem+json errors |

Identifiers are path segments rather than query parameters, because some agent
fetch tools strip query strings that look like ids. An `Accept` header naming
only types this site does not serve gets a 406 listing the ones it does.

## Deploying

Vercel plus any Postgres with `pgvector` (Neon and Supabase both qualify). Set
`DATABASE_URL`, `SITE_URL`, `INGEST_TOKEN`, and the LLM credentials; the build
command in `vercel.json` runs migrations first. Pages are statically rendered
and revalidated on publish, so readers get cached documents and the database is
only touched by the API and the pipeline.
