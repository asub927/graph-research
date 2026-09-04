# Weekly compounding pass

1. Capture freely during the week with `scripts/publish.sh content/items/<id>.md`.
2. Optionally fill `inbox/suggestions.yml` (git-ignored) from offline AI suggestions using `inbox/suggestions.example.yml` as the shape.
3. Run `npm run weekly`.
4. Fill required `reason` / `currentThinking` fields in scaffolded trail/theme files.
5. Run `npm run verify:content && npm run build`.
6. Commit trails/themes only after they build cleanly.

Skip the pass when the inbox is empty — publishing habit does not require weekly graph work.
