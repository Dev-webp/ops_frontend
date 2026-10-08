import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './services/api';
import { allowedSectionsFor, hasProfile } from './Shared';
import Login from './Login';
import Dashboard from './Dashboard';
import Leads from './Leads';
import Audit from './Audit';
import Cases from './Cases';
import Reports from './Reports';
import Employees from './Employees';
import AddEmployee from './AddEmployee';

// ===========================================================================
// App shell: login state, toast, route protection, sidebar, notification bell
// ===========================================================================

// Which sidebar "section" a URL belongs to (used to block roles from pages
// they should not see). Dashboard is open to every logged-in user.
const SECTION_FOR_PATH = {
  '/leads': 'leads',
  '/audit': 'audit',
  '/cases': 'cases',
  '/reports': 'reports',
  '/employees': 'employees',
  '/employees/new': 'employees',
};

// Old multi-page URLs (bookmarks, emailed links) still work.
const LEGACY = {
  '/index.html': '/login',
  '/dashboard.html': '/dashboard',
  '/leads.html': '/leads',
  '/audit.html': '/audit',
  '/cases.html': '/cases',
  '/reports.html': '/reports',
  '/view-employees.html': '/employees',
  '/employees.html': '/employees',
  '/add-employee.html': '/employees/new',
};

function LegacyRedirect({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export default function App() {
  // ---------- who is logged in ----------
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    setUser(user);
    return user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  };

  // ---------- toast (passed to every page as `showToast`) ----------
  const [toast, setToast] = useState({ message: '', isError: false, show: false });
  const toastTimer = useRef(null);
  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  }, []);

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login user={user} loading={loading} onLogin={login} />} />

        {/* every page below needs a login and gets the sidebar */}
        <Route element={<AppLayout user={user} loading={loading} onLogout={logout} />}>
          <Route path="/dashboard" element={<Dashboard user={user} showToast={showToast} />} />
          <Route path="/leads" element={<Leads user={user} showToast={showToast} />} />
          <Route path="/audit" element={<Audit showToast={showToast} />} />
          <Route path="/cases" element={<Cases user={user} showToast={showToast} />} />
          <Route path="/reports" element={<Reports user={user} showToast={showToast} />} />
          <Route path="/employees" element={<Employees showToast={showToast} />} />
          <Route path="/employees/new" element={<AddEmployee />} />
        </Route>

        {Object.entries(LEGACY).map(([from, to]) => (
          <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
        ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      <div className={`toast${toast.show ? ' show' : ''}${toast.isError ? ' error' : ''}`}>
        {toast.message}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Protected layout: login check + role check + sidebar + page area
// ---------------------------------------------------------------------------
function AppLayout({ user, loading, onLogout }) {
  const { pathname } = useLocation();

  if (loading) return <div style={{ padding: 40, color: '#6b7686' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const section = SECTION_FOR_PATH[pathname];
  if (section && !allowedSectionsFor(user).includes(section)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} onLogout={onLogout} />
      <main className={pathname === '/dashboard' ? 'main dashboard-page' : 'main'}>
        <Outlet />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function activeKeyFor(location) {
  const p = location.pathname;
  if (p.startsWith('/cases')) {
    return new URLSearchParams(location.search).get('view') === 'processing'
      ? 'case-processing'
      : 'cases';
  }
  if (p.startsWith('/employees')) return 'employees';
  return p.split('/')[1] || 'dashboard';
}

function Sidebar({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  const activeKey = activeKeyFor(location);
  const allowed = allowedSectionsFor(user);

  const displayName = user.work_profile === 'MD' ? 'Mani' : user.name;
  const displayRole =
    user.work_profile === 'MD'
      ? 'Chairman'
      : user.role === 'manager'
      ? 'Manager'
      : user.role === 'mis-executive'
      ? 'MIS Executive'
      : user.role === 'employee'
      ? 'Employee'
      : user.role;

  const items = [
    { key: 'dashboard', to: '/dashboard', icon: '\u25A3', label: 'Dashboard' },
    { key: 'leads', to: '/leads', icon: '👤', label: 'Leads / Agreements' },
    { key: 'audit', to: '/audit', icon: '🎤', label: 'Quality Audit' },
    {
      key: 'cases',
      to: '/cases',
      icon: '📋',
      label: hasProfile(user, 'CASE_OFFICER') ? 'Case Processing' : 'Case Filing Ops',
    },
    { key: 'case-processing', to: '/cases?view=processing', icon: '📋', label: 'Case Processing' },
    { key: 'reports', to: '/reports', icon: '📊', label: 'Reports' },
    { key: 'employees', to: '/employees', icon: '👥', label: 'Employees' },
  ].filter((it) => allowed.includes(it.key));

  const handleLogout = async () => {
    await onLogout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="sidebar" id="sidebar">
      <div className="sidebar-logo">
        <img src="/images/brand-logo-img.png" className="brand-logo-img" alt="VJC Logo" />
        <strong>VJC OPS PORTAL</strong>
      </div>

      <NotificationBell />

      <div>
        {items.map((it) => (
          <Link
            key={it.key}
            to={it.to}
            className={`nav-item ${it.key === activeKey ? 'active' : ''}`}
          >
            <span className="ic">{it.icon}</span> {it.label}
          </Link>
        ))}
      </div>

      <div className="sidebar-footer">
        Logged in as
        <br />
        <b style={{ color: '#fff' }}>{displayName}</b>{' '}
        <span className="role-pill" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
          {displayRole}
        </span>
        <button id="logoutBtn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification bell (polls every 20s; desktop popup + sound for new items)
// ---------------------------------------------------------------------------

// Backend stores links like "/cases.html" (from the old multi-page app).
const LEGACY_LINK_TARGETS = {
  index: '/login',
  'view-employees': '/employees',
  'add-employee': '/employees/new',
};
function normalizeLink(link) {
  if (!link) return null;
  const m = String(link).match(/^\/?([\w-]+)\.html(.*)$/);
  if (!m) return link;
  return (LEGACY_LINK_TARGETS[m[1]] || `/${m[1]}`) + m[2];
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    /* some browsers block audio before the first user click */
  }
}

function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const seenIds = useRef(new Set());
  const firstPoll = useRef(true);

  const poll = useCallback(async () => {
    try {
      const data = await api.get('/notifications');
      const list = data.notifications || [];
      setUnreadCount(data.unreadCount || 0);
      setNotifications(list);

      const unread = list.filter((n) => !n.is_read);
      const fresh = unread.filter((n) => !seenIds.current.has(n.id));
      if (!firstPoll.current && fresh.length) {
        fresh.forEach((n) => {
          if ('Notification' in window && Notification.permission === 'granted') {
            const popup = new Notification('VJC Ops Portal', { body: n.message });
            popup.onclick = () => {
              window.focus();
              const to = normalizeLink(n.link);
              if (to) navigate(to);
            };
          }
        });
        playNotificationSound();
      }
      firstPoll.current = false;
      seenIds.current = new Set(unread.map((n) => n.id));
    } catch {
      /* silent: don't spam toasts for a background poll */
    }
  }, [navigate]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    poll();
    const id = setInterval(poll, 20000);
    return () => clearInterval(id);
  }, [poll]);

  // close when clicking anywhere outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const openNotification = async (n) => {
    try {
      await api.patch(`/notifications/${n.id}/read`);
      poll();
    } catch {
      /* ignore */
    }
    const to = normalizeLink(n.link);
    if (to) {
      setOpen(false);
      navigate(to);
    }
  };

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button type="button" className="notif-bell-btn" onClick={() => setOpen((o) => !o)}>
        🔔
        <span className="notif-badge" style={{ display: unreadCount ? 'inline-block' : 'none' }}>
          {unreadCount}
        </span>
      </button>

      {open && (
        <div className="notif-panel" style={{ display: 'block' }}>
          {notifications.length ? (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`notif-item ${n.is_read ? '' : 'unread'}`}
                onClick={() => openNotification(n)}
              >
                <div>{n.message}</div>
                <div className="notif-time">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))
          ) : (
            <div className="notif-empty">No notifications yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
