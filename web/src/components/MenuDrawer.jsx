import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function MenuDrawer({ user, onClose, onLogout, onOpenProfile, onOpenGuide, onOpenActivity }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer-head">
          <span className="drawer-title">Menu</span>
          <button type="button" className="icon-button" aria-label="Close menu" onClick={onClose} autoFocus>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="drawer-nav">
          <button type="button" className="drawer-link" onClick={onOpenProfile}>My profile</button>
          <button type="button" className="drawer-link" onClick={onOpenGuide}>User Guide</button>
          {user.is_admin && (
            <button type="button" className="drawer-link" onClick={onOpenActivity}>Activity log</button>
          )}
          {user.is_admin && (
            <Link to="/admin" onClick={onClose}>Admin</Link>
          )}
          <button type="button" className="drawer-link" onClick={onLogout}>Log out</button>
        </nav>
        <div className="drawer-credit">
          <p className="credit-main">Crafted by Drew in Littleton, CO</p>
          <p className="credit-sub">Dedicated to my shipmates</p>
          <p className="credit-sub">USS MAHAN (DDG-72)</p>
        </div>
      </aside>
    </>
  );
}
