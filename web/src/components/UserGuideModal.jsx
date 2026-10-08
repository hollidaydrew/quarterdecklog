import Modal from './Modal.jsx';

function Section({ title, children }) {
  return (
    <section className="guide-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

// Basic instructions for using QuarterDeckLog. The Admin section is shown to
// admins only.
export default function UserGuideModal({ user, onClose }) {
  return (
    <Modal onClose={onClose} wide closeOnEscape label="User Guide">
      <div className="release-head">
        <h3 style={{ margin: 0 }}>User Guide</h3>
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>

      <Section title="Getting started">
        <ul>
          <li>Sign in with the username and password you chose when you joined.</li>
          <li>Click the QuarterDeckLog logo at any time to return to the view you used last (List or Calendar).</li>
          <li>The menu button at the top right holds Search, My profile, this User Guide and Log out. Admins also see Activity log, Admin and, when the API is on, API Docs.</li>
          <li>Times are shown in your local time. Each entry shows who wrote it and the date and time it was written.</li>
        </ul>
      </Section>

      <Section title="Reading the log">
        <ul>
          <li><strong>List view:</strong> dates run down the left, newest first. A bold date with a number has that many entries. A gray date has none. Click a date to see its entries on the right. The up and down arrow keys move between dates.</li>
          <li><strong>Filter the list:</strong> click the date button above the list. Choose Single day or Date range, then click the day or days. Reset returns to every date this year.</li>
          <li><strong>Quick filters:</strong> under the date button, Year, Q1, Q2, Q3 and Q4 set the dates to that year or quarter. Check Entries beside the List and Calendar buttons to hide dates with no entries.</li>
          <li><strong>Calendar view:</strong> click a day to open it. A dot marks days that have entries.</li>
          <li>Switch between List and Calendar with the buttons at the top of the page. The app remembers your choice.</li>
          <li><strong>Rollup:</strong> click Rollup at the top of the page to see every entry in a date range. It shows 20 entries per page; change that with the Per page drop-down. Print / PDF (choose Save as PDF in the print window; up to 1,000 entries, so pick a shorter range for more) and Export CSV (any size) cover the whole range, not just the page you see.</li>
          <li>On a phone, choose a date from the drop-down instead of the list.</li>
          <li>Entries on a day run newest first, with the oldest at the bottom.</li>
          <li><strong>Search:</strong> open the menu and choose Search, then type words from an entry or a tag. Only entries with every word are listed. Click a result to open that day.</li>
        </ul>
      </Section>

      <Section title="Writing an entry">
        <ul>
          <li>Open the date you want and click + New entry.</li>
          <li>Write your entry. The toolbar has bold, italic, strikethrough, link, heading, quote, code, bulleted and numbered lists, indent, outdent, undo and redo.</li>
          <li>Pick any tags that apply, then click Save entry. Entries are text only; files can't be attached.</li>
          <li>To see fewer entries on a day, click one or more tags above them. Entries with any of the chosen tags stay. Click a tag again to clear it.</li>
        </ul>
      </Section>

      <Section title="Editing and deleting">
        <ul>
          <li>Only the person who wrote an entry, or an admin, can edit or delete it. Everyone else can read it.</li>
          <li>Edit and Delete appear on the entries you are allowed to change.</li>
        </ul>
      </Section>

      <Section title="Your profile">
        <ul>
          <li>Open the menu and choose My profile to change your display name, username or password.</li>
          <li>Only an admin can change roles.</li>
          <li>If an admin gives you a temporary password, you'll be asked to choose your own the next time you sign in.</li>
        </ul>
      </Section>

      <Section title="Release notes and credits">
        <ul>
          <li>Click the version number at the bottom of the screen to see what changed in each release. The Credits tab lists the software QuarterDeckLog is built with.</li>
        </ul>
      </Section>

      {user.is_admin && (
        <Section title="For admins">
          <ul>
            <li><strong>Tags:</strong> Admin, then Tags. Add a tag with a name and color, or delete one. Deleting a tag removes it from the entries that used it.</li>
            <li><strong>Invites:</strong> Admin, then Invites, then Generate invite link. Send the link to the new person. Each link works once and expires after 7 days. You can copy or revoke a pending link.</li>
            <li><strong>Team:</strong> Admin, then Team. Edit changes a name, username or role. Reset password creates a temporary password to share privately. Delete removes someone's access but keeps their entries. The last time each person signed in is shown under their name.</li>
            <li><strong>Activity log:</strong> open the menu and choose Activity log. It lists the last 5,000 events: entries added, edited and deleted, invites, sign-ups, sign-ins, tag and profile changes, version updates, and API key changes. Choose Show changes to see an entry's text and what was changed. Choose Export CSV to download every event, with its entry text and changes, as a spreadsheet file.</li>
            <li><strong>API keys:</strong> Admin, then API keys. Keys let scripts and other systems add and read entries and tags. Type a friendly name (such as Nagios), pick read only or read and write and an expiry, then Create key. The key is shown once, so copy it then. The Activity log shows the key's name as who did something, and entries made through the API are written by System. Revoke stops a key at once. This tab says if the API is turned off; the person running the server turns it on with API_ENABLED=true. API Docs, in the menu, describes every call.</li>
          </ul>
        </Section>
      )}
    </Modal>
  );
}
