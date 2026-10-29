# Karin Daily Next: standalone Cloudflare Worker prototype

**Live:** https://karin-daily-next.karin-laboratory.workers.dev/

An independently deployed prototype for replacing Karin Daily without modifying the existing Python/systemd/OCI service. It uses Cloudflare Worker + a *dedicated* KV namespace, with no database migrations or existing resource reuse. Inspired by the design patterns of [AI-gaiden](https://github.com/yo4e/AI-gaiden) (MIT) and [AI Daily Pulse](https://github.com/FavorPan/ai-daily-pulse) (MIT); it is a fresh implementation, not a wholesale merge.

## Implemented

- RSS 2.0, Atom and RDF feed collection from 11 configured domestic/Japanese-language sources (NHK, ITmedia, Impress, Publickey, Digital Agency, GIGAZINE).
- URL canonicalization and title-bigram similarity deduplication; related-source provenance.
- Deterministic recency, civic significance and topic-interest ranking, editorial 50/30/20 *target* mix for general news / IT / science (dependent on available feeds), category caps.
- Short RSS-provided descriptions (no scraping or article republishing), article source links.
- Responsive Japanese news page, category switching, RSS XML output, health/status/article APIs.
- Scheduled refresh every six hours; initial refresh on first GET. On complete feed failure, do not overwrite the last successful digest. Keep up to eight days of source articles in the KV snapshot.
- HTML escaping, URL scheme validation, minimal CSP, no public write/refresh API.

## Endpoints

- `/` and `/?category=ai` for human-readable news.
- `/api/health` for the status of the deployed code.
- `/api/status` for source health, article count, update timestamp and algorithm.
- `/api/articles?category=domestic&limit=20` for machine-readable entries.
- `/rss.xml` for generated feed of selected articles.

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
