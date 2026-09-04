# Attention Journal

Personal dual-audience musings site: Matt Wood–shaped chassis, Attention Journal operating system.

## Commands

```bash
npm ci
npm run dev
npm run test
npm run build:strict
npm run weekly
bash scripts/publish.sh content/items/<id>.md
```

## Content

- `content/items/` — public musings (`link` | `riff` | `essay`); `stance` required
- `content/trails/` — weekly-pass authored edges
- `content/themes/` — weekly-pass theme hubs
- `inbox/suggestions.yml` — private AI suggestions (git-ignored); see `inbox/suggestions.example.yml`

Machine surfaces after build: `/feed.json`, `/llms.txt`, `/openapi.json`, `/search-index.json`.

See `docs/weekly-pass.md` and `docs/plans/2026-09-04-001-feat-personal-musings-site-plan.md`.
