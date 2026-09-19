# Credits

The app shows this file on the Credits tab of the release notes. Keep it in step with the dependencies in
server/package.json and web/package.json; `npm run check:credits` fails if a package is missing here.

## QuarterDeckLog
QuarterDeckLog is open source under the MIT License, Copyright (c) 2026 Drew Holliday.
The QuarterDeckLog wordmark was designed by ChatGPT (OpenAI) and edited by Claude (Anthropic).

## Runs in your browser
- [React](https://react.dev) | MIT | User interface library
- [React DOM (react-dom)](https://react.dev) | MIT | Draws the interface in the browser
- [React Router (react-router-dom)](https://github.com/remix-run/react-router) | MIT | Page navigation
- [Trix](https://trix-editor.org/) | MIT | Rich-text entry editor by Basecamp (37signals)
- [DOMPurify](https://github.com/cure53/DOMPurify) | Apache-2.0 | HTML sanitizer used inside Trix (offered as MPL-2.0 or Apache-2.0)

## Runs on the server
- [Fastify](https://fastify.dev/) | MIT | Web server
- [@fastify/cookie](https://github.com/fastify/fastify-cookie) | MIT | Cookies
- [@fastify/session](https://github.com/fastify/session) | MIT | Sign-in sessions
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit) | MIT | Limits repeated sign-in attempts
- [@fastify/static](https://github.com/fastify/fastify-static) | MIT | Serves the web app
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | MIT | SQLite database driver (SQLite itself is public domain)
- [argon2](https://github.com/ranisalt/node-argon2) | MIT | Password hashing
- [nanoid](https://github.com/ai/nanoid) | MIT | Invite link tokens
- [sanitize-html](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html) | MIT | Cleans entry text before it is stored

## Build tools
- [Vite](https://vite.dev) | MIT | Builds the web app
- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | MIT | React support for Vite

## Platform and repository tooling
- [Node.js](https://nodejs.org) | MIT | JavaScript runtime
- [Debian GNU/Linux](https://www.debian.org) | Various open-source licenses | Operating system inside the Node.js Docker base image
- [Gitleaks](https://github.com/gitleaks/gitleaks) | MIT | Secret scanning
- [Gitleaks Action](https://github.com/gitleaks/gitleaks-action) | Gitleaks LLC license | Runs Gitleaks on GitHub. Free for personal GitHub accounts; organization accounts need a free license key
- [GitHub Actions checkout](https://github.com/actions/checkout) | MIT | Fetches the code in the secret-scan workflow
- [Dependabot](https://docs.github.com/en/code-security/dependabot) | GitHub service | Weekly dependency update pull requests
