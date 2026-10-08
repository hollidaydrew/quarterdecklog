# Changelog

All notable changes to QuarterDeckLog are listed here, newest first. The app
shows this list when you click the version number in the footer.

## [0.11.1] - 2026-10-08

### Changed
- Rollup and Search are tidier: the "Rollup" and "Search" labels and the entry-count line above the entries are gone; the date button is the same size as the Year and quarter buttons; Person is now User and Everyone is now All Users (including the Person column in the exported file, now User); Print / PDF is now Print and Export CSV is now Export (Export still downloads a spreadsheet file); the User and Sort drop-downs match the size of the other filter controls; the Search box no longer shows the browser's own outline; and only the Per page choice shows above the entries; when a number splits the results into pages, the range and Previous / Next appear below them.
- The release notes you open from the version number now leave out the technical upgrade steps for the people who run the server unless you are an admin. Admins still see everything.
- Rollup and Search now use the same typeface as the rest of the app. 0.11.0 mixed in a second, typewriter-style font for the range, dates and counts; those now use the normal font, with numerals that still line up.

### Upgrading from 0.11.0
- Your data is kept. No database changes.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`.
- Everyone is signed out once, when the container restarts.

## [0.11.0] - 2026-10-08

### Added
- **Search page.** Search is now a tab beside List, Calendar and Rollup, instead of a pop-up, and is no longer in the menu. A large search box with the filters under it: dates (single day or range, plus Year and Q1 to Q4), tags, person, and Newest or Oldest first. Press Enter or click Search; changing a filter afterwards runs the same words again.
  - Matching works the way most search boxes do: every word must match, in any order, from the start of a word (`disk` finds `diskspace`); case and accents are ignored; `"quotes"` need the words together, in that order; `-word` leaves a word out; punctuation is ignored. Words like AND, OR and NEAR are just words.
  - Results are whole entries, grouped by day with the matched words highlighted, paged like Rollup, up to the newest 5,000 (the old pop-up stopped at 100 and showed only a snippet).
  - Print / PDF and Export CSV work like Rollup's and cover every result and the filters in use.
  - What you searched for is kept in the web address, so Back, refresh and a copied link all return to the same results.

### Changed
- **Rollup and Search share a new layout.** One boxed Filters area (Dates, Tags, Person, with a Clear filters button), then a results header that holds the range, the counts, and the Print / PDF and Export CSV buttons that act on them, then the entries with each day ruled off and its entry count. On a phone the filters fold away behind a button that shows how many are on. The pager is one slim line. Printing is unchanged.
- Search is much faster, and stays fast as the log grows: it now uses a full-text index instead of reading every entry for every search. On a test log of 50,000 entries a search takes a few milliseconds.
- Matching is by word start rather than any part of a word, so typing the middle of a word (`isk`) no longer finds `disk`.

### Upgrading from 0.10.0
- Your data is kept. The database gets one new search index, built in the background the first time the server starts (about 2 seconds for 50,000 entries). Until it finishes, Search says it is still getting ready. On later starts the index is quietly refreshed.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`.
- Everyone is signed out once, when the container restarts.

## [0.10.0] - 2026-10-08

### Added
- **Two-step sign-in (optional, admin controlled).** An admin turns it on for the whole team under Admin, then Security. People then set up an authenticator app (Microsoft Authenticator, Google Authenticator, Authy, 1Password and similar) at their next sign-in and enter its 6-digit code. A device that passes a code is trusted for exactly 7 days, then asks again; signing in again does not extend it, and each device has its own 7 days. Each person can trust up to 5 devices: the 5th shows a notice (you can close it), a 6th is refused until a slot is freed under My profile, where trusted devices are listed and can be removed. Ten one-time recovery codes are shown once at setup. Five wrong codes lock that account for 15 minutes; an admin can unlock it, or reset one person's setup (a lost phone) in Team. Admin, Security also has Reset everyone (type HARD RESET), which deletes every setup and works even if the key is lost. Secrets are stored encrypted. Off by default; nothing changes until an admin turns it on. API keys are not affected.
- **Since you last signed in.** After signing in, a note lists the entries other people (and the API) added since your previous sign-in, with a link to each day.
- **Edited marker.** An entry changed after it was written shows when it was edited (the earlier text stays visible to admins in the Activity log).
- **Late entry label.** An entry written on a later day than the day it belongs to is marked "Late entry".
- **Pinned notes.** A pin icon on an entry pins it to a Pinned section at the top of the day, List and Calendar pages (up to 5 at a time). Anyone can pin or unpin.
- **Copy icon.** Copies an entry as plain text: who wrote it, when, the text, and its tags.
- **Tag and person filters** on Rollup and Search. Print / PDF and Export CSV follow the filters. The Rollup CSV also gains Edited and Late entry columns.
- **Export and import** (Admin, then Data). Export downloads every entry, tag and author name as one file, with no passwords, API keys or Activity log. Import adds a file's entries and tags back: nothing already here is changed or deleted, entries already here are skipped, and people who are not here become locked accounts that cannot sign in.
- The API now reports `edited_at`, `late` and `pinned` on each entry.
- Activity log: new events for pins, exports, imports, and the two-step changes above.

### Changed
- New optional settings in `.env`: `MFA_ENCRYPTION_KEY` (needed before two-step can be turned on; keep a copy) and `MFA_FORCE_OFF` (emergency way back in). See the README.
- If two-step is on and `MFA_ENCRYPTION_KEY` goes missing, sign-ins are refused (not skipped) until it is restored or `MFA_FORCE_OFF=true` is set.

### Security
- Two-step secrets are encrypted with AES-256-GCM using a key derived from `MFA_ENCRYPTION_KEY`, which is separate from `SESSION_SECRET`. Recovery codes and trusted-device cookies are stored only as hashes. A correct password alone never opens any page or API call when a code is still needed.
- Import treats the file as untrusted: strict format checks, size and count limits, every entry cleaned again, add-only, and one database transaction.
- Rollup and Search filters use bound parameters only.

### Upgrading from 0.9.0
- Your data is kept. The database gets new columns on entries and users and two new tables; nothing is rewritten or removed.
- Two-step stays off. To use it later, add `MFA_ENCRYPTION_KEY` (for example from `openssl rand -hex 32`) to `.env` and keep a copy of it somewhere safe.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`.
- Everyone is signed out once, when the container restarts.

## [0.9.0] - 2026-10-08

### Changed
- Entries can no longer be dated in the future. On the Calendar, days after today are greyed out and Next stops at the current month. The date button on the List and Rollup greys out days after today and stops at this year. A future day that already has entries can still be opened, read, edited and deleted, but it has no New entry button. Opening a future day by its web address shows a note instead.
- The server (and the API) now refuse an entry dated after tomorrow's UTC date. Tomorrow itself is allowed on purpose, because someone ahead of UTC may already be on that day; the web app enforces the exact local date.

### Security
- Updated three supporting packages: sanitize-html 2.18.0 (cleans entry text), @fastify/static 10.1.5 (serves the app) and Vite 8.3.2 (build tool).

### Upgrading from 0.8.0
- Your data is kept. No database changes, and nothing is deleted or hidden, including any entries that already have a future date.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`.
- Everyone is signed out once, when the container restarts.

## [0.8.0] - 2026-10-08

### Added
- API access, so scripts and other systems can add and read entries and tags. It is off until you set `API_ENABLED=true` in `.env`.
  - Admin, then API keys: create a key with a friendly name (such as "Nagios"), read-only or read and write, and no expiry or 30 days, 90 days or 1 year. The key is shown once, then only its first characters. You can see when each key was last used and revoke it at any time.
  - Entries added through the API belong to a new built-in user called System. It can't sign in and does not appear in the Team list. The Activity log shows the key's friendly name as who did it.
  - Endpoints under `/api/v1`: list and create tags; list entries for a date or a date range (paged); get, add, replace and delete an entry. Entry text can be plain text or HTML, and tags can be given by name or id. A key can only change or delete entries that were written through the API, never an entry written by a person.
  - API Docs, a Swagger page that describes every endpoint and lets you try them. Admins open it from the menu or from Admin, then API keys.
  - Each key is limited to 60 calls a minute, and every address to 120.
- Activity log: new events for API keys being created and revoked.

### Changed
- A person can no longer use "System" or the name of an active API key as their display name, so the Activity log can't be faked.

### Security
- API keys are 256-bit random values and only a hash is stored, so a copy of the database can't be used to call the API. A wrong, expired or revoked key all get the same answer.
- The API does not allow other websites to call it from a browser, and a key only works on `/api/v1`, never on the app's own pages or the Admin screens.
- The server no longer keeps a session in memory for visitors who have not signed in.
- Updated two supporting packages to clear advisories (a server one used when cleaning entry text, and DOMPurify inside the editor).

### Upgrading from 0.7.0
- Your data is kept. The database gets one new table (API keys) and one new column, and a System user is added. Nothing is rewritten.
- Add `API_ENABLED=true` to `.env` if you want the API; leave it out to keep the API off.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`.
- Everyone is signed out once, when the container restarts.

## [0.7.0] - 2026-10-06

### Added
- Entries check box on the List, next to the List, Calendar and Rollup buttons. Check it to hide the dates that have no entries. The date filter still applies.
- Year, Q1, Q2, Q3 and Q4 buttons under the date button on the List. One click sets the dates to that year or quarter. They use the year of the dates you are showing (this year when none are picked). A quarter that has not started yet is turned off, and a range that includes today ends today.
- Rollup, a new button next to List and Calendar. It lists every entry in a date range, newest day first, with the same date button and Year/quarter buttons. Print / PDF (the whole range, up to 1,000 entries) opens your browser's print window (choose Save as PDF there), and Export CSV (also the whole range) downloads a spreadsheet with one row per entry. The page shows 20 entries at a time; a drop-down lets you pick more or fewer per page. It shows the newest 5,000 entries of a range.

### Upgrading from 0.6.0
- Your data is kept. No database changes.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`.

## [0.6.0] - 2026-10-03

### Added
- Search, opened from the menu. Type words from an entry or a tag and it lists every entry that has all of them, newest first, with a short excerpt. Click a result to open that day. It shows the newest 100 matches.

### Changed
- On a day, entries now run newest first, with the oldest at the bottom.
- The release notes window no longer shows the logo.

### Security
- Updated the sign-in password library, the database library and the ID generator to their latest versions, and cleared two advisories in supporting packages.
- The Docker image now runs Node.js 24, the current long-term support release.
- Updated the build tools used in GitHub (checkout and the secret scan).

### Upgrading from 0.5.0
- Your data is kept. No database changes.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`, so the new Node.js base image is downloaded.
- Everyone is signed out once, when the container restarts.

## [0.5.0] - 2026-09-18

### Added
- Export CSV button in the Activity log (admins only). It downloads every event the log holds as a spreadsheet file, with the date and time in your local time, who did it, what happened, and the entry text and changes.
- Favicon and app icons: the QuarterDeckLog icon now shows in browser tabs, on an iPhone or iPad home screen, and when the app is installed on Android.

### Changed
- Each entry card now shows the full date and time it was written, such as 09-18-2026 8:37 PM, in your local time. Before, it showed only the time.
- Buttons and the shading on the selected day are now Haze Gray instead of blue.
- The Activity log now keeps the last 5,000 events, up from 2,500.

### Fixed
- Entry editor: when an entry ran longer than the text box, the cursor and the last lines spilled out of the bottom of the box. Long entries now scroll inside the box.

### Security
- React Router is updated to clear a security advisory (an open redirect in links and navigation).
- Vite, the build tool, is updated to clear a security advisory in its development server. The app you run was not affected.
- Fastify and its static file plugin are updated to their latest patch releases.
- The Docker image now runs Node.js 22, because Node.js 20 no longer receives security updates.
- The app now sends browser security headers: a content security policy, protection against being shown inside another site, and no caching of private data.

### Upgrading from 0.4.0
- Your data is kept. No database changes.
- Rebuild with `docker compose build --pull` and then `docker compose up -d`, so the new Node.js base image is downloaded.
- Everyone is signed out once, when the container restarts.

## [0.4.0] - 2026-09-18

### Added
- Activity log (admins only), opened from the menu. It lists the last 2,500 events, newest first: entries added, edited and deleted (with the entry's text and what changed), invites, sign-ups, sign-ins, tag changes, profile and user changes, and version updates. Each event shows the date and time to the second, in your local time.
- My profile, opened from the menu: everyone can change their own display name, username and password. Only an admin can change roles.
- User Guide, opened from the menu, with basic instructions for using QuarterDeckLog.
- Credits tab in the release notes window, listing the software QuarterDeckLog is built with and the license of each, with a link to the full license texts.
- Admin, Team: each person's last login date and time is shown under their name.

### Changed
- The release notes window now has two tabs: Release notes and Credits.

### Upgrading from 0.3.0
- Your data is kept. The database adds a last-login field and an activity log the first time 0.4.0 starts.
- Nothing from before this release appears in the activity log, and last login is blank until each person next signs in.
- Everyone is signed out once, when the container restarts.

## [0.3.0] - 2026-09-18

### Changed
- The entry editor is now Trix. Its toolbar adds a link button, a heading, indent and undo/redo. Web addresses you type are no longer turned into links automatically; use the link button. Inline code and underline are no longer available.
- Entries written before this release look the same as before. Editing one converts it to the new editor's format.
- New wordmark logo (SVG) replaces the previous logo.
- The header stays pinned to the top of the window, like the footer. The menu drawer and pop-ups sit between the two.
- The footer is taller (40px), and only the version text is the link that opens the release notes.
- The footer (version and release notes) now appears only after you sign in.
- Sign-in, setup, sign-up and change-password screens: the logo is centered. The sign-in instruction and the sign-up heading and instruction are gone.

### Fixed
- Clicking anything after your session has ended now takes you to the login screen instead of showing an error. If an admin resets your password while you are signed in, you are taken to the change-password screen.

### Security
- Replacing the old editor also clears a Tiptap security advisory that came with it.

### Upgrading from 0.2.0
- No database changes. Existing entries, users, tags and invites are untouched.
- Everyone is signed out once, when the container restarts.

## [0.2.0] - 2026-09-18

### Added
- List view: a scrolling list of dates on the left and the selected date's entries on the right. Dates with entries are bold with a count; dates without entries are grayed out.
- Date filter for the list: choose a single day or a start and end date from a two-month calendar.
- Your last-used view (List or Calendar) is saved to your account, and clicking the logo returns you to it. List is the default for new users.
- Footer showing the version and release date. Click it to see these release notes.
- Menu drawer with Admin and Log out, opened from the menu button next to "Hello, name".
- Admin, Team: edit a user's display name, username and admin role.
- Admin, Team: reset a user's password. The app generates a temporary password and the user must choose their own the next time they sign in.

### Changed
- The QuarterDeckLog logo replaces the text title on the header and the sign-in, setup, sign-up and release notes screens.
- The header now shows only "Hello, name" and the menu button. The "Log" link is gone; the logo takes you back to your default view.
- When a tag filter hides every entry for a day, the message now reads "No entries for that tag, on this day." (or "that tag combination" when several tags are selected).
- Invites: each pending invite shows its link with Copy link and Revoke buttons. Once someone joins with an invite it disappears from the list, and their user record notes which admin invited them.
- Admin, Team: "Remove" is now "Delete".

### Fixed
- Deleting a user no longer deletes the entries they wrote. Entries stay in the log under the author's name, marked as a deleted user.
- Deleting a user now cuts off their access immediately, including any session they already had open.

### Upgrading from 0.1.0
- Your data is kept. The database upgrades itself the first time 0.2.0 starts.
- Pending invites keep working. Invites that were already used are cleared.
- Everyone is signed out once, when the container restarts.

## [0.1.0] - 2026-09-14

### Added
- Shared team log with a calendar view: click a day to see everything logged on it.
- Rich-text entry editor with bold, italic, strikethrough, lists, quotes, code and links.
- Admin-managed, color-coded tags, and filtering a day's entries by tag.
- Invite-link sign-up with no public registration.
- Runs as a single Docker container with a SQLite database on a mounted volume.
