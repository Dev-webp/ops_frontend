import { useCallback, useEffect, useState } from 'react';
import { api } from './services/api';
import { hasProfile, num } from './Shared';

const DONUT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e34948', '#9085e9'];
const MEDALS = ['🥇', '🥈', '🥉'];

const scoreLabel = (v) => {
  const x = Number(v);
  return v !== null && v !== undefined && Number.isFinite(x) ? `${x}/10` : '—';
};

function KpiCard({ icon, label, value, sub, cls = '' }) {
  return (
    <div className={`kpi-card ${cls}`.trim()}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

function HBar({ label, value, max, color }) {
  const v = num(value);
  const pct = max > 0 ? Math.round((v / max) * 100) : 0;
  return (
    <div className="hbar-row">
      <div className="hbar-top">
        <span className="lbl">{label}</span>
        <span className="val">{v}</span>
      </div>
      <div className="hbar-track">
        <div className={`hbar-fill ${color}`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
}

const Empty = ({ children }) => <div className="empty-state">{children}</div>;

export default function Reports({ user, showToast }) {
  const management = hasProfile(user, 'MD', 'OPS_MANAGER');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState(null);

  const loadReport = useCallback(
    async (filters = { dateFrom, dateTo, employeeId }) => {
      try {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('date_from', filters.dateFrom);
        if (filters.dateTo) params.set('date_to', filters.dateTo);
        if (management && filters.employeeId) params.set('employee_id', filters.employeeId);
        const q = params.toString();
        setData(await api.get(`/reports/summary${q ? `?${q}` : ''}`));
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Could not load reports', true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [management, showToast]
  );

  // first load: employee dropdown (management only) + report
  useEffect(() => {
    if (management) {
      api
        .get('/reports/employees')
        .then((d) => setEmployees(d.employees || []))
        .catch((err) => console.error('Could not load employees:', err));
    }
    loadReport({ dateFrom: '', dateTo: '', employeeId: '' });
  }, [management, loadReport]);

  const k = data?.kpis || {};
  const lead = data?.leadBreakdown || {};
  const audit = data?.auditBreakdown || {};
  const cs = data?.caseBreakdown || {};
  const countries = data?.topCountries || [];
  const employeeReport = data?.employeeReport || [];
  const branchReport = data?.branchReport || [];

  const leadTotal = num(lead.signed) + num(lead.pending);
  const auditTotal = num(audit.approved) + num(audit.rejected) + num(audit.pending);
  const caseTotal = num(cs.inProgress) + num(cs.visaApproved) + num(cs.visaRejected);

  const ranked = employeeReport
    .map((r) => ({ ...r, score: num(r.leads) + num(r.audits) + num(r.cases) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // donut
  const countryTotal = countries.reduce((sum, r) => sum + num(r.total), 0);
  const pctOf = (r) => num(r.pct ?? Math.round((num(r.total) / countryTotal) * 100));
  let cursor = 0;
  const segments = countries.map((r, i) => {
    const start = cursor;
    cursor += pctOf(r);
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${start}% ${cursor}%`;
  });

  return (
    <>
      <div className="topbar">
        <h1>Reports</h1>
        <div className="who">Performance, activity and business insights</div>
      </div>

      {/* FILTERS */}
      <div className="section-card">
        <div className="form-inline-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end' }}>
          <div className="field">
            <label>Date From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>Date To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {management && (
            <div className="field">
              <label>Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.designation || e.work_profile}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            className="btn-primary"
            style={{ width: 'auto', padding: '12px 22px', height: 'fit-content' }}
            onClick={() => loadReport({ dateFrom, dateTo, employeeId })}
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="kpi-grid">
        <KpiCard icon="👤" label="Total Leads" value={num(k.totalLeads)} />
        <KpiCard
          icon="🎤"
          label="Quality Audits"
          value={num(k.totalAudits)}
          sub={audit.avgScore != null ? `Avg score ${scoreLabel(audit.avgScore)}` : 'No audits yet'}
          cls="orange"
        />
        <KpiCard icon="📋" label="Total Cases" value={num(k.totalCases)} />
        <KpiCard
          icon="✅"
          label="Visa Success Rate"
          value={`${num(k.visaSuccessRate)}%`}
          sub={`${num(cs.visaApproved)} approved / ${num(cs.visaRejected)} rejected`}
          cls="green"
        />
      </div>

      {/* BREAKDOWNS */}
      <div className="report-grid-2">
        <div className="section-card">
          <h3>Lead Pipeline</h3>
          {leadTotal ? (
            <>
              <HBar label="Agreement Signed" value={lead.signed} max={leadTotal} color="green" />
              <HBar label="Pending" value={lead.pending} max={leadTotal} color="orange" />
            </>
          ) : (
            <Empty>No leads in this range.</Empty>
          )}
        </div>

        <div className="section-card">
          <h3>Quality Audit Outcome</h3>
          {auditTotal ? (
            <>
              <HBar label="Approved" value={audit.approved} max={auditTotal} color="green" />
              <HBar label="Rejected" value={audit.rejected} max={auditTotal} color="red" />
              <HBar label="Pending" value={audit.pending} max={auditTotal} color="orange" />
            </>
          ) : (
            <Empty>No audits in this range.</Empty>
          )}
        </div>

        <div className="section-card">
          <h3>Case Filing &amp; Visa Outcome</h3>
          {caseTotal ? (
            <>
              <HBar label="In Progress" value={cs.inProgress} max={caseTotal} color="orange" />
              <HBar label="Visa Approved" value={cs.visaApproved} max={caseTotal} color="green" />
              <HBar label="Visa Rejected" value={cs.visaRejected} max={caseTotal} color="red" />
            </>
          ) : (
            <Empty>No cases in this range.</Empty>
          )}
        </div>
      </div>

      {/* TOP PERFORMERS */}
      {management && (
        <div className="section-card">
          <h3>Top Performers</h3>
          <div className="who" style={{ marginBottom: 14 }}>
            Ranked by total leads + audits + cases handled — visible only to Ops Manager and Chairman
          </div>
          {ranked.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              {ranked.map((r, i) => (
                <div key={r.id ?? r.name} style={{ background: '#f7f9fc', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>{MEDALS[i]}</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {r.designation || r.work_profile || '-'}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand-blue-dark)' }}>{r.score}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    total activity ({num(r.leads)} leads, {num(r.audits)} audits, {num(r.cases)} cases)
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No employee activity yet.</Empty>
          )}
        </div>
      )}

      {/* TOP COUNTRIES */}
      <div className="section-card">
        <h3>Top Destination Countries</h3>
        {!countries.length || countryTotal === 0 ? (
          <Empty>No leads in this range.</Empty>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  background: `conic-gradient(${segments.join(',')})`,
                }}
              ></div>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)',
                  width: 86,
                  height: 86,
                  borderRadius: '50%',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-dark)' }}>{countryTotal}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>total leads</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              {countries.map((r, i) => (
                <div
                  key={r.country}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0' }}
                >
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 9,
                        height: 9,
                        background: DONUT_COLORS[i % DONUT_COLORS.length],
                        borderRadius: 2,
                        marginRight: 7,
                      }}
                    ></span>
                    {r.country}
                  </span>
                  <strong>
                    {num(r.total)} ({pctOf(r)}%)
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* EMPLOYEE REPORT */}
      {management && (
        <div className="section-card">
          <h3>Employee-wise Performance</h3>
          <div className="who" style={{ marginBottom: 12 }}>Visible only to Ops Manager and Chairman</div>
          <table>
            <thead>
              <tr>
                <th>Employee</th><th>Role</th><th>Leads</th><th>Audits</th>
                <th>Avg Score</th><th>Cases</th><th>Visa Approved</th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan="7" className="empty-state">Loading…</td></tr>
              ) : employeeReport.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">No employee data found.</td></tr>
              ) : (
                employeeReport.map((r) => (
                  <tr key={r.id ?? r.name}>
                    <td><strong>{r.name}</strong></td>
                    <td><span className="badge info">{r.designation || r.work_profile || '-'}</span></td>
                    <td>{num(r.leads)}</td>
                    <td>{num(r.audits)}</td>
                    <td>{scoreLabel(r.avg_score)}</td>
                    <td>{num(r.cases)}</td>
                    <td><span className="badge approved">{num(r.visa_approved)}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* BRANCH REPORT */}
      {management && (
        <div className="section-card">
          <h3>Branch-wise Performance</h3>
          <div className="who" style={{ marginBottom: 12 }}>All-time totals, not affected by date filter</div>
          <table>
            <thead>
              <tr><th>Branch</th><th>City</th><th>Leads</th><th>Cases</th><th>Visa Approved</th></tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan="5" className="empty-state">Loading…</td></tr>
              ) : branchReport.length === 0 ? (
                <tr><td colSpan="5" className="empty-state">No branches found.</td></tr>
              ) : (
                branchReport.map((r) => (
                  <tr key={r.id ?? r.branch_name}>
                    <td><strong>{r.branch_name}</strong></td>
                    <td>{r.city}</td>
                    <td>{num(r.leads)}</td>
                    <td>{num(r.cases)}</td>
                    <td><span className="badge approved">{num(r.visa_approved)}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
