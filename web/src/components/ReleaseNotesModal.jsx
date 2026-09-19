import { useState } from 'react';
import Modal from './Modal.jsx';
import Logo from './Logo.jsx';
import { CREDITS, RELEASES } from '../lib/releases.js';
import { formatUs } from '../lib/dates.js';

function ReleaseList() {
  return (
    <>
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
    </>
  );
}

function CreditsList() {
  return (
    <>
      {CREDITS.map((section) => (
        <section key={section.title} className="release credits-section">
          <h3>{section.title}</h3>
          {section.intro.map((line, i) => (
            <p key={i} className="credits-intro">{line}</p>
          ))}
          {section.items.length > 0 && (
            <ul className="credits-list">
              {section.items.map((item) => (
                <li key={item.name}>
                  <span className="credits-name">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a>
                    ) : (
                      item.name
                    )}
                  </span>
                  <span className="credits-license">{item.license}</span>
                  {item.purpose && <span className="muted credits-purpose">{item.purpose}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="credits-intro">
        <a href="/third-party-notices.txt" target="_blank" rel="noopener noreferrer">
          Full license texts for everything bundled or installed
        </a>
      </p>
    </>
  );
}

export default function ReleaseNotesModal({ onClose }) {
  const [tab, setTab] = useState('notes');

  return (
    <Modal onClose={onClose} wide closeOnEscape label="Release notes and credits">
      <div className="release-head">
        <Logo />
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>
      <div className="tabs" role="tablist" aria-label="Release notes and credits">
        <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
          Release notes
        </button>
        <button type="button" role="tab" aria-selected={tab === 'credits'} className={tab === 'credits' ? 'active' : ''} onClick={() => setTab('credits')}>
          Credits
        </button>
      </div>
      <div role="tabpanel">{tab === 'notes' ? <ReleaseList /> : <CreditsList />}</div>
    </Modal>
  );
}
