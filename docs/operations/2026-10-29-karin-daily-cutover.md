# Karin Daily cutover and rollback, 2026-10-29 (JST)

## Source snapshot before cutover

- Original `main` commit: `4997789b163e6d2deda9c58400e99222afb0e50c`
- Immutable-source preservation branch: `archive/legacy-karin-daily-2026-10-29`, created **before** merge of Worker prototype
- New Worker code folder on `main`: `prototype/cloudflare-worker/`
- New deployment Worker script: `karin-daily-next` (name intentionally kept for rollback and verification)
- New Worker KV binding: `NEWS` with a **dedicated** namespace (`karin-daily-prototype`)
- Previous implementation continues to exist on OCI and remains running; the route switch does not touch it.

## Verified old production configuration

- Public hostname: `https://daily.karin-lab.com/`
- DNS: proxied CNAME `daily.karin-lab.com` -> `e5bc6999-8971-49ea-b509-886461de1447.cfargotunnel.com`
- Tunnel `public-edge`, ID `e5bc6999-8971-49ea-b509-886461de1447`
- Tunnel ingress: `daily.karin-lab.com` -> `http://10.0.0.100:80`
- nginx -> legacy Python application `127.0.0.1:8088`
- Legacy OCI VM `karin-news` Ubuntu 24.04 ARM64, app path `/opt/karin-daily`
- Legacy services: `karin-daily.service` and `karin-daily-refresh.timer`
- Legacy SQLite: `/opt/karin-daily/data/karin_daily.sqlite3`
- Existing specific Workers routes for `/favicon.ico` and `/favicon.svg` use `karin-homepage`. Do not alter these.
- Before cutover, legacy site `/` and `/healthz` both responded normally.

## New front door / rollback

This cutover **adds** a Cloudflare Workers route `daily.karin-lab.com/*`
mapped to the existing independent Worker `karin-daily-next`.
It does NOT delete/change the old DNS CNAME, Tunnel ingress, nginx,
systemd services, AI tunnel, SQLite database or any existing favicon routes.

To roll back: in Cloudflare Workers Routes for the `karin-lab.com` zone,
delete only the new exact pattern `daily.karin-lab.com/*`. No DNS changes
are needed. The old Tunnel will again handle the same hostname.

Smoke-test after deployment: `/`, `/?category=used`, `/?category=ai`,
`/theme.js`, `/rss.xml`, `/healthz`, `/api/status` on the production host.

## Production cutover result (completed 2026-10-29 JST)

- GitHub PR #1 merged into `main` at `c280b3dfd148047025fdb311bc767d3be4017b6c`.
- The source backup branch remains at the pre-merge `4997789b163e6d2deda9c58400e99222afb0e50c`.
- Cloudflare Worker route **created**: `daily.karin-lab.com/*` -> `karin-daily-next`.
- Route ID for precise rollback: `ee1f089375b34bf696993ffb2682b5e8`.
- Verified actual production hostname `https://daily.karin-lab.com` serves the new headline page and AI/used categories.
- Verified `/healthz`, `/theme.js`, `/rss.xml` and `/api/status` on the production hostname.
- Previous DNS record and Tunnel ingress retained unchanged. Existing legacy VM, systemd and SQLite untouched.
- **IMPORTANT:** SQLite online snapshot has NOT been taken from this conversation. A durable data-backup task is still outstanding. Do not describe it as complete.

## Rollback by precise route ID

Delete only route `ee1f089375b34bf696993ffb2682b5e8` in the
`karin-lab.com` zone (`b881d8eaa59110638b585483f9bdc342`).
Then verify `https://daily.karin-lab.com/` returns the former Python
frontpage and `/healthz` responds `ok`. No tunnel or DNS changes required.

## Legacy SQLite backup still required (not performed by GitHub or Cloudflare)

The GitHub source branch is NOT a backup of the runtime SQLite data.
This chat has GitHub and Cloudflare API access, but **no SSH shell to
`karin-news`**, so it cannot truthfully certify that the remote DB backup
has occurred. Do not mark the data-backup task complete on this evidence.

From an authorized SSH session on the legacy host, use a SQLite-consistent
online snapshot and preserve its checksum:

```sh
set -eu
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$HOME/karin-daily-backups"
sqlite3 /opt/karin-daily/data/karin_daily.sqlite3 \
  ".backup '$HOME/karin-daily-backups/karin_daily-$stamp.sqlite3'"
sha256sum "$HOME/karin-daily-backups/karin_daily-$stamp.sqlite3" \
  > "$HOME/karin-daily-backups/karin_daily-$stamp.sqlite3.sha256"
sqlite3 "$HOME/karin-daily-backups/karin_daily-$stamp.sqlite3" 'PRAGMA integrity_check;'
```

For a genuine separate-medium backup, securely transfer the snapshot off the
legacy VM to an appropriately restricted backup destination, and verify the
SHA-256 hash there. Do not commit DB contents or credentials to this public
GitHub repository. Do not stop the old service until this is completed and
a rollback/retention period is agreed upon.

## CI and deployment notes

Node tests execute on every PR update. Cloudflare deployment in this
transition is explicitly performed through the connected Cloudflare API,
since an appropriate `CLOUDFLARE_API_TOKEN` is not configured in GitHub Actions.
Keep the old Worker script and dedicated KV unmodified until cutover is stable.
