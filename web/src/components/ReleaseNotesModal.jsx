import Modal from './Modal.jsx';
import Logo from './Logo.jsx';
import { RELEASES } from '../lib/releases.js';
import { formatUs } from '../lib/dates.js';

export default function ReleaseNotesModal({ onClose }) {
  return (
    <Modal onClose={onClose} wide closeOnEscape label="Release notes">
      <div className="release-head">
        <Logo height={36} />
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>
      <h2 className="release-title">Release notes</h2>
      {RELEASES.length === 0 && <p className="muted">No release notes yet.</p>}
      {RELEASES.map((release) => (
        <section key={release.version} className="release">
          <h3>
            v{release.version} <span className="muted">{formatUs(release.date)}</span>
          </h3>
          {release.sections.map((section) => (
            <div key={section.title}>
              <h4>{section.title}</h4>
              <ul>
                {section.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </Modal>
  );
}
