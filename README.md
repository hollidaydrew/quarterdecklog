# QuarterDeckLog

A self-hosted, shared digital logbook for teams — inspired by the paper quarterdeck watch log used aboard Navy ships. Log what happened, day by day, so the next person on shift can catch up in a minute instead of digging through chat history.

Click a day on the calendar, see everything that was logged. Write entries in a rich-text editor, tag them (bug, incident, FYI, whatever your team needs), and hand off cleanly.

## Features

**Logging**
- One shared team log: everyone sees the same timeline, and every entry shows who wrote it and when
- Rich-text entry editor (bold, italic, strikethrough, links, heading, quotes, code, lists)
- Admin-managed, color-coded tags; click tags above a day's entries to filter them
- Only an entry's author, or an admin, can edit or delete it

**Reading and handing off**
- Each entry shows who wrote it and when, when it was edited, and a "Late entry" label if it was written on a later day than it belongs to
- Pinned notes (up to 5) stay at the top of the day, List and Calendar pages; a copy icon copies an entry as plain text
- After signing in, a note lists what other people added since your last sign-in

**Finding things**
- List view: a scrolling list of dates with the selected day's entries beside it, a single-day or date-range filter, an "Entries" check box that hides empty days, and one-click Year / Q1 to Q4 buttons
- Calendar view: click a day, see that day's entries, newest first
- Search: its own page with filters for dates, tags and person. Words match from the start of a word, "quotes" for exact phrases, -word to leave one out, matched words highlighted, and results can be printed or exported like the Rollup
- Rollup: every entry in a date range on one page, with Print and Export
- Rollup and Search share one Filters panel and results layout (tag, user and date filters; print and export follow the filters)

**Running it**
- Invite-link onboarding; there is no public signup
- Admin tools: tags, invites, team members (edit, reset password, delete, last login), API keys, security and data
- Optional two-step sign-in (admin controlled): authenticator-app codes (Microsoft Authenticator, Google Authenticator and similar), trusted for 7 days per device, up to 5 devices each, recovery codes, and an emergency off switch
- Export and import: download every entry, tag and author as one file, and add a file's entries back (add-only)
- Activity log (admins): the last 5,000 events, including entry text and changes, with CSV export
- My profile (everyone): change your own display name, username and password
- API (off by default): admin-issued, named keys let scripts add and read entries and tags, with an admin-only Swagger "API Docs" page
- In-app User Guide, release notes (click the version in the footer, or read [CHANGELOG.md](CHANGELOG.md)) and credits
- Runs as a single Docker container with a SQLite database on a mounted volume

## Quick start

1. Copy the example environment file and fill in a real session secret:
   ```
   cp .env.example .env
   openssl rand -hex 32
   ```
   Paste the output into `SESSION_SECRET` in `.env`.

2. Build and start:
   ```
   docker compose up -d --build
   ```

3. Open `http://localhost:7272` (or whatever `HOST_PORT` you set). The first person to load the app is walked through creating the admin account.

4. As admin, go to **Admin → Invites** to generate an invite link, and **Admin → Tags** to set up your team's tags.

## Upgrading

Pull the latest code and rebuild. Your data lives in the Docker volume and is kept; the database upgrades itself on first start.

```
git pull
docker compose build --pull
docker compose up -d
```

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version. Everyone is signed out when the container restarts.

## Development

You can run QuarterDeckLog without Docker while you work on it. You need Node.js 24 and two terminals.

```
# Terminal 1: the server (port 7272)
cd server
npm install
SESSION_SECRET=$(openssl rand -hex 32) DB_PATH=/tmp/qdl-dev.db API_ENABLED=true npm run dev

# Terminal 2: the web app (http://localhost:5173, proxies /api to the server)
cd web
npm install
npm run dev
```

`DB_PATH` is a scratch database, so delete the file to start over. After changing dependencies, run `npm run generate:notices` and `npm run check:credits` from the repo root (see below).

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes | Random string (32+ chars) used to sign session cookies. Generate with `openssl rand -hex 32`. The app refuses to start without one. |
| `HOST_PORT` | No | Host-side port mapped to the container (default `7272`). |
| `API_ENABLED` | No | Set to `true` to turn on the API and API Docs (default `false`). See [API](#api). |
| `MFA_ENCRYPTION_KEY` | No | Needed before an admin can turn on two-step sign-in. At least 32 characters (`openssl rand -hex 32`). It encrypts each person's authenticator secret and is separate from `SESSION_SECRET`, so changing the session secret never affects it. **Keep a copy**: if it is lost or changed the secrets can't be read, and an admin uses Admin, Security, Reset everyone so everyone sets up again. |
| `MFA_FORCE_OFF` | No | Emergency only: `true` ignores two-step sign-in entirely, so a locked-out admin can sign in with a password. Restart, fix things, then remove it. While two-step is on and `MFA_ENCRYPTION_KEY` is missing, nobody can sign in until it is restored or this is set. |

## API

The API lets scripts and other systems add and read entries and tags. It is **off by default**.

1. Set `API_ENABLED=true` in `.env` and restart the container.
2. Sign in as an admin, open **Admin → API keys**, and create a key. Give it a friendly name (for example "Nagios"); that name is what the Activity log shows. Choose read only or read and write, and when it expires (30, 60, 90 or 180 days, or 1 year). The key is shown once.
3. Call `/api/v1` with `Authorization: Bearer <key>`. Admins can open **API Docs** from the menu for the full, try-it-out reference.

```
# add an entry (needs a read and write key)
curl -X POST https://your-host/api/v1/entries \
  -H "Authorization: Bearer $QDL_KEY" -H "Content-Type: application/json" \
  -d '{"entry_date":"2026-10-08","text":"Backup finished OK","tags":["FYI"]}'

# read a day
curl -H "Authorization: Bearer $QDL_KEY" "https://your-host/api/v1/entries?date=2026-10-08"
```

Entries written through the API belong to the built-in user **System**. A key can edit or delete only those entries, never ones written by people. Keys are limited to 60 calls a minute, only a hash of each key is stored, and the API sends no CORS headers, so it is meant for servers and scripts, not for other websites.

## Reverse proxy / HTTPS

QuarterDeckLog itself only serves plain HTTP on port 7272 inside the container. For real deployments, put it behind a reverse proxy or tunnel (Caddy, Nginx, Cloudflare Tunnel, etc.) that terminates TLS. Session cookies are marked `secure` in production, so the app must be accessed over HTTPS in a real deployment or logins won't persist.

## Security notes

This repo is public, so a few things are worth knowing if you're running your own instance or reading the code:

- No credentials, tokens, or secrets are committed anywhere in this repo. `.env` is gitignored; only `.env.example` (placeholder values) is tracked.
- The first-run admin account is created through the UI on first launch, not via a hardcoded or default credential.
- Passwords are hashed with argon2. Login is rate-limited (10 attempts / 5 minutes per IP).
- New accounts can only be created via an admin-issued, expiring, single-use invite link — there is no public signup form.
- Admins can reset a user's password; the app issues a temporary password that must be changed at the next sign-in.
- Role changes, password resets and deleted accounts take effect immediately, because the signed-in user is re-read from the database on every request.
- Entry content is sanitized server-side (allow-listed tags/attributes only) before it's stored, to prevent stored XSS from rich-text input.
- Dependabot and a GitHub Actions secret-scan (gitleaks) run on this repo — see `.github/`.
- Every response carries browser security headers (content security policy, no framing, no sniffing), and API responses are never cached.
- Anyone can edit their own display name, username and password, but a request to change a role is refused for everyone except through an admin editing someone else. Entries can only be edited or deleted by their author or an admin (enforced on the server).
- Two-step sign-in is off until an admin turns it on for the team. Authenticator secrets are encrypted at rest (AES-256-GCM) with a key that is separate from the session secret; recovery codes and trusted-device cookies are stored only as hashes. A password alone opens nothing while a code is still needed, wrong codes lock the account for 15 minutes, and a code can't be used twice. A device that passes a code is trusted for a fixed 7 days (up to 5 devices per person).
- Importing a log file is add-only, validated strictly and cleaned again, and runs as one transaction. Exports contain no passwords, keys or Activity log.
- API keys are 256-bit random values; only a SHA-256 hash is stored. A key works on `/api/v1` only, always expires (30 days to 1 year), can be revoked at any time, and is rate-limited. The API is off unless `API_ENABLED=true`.
- The activity log is admin-only. It keeps entry text (including text of deleted entries) for up to 5,000 events.

If you find a security issue, please open a private security advisory on GitHub rather than a public issue.

## Known limitations

- Sessions are stored in memory — restarting the container logs everyone out. Fine for a small team; a persistent session store can be added later if needed.
- No file/image attachments on entries yet (text and formatting only).
- No email notifications — this is a "pull" tool, not a "push" one, by design.

## Tech stack

- Backend: Node.js 24, Fastify, better-sqlite3; the API Docs page is Swagger UI
- Frontend: React, Vite, [Trix](https://github.com/basecamp/trix) (rich-text editor)
- Single multi-stage Dockerfile, SQLite on a named Docker volume

## Credits and licenses

- [CREDITS.md](CREDITS.md) lists what QuarterDeckLog is built with; the app shows it on the Credits tab of the release notes.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) holds the license text of every third-party package that ships with the app. The app also serves it at `/third-party-notices.txt`.
- After changing dependencies, run `npm run generate:notices` and then `npm run check:credits` from the repo root (run `npm ci` in `server/` and `web/` first). The check fails if a dependency isn't credited, a package's license text is missing, or a package uses a license that hasn't been reviewed.
- The secret-scan workflow uses [gitleaks-action](https://github.com/gitleaks/gitleaks-action), which is under its own license (Gitleaks LLC): free for repos owned by a personal GitHub account, but repos owned by an organization need a free license key. Moving this repo to an organization means adding that key or switching to the MIT-licensed gitleaks CLI.

## Releasing

1. Update the version in the root, `server/` and `web/` `package.json` files and lockfiles.
2. Add the release to [CHANGELOG.md](CHANGELOG.md) (the footer and release notes read it). The release notes shown in the app include only the **Added**, **Changed**, **Fixed** and **Removed** sections, so write those as plain reports of what changed in the app. Put security and dependency updates under **Security** and server instructions under **Upgrading from x.y.z**; they stay in the file for GitHub readers but are not shown in the app.
3. If dependencies changed: `npm run generate:notices` and `npm run check:credits`, and update [CREDITS.md](CREDITS.md).

## License

MIT — see [LICENSE](LICENSE).
