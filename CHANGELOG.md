# Changelog

All notable changes to QuarterDeckLog are listed here, newest first. The app
shows this list when you click the version number in the footer.

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
