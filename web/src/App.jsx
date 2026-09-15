import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { api } from './api.js';
import SetupPage from './pages/SetupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import JoinPage from './pages/JoinPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import DayView from './pages/DayView.jsx';
import AdminSettings from './pages/AdminSettings.jsx';

export default function App() {
  const [status, setStatus] = useState(null); // { setupRequired, user } | null while loading
  const navigate = useNavigate();

  const refreshStatus = useCallback(async () => {
    const s = await api.get('/api/auth/status');
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleLogout = async () => {
    await api.post('/api/auth/logout');
    await refreshStatus();
    navigate('/login');
  };

  if (!status) return null; // brief blank while checking session; avoids a flash of the wrong screen

  if (status.setupRequired) {
    return (
      <Routes>
        <Route path="*" element={<SetupPage onDone={refreshStatus} />} />
      </Routes>
    );
  }

  if (!status.user) {
    return (
      <Routes>
        <Route path="/join/:token" element={<JoinPage onDone={refreshStatus} />} />
        <Route path="*" element={<LoginPage onDone={refreshStatus} />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>⚓ QuarterDeckLog</h1>
        <nav>
          <Link to="/">Log</Link>
          {status.user.is_admin && <Link to="/admin">Admin</Link>}
          <span className="muted">{status.user.display_name}</span>
          <button className="secondary" onClick={handleLogout}>Log out</button>
        </nav>
      </header>
      <div className="main-content">
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/day/:date" element={<DayView user={status.user} />} />
          {status.user.is_admin && <Route path="/admin" element={<AdminSettings />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
