import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './services/api';
import { allowedSectionsFor, num } from './Shared';

const STAGE_MAP = {
  AGREEMENT_SIGNED: 'Counselor',
  AUDIT_PENDING: 'Quality Audit',
  AUDIT_APPROVED: 'OPS',
  CASE_ASSIGNED: 'Case Officer',
  CASE_PROCESSING: 'Case Officer',
  CASE_FILED: 'Visa Outcome',
};

const statusClass = (status) => {
  const v = String(status || '').toUpperCase();
  if (v === 'APPROVED') return 'approved';
  if (v === 'PENDING') return 'pending';
  return 'rejected';
};

const QUICK_ACTIONS = [
  { section: 'leads', to: '/leads', icon: '+', title: 'Leads / Agreements', text: 'View lead pipeline' },
  { section: 'audit', to: '/audit', icon: '✓', title: 'Quality Audit', text: 'Review audit work' },
  { section: 'cases', to: '/cases', icon: '□', title: 'Case Filing', text: 'Manage cases' },
  { section: 'employees', to: '/employees', icon: '●', title: 'Employees', text: 'Manage employees' },
];

// used only on this page
const fmtDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function greetingFor(date) {
  const h = date.getHours();
  if (h >= 17) return 'Good Evening';
  if (h >= 12) return 'Good Afternoon';
  return 'Good Morning';
}

export default function Dashboard({ user, showToast }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    api
      .get('/dashboard/stats')
      .then(setStats)
      .catch((err) => {
        console.error('Dashboard loading error:', err);
        showToast(err.message || 'Unable to load dashboard data', true);
        setError(true);
      });
  }, [showToast]);

  // ---------- derived numbers ----------
  const leads = stats?.leads || {};
  const audits = stats?.audits || {};
  const cases = stats?.cases || {};

  const totalLeads = num(leads.total);
  const pendingAudit = num(audits.pending);
  const auditApproved = num(audits.approved);
  const auditRejected = num(audits.rejected);
  const totalCases = num(cases.total);
  const completedCases = num(cases.completed);
  const inProgressCases = num(cases.inProgress);

  const pipeline = stats?.pipeline || cases.pipeline || {};
  const stageValues = [
    num(pipeline.counselor ?? pipeline.leads ?? leads.total),
    num(pipeline.qualityAudit ?? pipeline.audit ?? audits.pending),
    num(pipeline.ops ?? pipeline.inProcess ?? cases.inProgress),
    num(pipeline.caseOfficer ?? pipeline.case_officer ?? cases.inProgress),
    num(pipeline.visaOutcome ?? pipeline.visa_outcome ?? cases.completed),
  ];
  const pipelineStages = [
    ['Counselor', 'Leads Assigned'],
    ['Quality Audit', 'In Audit'],
    ['OPS', 'In Process'],
    ['Case Officer', 'File Preparation'],
    ['Visa Outcome', 'Completed'],
  ];

  const recentAudits = Array.isArray(stats?.recentAudits) ? stats.recentAudits.slice(0, 5) : [];

  const tasks = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (pendingAudit > 0)
    tasks.push({ title: 'Review pending audit cases', meta: plural(pendingAudit, 'case'), priority: 'High', cls: 'high' });
  if (inProgressCases > 0)
    tasks.push({ title: 'Review active case processing', meta: plural(inProgressCases, 'case'), priority: 'Medium', cls: 'medium' });
  if (totalLeads > 0)
    tasks.push({ title: 'Follow up with active leads', meta: plural(totalLeads, 'lead'), priority: 'Medium', cls: 'medium' });
  if (auditRejected > 0)
    tasks.push({ title: 'Review rejected audits', meta: plural(auditRejected, 'case'), priority: 'High', cls: 'high' });
  if (!tasks.length)
    tasks.push({ title: 'No pending operational tasks', meta: 'Everything is up to date', priority: 'Low', cls: 'low' });

  const show = (v) => (stats ? v : '–');
  const allowed = allowedSectionsFor(user);

  return (
    <>
      {/* HEADER */}
      <section className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>
            {greetingFor(now)}, {user?.name || user?.email || 'User'} 👋
          </h1>
          <p>Here's a quick overview of your OPS operations.</p>
        </div>

        <div className="dashboard-header-right">
          <input
            type="search"
            className="dashboard-search"
            placeholder="Search leads, clients, cases, agreements..."
            autoComplete="off"
          />
          <div className="dashboard-date">
            <div className="dashboard-date-icon">▣</div>
            <div>
              <strong>
                {now.toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </strong>
              <div>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI CARDS */}
      <section className="dashboard-kpis">
        <Kpi label="Total Leads" icon="●" value={show(totalLeads)} sub="Current pipeline" />
        <Kpi cls="warning" label="Pending Audit" icon="◷" value={show(pendingAudit)} sub="Awaiting review" />
        <Kpi cls="success" label="Audit Approved" icon="✓" value={show(auditApproved)} sub="Approved audits" />
        <Kpi cls="danger" label="Cases In Progress" icon="↗" value={show(inProgressCases)} sub="Active case work" />
      </section>

      {/* PIPELINE + QUICK ACTIONS */}
      <section className="dashboard-main-grid">
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">Case Filing — Stage Overview</h2>
              <p className="dashboard-panel-subtitle">Current cases across the operational workflow</p>
            </div>
            <select className="dashboard-filter" defaultValue="current">
              <option value="current">Current</option>
            </select>
          </div>

          <div className="case-pipeline">
            {pipelineStages.map(([label, status], i) => {
              const value = stageValues[i] || 0;
              const pct = totalCases > 0 ? Math.min((value / totalCases) * 100, 100) : 0;
              return (
                <div className="pipeline-stage" key={label}>
                  <div className="pipeline-stage-label">{label}</div>
                  <div className="pipeline-stage-value">{stats ? value : '–'}</div>
                  <div className="pipeline-stage-status">{status}</div>
                  <div className="pipeline-stage-line">
                    <span style={{ width: `${pct}%` }}></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">Quick Actions</h2>
              <p className="dashboard-panel-subtitle">Common operational actions</p>
            </div>
          </div>
          <div className="quick-actions">
            {QUICK_ACTIONS.filter((a) => allowed.includes(a.section)).map((a) => (
              <Link key={a.to} to={a.to} className="quick-action">
                <div className="quick-action-icon">{a.icon}</div>
                <div className="quick-action-title">{a.title}</div>
                <div className="quick-action-text">{a.text}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM */}
      <section className="dashboard-bottom-grid">
        {/* RECENT AUDIT */}
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">Recent Audit Activity</h2>
              <p className="dashboard-panel-subtitle">Latest quality audit activity</p>
            </div>
            {allowed.includes('audit') && (
              <Link to="/audit" style={{ color: '#246bce', fontSize: 11, fontWeight: 750 }}>
                View All →
              </Link>
            )}
          </div>

          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Stage</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <EmptyRow>Unable to load audit activity.</EmptyRow>
                ) : !stats ? (
                  <EmptyRow>Loading...</EmptyRow>
                ) : recentAudits.length === 0 ? (
                  <EmptyRow>No audit activity yet.</EmptyRow>
                ) : (
                  recentAudits.map((a, i) => {
                    const stage = a.stage_name || a.stage || STAGE_MAP[a.current_status] || 'Quality Audit';
                    const stageClass = stage.toLowerCase().replace(/\s+/g, '-');
                    const score =
                      a.score !== null && a.score !== undefined && a.score !== '' ? `${a.score}/10` : '-';
                    const status = a.status || a.result || 'PENDING';
                    return (
                      <tr key={a.id ?? i}>
                        <td>{i + 1}</td>
                        <td>{a.student_name || a.studentName || a.name || '-'}</td>
                        <td>
                          <span className={`audit-stage-pill ${stageClass}`}>{stage}</span>
                        </td>
                        <td>{score}</td>
                        <td>
                          <span className={`status-pill ${statusClass(status)}`}>{status}</span>
                        </td>
                        <td>{fmtDate(a.audited_at || a.created_at || a.date)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CASE STATUS */}
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">Case Status</h2>
              <p className="dashboard-panel-subtitle">Current case distribution</p>
            </div>
          </div>
          <div className="case-status-body">
            <div className="case-status-visual">
              <div className="case-status-inner">
                <strong>{error ? 0 : show(totalCases)}</strong>
                <span>Total Cases</span>
              </div>
            </div>
            <div className="case-status-list">
              {[
                ['Leads', totalLeads],
                ['Quality Audit', pendingAudit],
                ['OPS', inProgressCases],
                ['Case Officer', inProgressCases],
                ['Visa Outcome', completedCases],
              ].map(([label, value]) => (
                <div className="case-status-item" key={label}>
                  <div className="case-status-name">
                    <span className="case-status-dot"></span>
                    {label}
                  </div>
                  <span className="case-status-count">{error ? 0 : show(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TODAY'S TASKS */}
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">Today's Tasks</h2>
              <p className="dashboard-panel-subtitle">Operational follow-ups</p>
            </div>
            {allowed.includes('cases') && (
              <Link to="/cases" style={{ color: '#246bce', fontSize: 11, fontWeight: 750 }}>
                View All →
              </Link>
            )}
          </div>
          <div className="dashboard-tasks">
            {error ? (
              <div className="dashboard-empty">Unable to load today's tasks.</div>
            ) : !stats ? (
              <div className="dashboard-empty">Loading...</div>
            ) : (
              tasks.slice(0, 5).map((t) => (
                <div className="task-item" key={t.title}>
                  <input type="checkbox" className="task-check" />
                  <div className="task-content">
                    <div className="task-title">{t.title}</div>
                    <div className="task-meta">{t.meta}</div>
                  </div>
                  <span className={`task-priority ${t.cls}`}>{t.priority}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Kpi({ cls = '', label, icon, value, sub }) {
  return (
    <div className={`dashboard-kpi ${cls}`.trim()}>
      <div className="dashboard-kpi-head">
        <div className="dashboard-kpi-label">{label}</div>
        <div className="dashboard-kpi-icon">{icon}</div>
      </div>
      <div className="dashboard-kpi-value">{value}</div>
      <div className="dashboard-kpi-sub">{sub}</div>
    </div>
  );
}

function EmptyRow({ children }) {
  return (
    <tr>
      <td colSpan="6">
        <div className="dashboard-empty">{children}</div>
      </td>
    </tr>
  );
}
