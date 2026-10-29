# Karin Daily Next: standalone Cloudflare Worker prototype

**Live:** https://karin-daily-next.karin-laboratory.workers.dev/

An independently deployed prototype for replacing Karin Daily without modifying the existing Python/systemd/OCI service. It uses Cloudflare Worker + a *dedicated* KV namespace, with no database migrations or existing resource reuse. Inspired by the design patterns of [AI-gaiden](https://github.com/yo4e/AI-gaiden) (MIT) and [AI Daily Pulse](https://github.com/FavorPan/ai-daily-pulse) (MIT); it is a fresh implementation, not a wholesale merge.

## Implemented

- RSS 2.0, Atom and RDF feed collection from 11 configured domestic/Japanese-language sources (NHK, ITmedia, Impress, Publickey, Digital Agency, GIGAZINE).
- URL canonicalization and title-bigram similarity deduplication; related-source provenance.
- Deterministic recency, civic significance and topic-interest ranking, editorial 50/30/20 *target* mix for general news / IT / science (dependent on available feeds), category caps.
- Short RSS-provided descriptions (no scraping or article republishing), article source links.
- Responsive Japanese newspaper: **ヘッドライン** is the default front page, with 18 cross-sector selected headlines, plus dedicated category tabs (国内・社会, 国際, 経済, AI・生成AI, テクノロジー, 通信・開発, PC・機材, 科学・医療). Visible tab counts and active-page indicators; lead story appears only once.
- RSS XML output, health/status/article APIs.
- Scheduled refresh every six hours; initial refresh on first GET. On complete feed failure, do not overwrite the last successful digest. Keep up to eight days of source articles in the KV snapshot.
- HTML escaping, URL scheme validation, minimal CSP, no public write/refresh API.

## Endpoints

- `/` for the cross-sector **ヘッドライン** front page, prioritizing newsworthiness while reserving slots for news from five broad sections.
- `/?category=domestic`, `/?category=world`, `/?category=ai` (and other tab IDs) for category-specific news. The former `?category=all` URL now falls back to the headline front page in the UI.
- `/api/health` for the status of the deployed code.
- `/api/status` for source health, article count, update timestamp and algorithm.
- `/api/articles?category=headlines` returns the selected headline edition; `/api/articles?category=all` remains backwards-compatible and returns the complete stored set; `/api/articles?category=domestic&limit=20` returns a specific section.
- `/rss.xml` for generated feed of selected articles.

## Headlines and category tabs

The headlines edition selects up to 18 relevant articles: domestic 5, economy 3, world 2, IT/AI 6, science 2. Any unused capacity is filled from the remaining ranked articles. This makes the editorial mix an *upper slot target*, not a guarantee when RSS supply is scarce. Headlines are never a separate RSS source: category tabs read from the same stored articles, so source attribution, score and timestamps remain consistent.

## Development

- `node --check src/index.js`
- `node --test tests/*.test.mjs`
- `npx wrangler dev --config wrangler.jsonc` (local KV binding)
- `npx wrangler deploy --config wrangler.jsonc` (requires an authenticated Wrangler CLI / Cloudflare API token)

The Worker was initially deployed by the Cloudflare management API. The branch includes a CI workflow; GitHub Actions deploy requires the repository secret `CLOUDFLARE_API_TOKEN` to be supplied with appropriate Workers Scripts Edit permission. Do not commit tokens.

## Editorial notes

Source feeds and their quoted descriptions are third-party data. Respect each provider's feed terms; the prototype does not retrieve article body HTML. Editorial quality and coverage are not guarantees. The Japanese news mix is a target, not an exact enforced percentage if science coverage is sparse. Source URLs are configurable in `src/index.js` under `SOURCES`. User interests are under `PROFILE`. No external AI API key is provisioned, so current ranking and summaries are **not LLM-generated**. The Daily Pulse-inspired filtering and dedup architecture works deterministically; importing an LLM reranker/summary layer remains a separate production milestone.

## Existing infrastructure

The old `karin-daily` service, its local SQLite database, `karin-ai`, Cloudflare Tunnel, routes, and all existing D1 databases are untouched. This Worker is on a separate `workers.dev` subdomain and a separately created KV namespace. The D1 account limit (10) is why KV was used.
