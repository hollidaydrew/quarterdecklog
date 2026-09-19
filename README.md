# ⚓ QuarterDeckLog

A self-hosted, shared digital logbook for teams — inspired by the paper quarterdeck watch log used aboard Navy ships. Log what happened, day by day, so the next person on shift can catch up in a minute instead of digging through chat history.

Click a day on the calendar, see everything that was logged. Write entries in a rich-text editor, tag them (bug, incident, FYI, whatever your team needs), and hand off cleanly.

## Features

- Single shared team log — everyone sees the same timeline
- List view: a scrolling list of dates on the left, the selected day's entries on the right, with a single-day or date-range filter
- Calendar view: click a day, see that day's entries in order
- Rich-text entry editor (bold, italic, strikethrough, links, heading, quotes, code, lists)
- Admin-managed, color-coded tags; filter a day's entries by tag
- Invite-link based onboarding — no public signup
- Admin tools: manage tags, invites and team members (edit, reset password, delete)
- Release notes: click the version in the footer, or read [CHANGELOG.md](CHANGELOG.md)
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
docker compose up -d --build
```

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version. Everyone is signed out when the container restarts.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes | Random string (32+ chars) used to sign session cookies. Generate with `openssl rand -hex 32`. The app refuses to start without one. |
| `HOST_PORT` | No | Host-side port mapped to the container (default `7272`). |

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

If you find a security issue, please open a private security advisory on GitHub rather than a public issue.

## Known limitations

- Sessions are stored in memory — restarting the container logs everyone out. Fine for a small team; a persistent session store can be added later if needed.
- No file/image attachments on entries yet (text and formatting only).
- No email notifications — this is a "pull" tool, not a "push" one, by design.

## Tech stack

- Backend: Node.js, Fastify, better-sqlite3
- Frontend: React, Vite, [Trix](https://github.com/basecamp/trix) (rich-text editor)
- Single multi-stage Dockerfile, SQLite on a named Docker volume

## License

MIT — see [LICENSE](LICENSE).
