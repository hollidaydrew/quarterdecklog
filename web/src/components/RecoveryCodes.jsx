import { useState } from 'react';
import { copyText } from '../lib/entryText.js';

// The one-time recovery codes, shown right after two-step setup (or after new
// ones are made). They are never shown again, so the person has to say they
// saved them before moving on.
export default function RecoveryCodes({ codes, onDone, doneLabel = 'I saved these codes' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(codes.join('\n'))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        <strong>Save these recovery codes.</strong> If you lose your phone, each code lets you sign in once. They are shown only now.
      </p>
      <ul className="recovery-codes">
        {codes.map((c) => <li key={c}><code>{c}</code></li>)}
      </ul>
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy codes'}</button>
        <button type="button" onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
  );
}
