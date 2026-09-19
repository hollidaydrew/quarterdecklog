import { useState } from 'react';
import ReleaseNotesModal from './ReleaseNotesModal.jsx';
import { APP_VERSION, CURRENT_RELEASE } from '../lib/releases.js';
import { formatUs } from '../lib/dates.js';

// Always visible, 20px tall, pinned to the bottom of the window on every
// screen (including sign-in). Clicking the version opens the release notes.
export default function Footer() {
  const [open, setOpen] = useState(false);
  const label = CURRENT_RELEASE
    ? `v${APP_VERSION} · ${formatUs(CURRENT_RELEASE.date)}`
    : `v${APP_VERSION}`;

  return (
    <>
      <footer className="app-footer">
        <button type="button" className="footer-version" onClick={() => setOpen(true)} title="View release notes">
          {label}
        </button>
      </footer>
      {open && <ReleaseNotesModal onClose={() => setOpen(false)} />}
    </>
  );
}
