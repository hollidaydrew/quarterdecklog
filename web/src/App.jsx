import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { api, onSessionProblem } from './api.js';
import SetupPage from './pages/SetupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import JoinPage from './pages/JoinPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import ListPage from './pages/ListPage.jsx';
import DayView from './pages/DayView.jsx';
import TagPage from './pages/TagPage.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import Logo from './components/Logo.jsx';
import Footer from './components/Footer.jsx';
import MenuDrawer from './components/MenuDrawer.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import UserGuideModal from './components/UserGuideModal.jsx';
import ActivityLogModal from './components/ActivityLogModal.jsx';

export default function App() {
  const [status, setStatus] = useState(null); // { setupRequired, user } | null while loading
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuModal, setMenuModal] = useState(null); // 'profile' | 'guide' | 'activity' | null
  const navigate = useNavigate();
  const location = useLocation();

  const refreshStatus = useCallback(async () => {
    const s = await api.get('/api/auth/status');
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Any request that finds the session gone re-checks who is signed in, which
  // shows the login screen (or the change-password screen if an admin has just
  // issued a temporary password).
  useEffect(
    () =>
      onSessionProblem(() => {
        setMenuOpen(false);
        setMenuModal(null);
        api
          .get('/api/auth/status')
          .then((s) => {
            setStatus(s);
            if (!s.user) navigate('/login');
          })
          .catch(() => {});
      }),
    [navigate]
  );

  // Saves the last view (list or calendar) on the account so the logo returns
  // to it, and mirrors it locally so no extra status request is needed.
  const rememberView = useCallback((view) => {
    api
      .put('/api/me/view', { view })
      .then(() => setStatus((s) => (s && s.user ? { ...s, user: { ...s.user, preferred_view: view } } : s)))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await api.post('/api/auth/logout');
    setMenuOpen(false);
    setMenuModal(null);
    await refreshStatus();
    navigate('/login');
  };

  if (!status) return null; // brief blank while checking session; avoids a flash of the wrong screen

  let content;
  if (status.setupRequired) {
    content = (
      <Routes>
        <Route path="*" element={<SetupPage onDone={refreshStatus} />} />
      </Routes>
    );
  } else if (!status.user) {
    content = (
      <Routes>
        <Route path="/join/:token" element={<JoinPage onDone={refreshStatus} />} />
        <Route path="*" element={<LoginPage onDone={refreshStatus} />} />
      </Routes>
    );
  } else if (status.user.must_change_password) {
    content = <ChangePasswordPage onDone={refreshStatus} onLogout={handleLogout} />;
  } else {
    const user = status.user;
    const isList = location.pathname.startsWith('/list');
    content = (
      <div className={`app-shell${isList ? ' fill' : ''}`}>
        <header className="topbar">
          <Link to="/" className="brand" aria-label="QuarterDeckLog, back to your log">
            <Logo />
          </Link>
          <div className="topbar-right">
            <span className="hello">Hello, {user.display_name}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>
        {menuOpen && (
          <MenuDrawer
            user={user}
            onClose={() => setMenuOpen(false)}
            onLogout={handleLogout}
            onOpenProfile={() => { setMenuOpen(false); setMenuModal('profile'); }}
            onOpenGuide={() => { setMenuOpen(false); setMenuModal('guide'); }}
            onOpenActivity={() => { setMenuOpen(false); setMenuModal('activity'); }}
          />
        )}
        {menuModal === 'profile' && <ProfileModal user={user} onClose={() => setMenuModal(null)} onSaved={refreshStatus} />}
        {menuModal === 'guide' && <UserGuideModal user={user} onClose={() => setMenuModal(null)} />}
        {menuModal === 'activity' && user.is_admin && <ActivityLogModal onClose={() => setMenuModal(null)} />}
        <div className={`main-content${isList ? ' wide fill' : ''}`}>
          <Routes>
            <Route path="/" element={<Navigate to={user.preferred_view === 'calendar' ? '/calendar' : '/list'} replace />} />
            <Route path="/list/:date?" element={<ListPage user={user} onViewUsed={rememberView} />} />
            <Route path="/calendar" element={<CalendarPage user={user} onViewUsed={rememberView} />} />
            <Route path="/day/:date" element={<DayView user={user} onViewUsed={rememberView} />} />
            <Route path="/tag/:slug" element={<TagPage user={user} />} />
            {user.is_admin && (
              <Route path="/admin" element={<AdminSettings currentUser={user} onSelfChanged={refreshStatus} />} />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <Footer />
      </div>
    );
  }

  return content;
}
