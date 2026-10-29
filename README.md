# Karin Daily

## 現行版 / Current production (2026-10-29)

**公開サイト:** https://daily.karin-lab.com/

現在の正式版は**Cloudflare Worker + 専用Workers KV**です。国内ニュースのヘッドライン、AI・開発・科学などの分野別タブ、ジャンク機材のハックや再活用に絞った情報、ダークモードを提供します。記事一覧は1段組で、本文抜粋を20pxで表示します。通常6時間ごとにRSSを更新します。

- [刷新の意図・経緯・議論・結果（2026-10-29の開発記録）](docs/history/2026-10-29-karin-daily-renewal.md)
- [現行Workerの仕様・開発方法](prototype/cloudflare-worker/README.md)
- [本番切替と旧版への復旧手順（未完了の旧SQLiteバックアップを含む）](docs/operations/2026-10-29-karin-daily-cutover.md)
- [旧Python版の保存ブランチ](https://github.com/Karin-Laboratory/karin-daily/tree/archive/legacy-karin-daily-2026-10-29)
- [Worker移行PR #1（マージ済み）](https://github.com/Karin-Laboratory/karin-daily/pull/1)

**注意:** 旧Python/OCI版は復旧用に稼働・コード保存を維持していますが、旧SQLite実データを別媒体へ複製する作業は未完了です。旧版の停止・削除前に運用記録を参照してください。

## 旧Python/OCI版（レガシー実装・復旧用）

以下は**2026-10-29以前の実装**に関する説明です。現在の公開サイトの実装ではありません。

Karin Daily is a lightweight personal news front page. It collects RSS/Atom
feeds, normalizes and deduplicates articles, groups reports about the same
story, ranks the resulting stories, and renders a Japanese HTML digest.

The service uses the OpenAI-compatible API exposed by `karin-ai` for
cluster-level Japanese summaries. The default endpoint is:

```text
http://127.0.0.1:18080/v1/chat/completions
```

## Architecture

```text
source → normalize → dedup → cluster → score → category → LLM → HTML
```

- `karin-daily/sources.py`: RSS/Atom adapters, article retrieval, and excerpt fallback.
- `karin-daily/similarity.py`: canonical URL normalization, fingerprints, and title similarity.
- `karin-daily/pipeline.py`: collection, deduplication, story clustering, scoring, categories, and orchestration.
- `karin-daily/llm.py`: OpenAI-compatible `karin-ai` client with deterministic fallback behavior.
- `karin-daily/storage.py`: SQLite schema and non-destructive migrations.
- `karin-daily/render.py`: Japanese HTML rendering.
- `karin-daily/karin_daily.py`: command-line and HTTP service entry point.

The deterministic score remains useful when `karin-ai` is unavailable or
returns malformed JSON. Multiple independent hosts receive a bounded bonus;
same-host reposts do not dominate a story.

## System requirements

- Linux with Python 3.10 or newer
- SQLite 3
- Network access to the configured RSS/Atom feeds
- Optional for summaries: a reachable `karin-ai` OpenAI-compatible endpoint
- Production deployment additionally uses systemd and an HTTP reverse proxy

The application currently uses only the Python standard library. There is no
`requirements.txt` to install.

## Install and run

```sh
git clone https://github.com/Karin-Laboratory/karin-daily.git
cd karin-daily
python3 karin-daily/karin_daily.py --once
python3 karin-daily/karin_daily.py --serve --host 127.0.0.1 --port 8088
```

Edit `karin-daily/config.json` or set `KARIN_DAILY_CONFIG` for local
configuration. The default database is
`karin-daily/data/karin_daily.sqlite3`; runtime data is intentionally not
committed to this repository.

## Test

Run the dedicated test suite from the repository root:

```sh
python3 -m unittest discover -s tests -p 'test_karin_daily*.py' -v
```

## Production deployment

The production runbook is [docs/karin-daily-production-deploy.md](docs/karin-daily-production-deploy.md).
It deploys the application to `/opt/karin-daily`, preserves the existing
SQLite database, and manages the service with the included systemd units:

- `karin-daily/karin-daily.service`
- `karin-daily/karin-daily-refresh.service`
- `karin-daily/karin-daily-refresh.timer`

If every feed is temporarily unavailable, a refresh fails without deleting or
replacing the last successful digest. The timer records the failure and retries
on its next run, so a transient network outage cannot produce a blank page.

`karin-daily/nginx-karin-daily.conf` is an optional loopback reverse-proxy
example. Production deployment must not replace the existing `karin-ai`,
Cloudflare Tunnel, or unrelated Karin services.

## Design references and original work

The redesign was informed by the publicly described ideas and workflows of
Cruxwire, CondenseIt, and ai-daily-news. The following distinction is
intentional:

- **Reference-inspired:** feed aggregation, normalization, URL/content
  deduplication, story clustering, ranking, LLM-assisted summarization, and
  digest-style HTML presentation.
- **Karin Daily-specific:** the standard-library-only implementation, the
  existing SQLite-compatible schema migration, independent-host-aware bounded
  scoring, Japanese category and fallback behavior, the `karin-ai` local
  OpenAI-compatible endpoint, the 8088 loopback service contract, and the
  existing Karin production systemd/Nginx integration.

The detailed design rationale is in
[docs/karin-daily-redesign.md](docs/karin-daily-redesign.md).
