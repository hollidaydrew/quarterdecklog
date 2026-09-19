import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function MenuDrawer({ user, onClose, onLogout }) {
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
          {user.is_admin && (
            <Link to="/admin" onClick={onClose}>Admin</Link>
          )}
          <button type="button" className="drawer-link" onClick={onLogout}>Log out</button>
        </nav>
        <p className="drawer-credit">
          Made by Drew with <span className="heart" role="img" aria-label="love">♥</span> in Littleton, CO.
        </p>
      </aside>
    </>
  );
}
