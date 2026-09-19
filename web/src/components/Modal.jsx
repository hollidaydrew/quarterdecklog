import { useEffect } from 'react';

// closeOnEscape is opt-in: the entry editor must not lose someone's writing to
// a stray Escape key.
export default function Modal({ children, onClose, wide = false, closeOnEscape = false, label }) {
  useEffect(() => {
    if (!closeOnEscape) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeOnEscape, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
