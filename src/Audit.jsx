import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fileUrl } from './services/api';
import { Modal, Pagination, inr } from './Shared';

const PAGE_SIZE = 15;

function AgreementLink({ url }) {
  return url ? (
    <a href={fileUrl(url)} target="_blank" rel="noreferrer">
      View Agreement
    </a>
  ) : (
    '—'
  );
}

function InvoiceBlock({ d }) {
  return (
    <>
      <div><strong>Invoice No:</strong> {d.invoice_number || '—'}</div>
      <div><strong>Total Amount:</strong> {inr(d.total_amount)}</div>
      <div><strong>Paid Amount:</strong> {inr(d.paid_amount)}</div>
      <div><strong>Outstanding:</strong> {inr(d.outstanding_amount)}</div>
      <div><strong>Payment Status:</strong> {d.payment_status || '—'}</div>
      <div><strong>Sent to OPS By:</strong> {d.sent_to_ops_by_name || '—'}</div>
      <div style={{ marginTop: 8 }}>
        <strong>Agreement PDF:</strong> <AgreementLink url={d.agreement_pdf_url} />
      </div>
    </>
  );
}

export default function Audit({ showToast }) {
  const [pendingLeads, setPendingLeads] = useState([]);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('pending'); // pending | approved | rejected
  const [pendingPage, setPendingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // scorecard modal
  const [auditLead, setAuditLead] = useState(null);
  const [checks, setChecks] = useState({ fees: true, promises: true, embassy: true });
  const [score, setScore] = useState(8);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef(null);

  // details modal
  const [details, setDetails] = useState(null);

  const loadPending = useCallback(async () => {
    try {
      const { leads } = await api.get('/audits/pending');
      setPendingLeads(leads);
      setPendingPage(1);
    } catch (err) {
      showToast(err.message, true);
    }
  }, [showToast]);

  const loadHistory = useCallback(async () => {
    try {
      const { audits } = await api.get('/audits/history');
      setHistory(audits);
    } catch (err) {
      showToast(err.message, true);
    }
  }, [showToast]);

  useEffect(() => {
    loadPending();
    loadHistory();
  }, [loadPending, loadHistory]);

  const approved = history.filter((a) => a.status === 'APPROVED');
  const rejected = history.filter((a) => a.status === 'REJECTED');

  const openScorecard = (lead) => {
    setAuditLead(lead);
    setChecks({ fees: true, promises: true, embassy: true });
    setScore(8);
    setRemarks('');
  };

  const submitAudit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('fees_match_agreement', checks.fees);
    fd.append('no_unauthorized_promises', checks.promises);
    fd.append('student_understands_embassy_discretion', checks.embassy);
    fd.append('score', score);
    fd.append('auditor_remarks', remarks);
    const file = audioRef.current?.files?.[0];
    if (file) fd.append('audio', file);

    setSubmitting(true);
    try {
      const res = await api.upload(`/audits/${auditLead.id}`, fd);
      showToast(res.message);
      setAuditLead(null);
      loadPending();
      loadHistory();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSubmitting(false);
    }
  };

  const changeView = (v) => {
    setView(v);
    setHistoryPage(1);
  };

  const historyList = view === 'approved' ? approved : rejected;
  const historyStart = (historyPage - 1) * PAGE_SIZE;
  const historyRows = historyList.slice(historyStart, historyStart + PAGE_SIZE);
  const pendingStart = (pendingPage - 1) * PAGE_SIZE;
  const pendingRows = pendingLeads.slice(pendingStart, pendingStart + PAGE_SIZE);

  return (
    <>
      <div className="topbar">
        <h1>Quality Audit Hub</h1>
        <div className="who">Recorded verification call → 1–10 scorecard → 7+ required to pass</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card orange">
          <div className="icon">🎤</div><div className="label">Pending Calls</div>
          <div className="value">{pendingLeads.length}</div>
        </div>
        <div className="stat-card green">
          <div className="icon">✅</div><div className="label">Approved</div>
          <div className="value">{approved.length}</div>
        </div>
        <div className="stat-card red">
          <div className="icon">❌</div><div className="label">Rejected</div>
          <div className="value">{rejected.length}</div>
        </div>
        <div className="stat-card">
          <div className="icon">📊</div><div className="label">Total Audits</div>
          <div className="value">{history.length}</div>
        </div>
      </div>

      <div className="audit-filter-bar">
        <button type="button" className={`audit-filter-btn ${view === 'pending' ? 'active' : ''}`} onClick={() => changeView('pending')}>
          📋 Pending Verification Calls
        </button>
        <button type="button" className={`audit-filter-btn ${view === 'approved' ? 'active' : ''}`} onClick={() => changeView('approved')}>
          ✅ Approved Audits
        </button>
        <button type="button" className={`audit-filter-btn ${view === 'rejected' ? 'active' : ''}`} onClick={() => changeView('rejected')}>
          ❌ Rejected Audits
        </button>
      </div>

      {view === 'pending' ? (
        <div className="section-card">
          <h3>Pending Verification Calls</h3>
          <table>
            <thead>
              <tr><th>Student</th><th>Country</th><th>Visa</th><th>Counselor</th><th></th></tr>
            </thead>
            <tbody>
              {pendingRows.length === 0 ? (
                <tr><td colSpan="5" className="empty-state">Nothing waiting — queue is clear.</td></tr>
              ) : (
                pendingRows.map((l) => (
                  <tr key={l.id}>
                    <td>{l.student_name}</td>
                    <td>{l.target_country}</td>
                    <td>{l.visa_category}</td>
                    <td>{l.counselor_name || '—'}</td>
                    <td>
                      <button className="btn-sm orange" onClick={() => openScorecard(l)}>
                        Start Audit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination variant="audit" page={pendingPage} total={pendingLeads.length} pageSize={PAGE_SIZE} onChange={setPendingPage} />
        </div>
      ) : (
        <div className="section-card">
          <h3>{view === 'approved' ? 'Approved Audits' : 'Rejected Audits'}</h3>
          <table>
            <thead>
              <tr><th>Student</th><th>Auditor</th><th>Score</th><th>Result</th><th>Remarks</th><th>Audio</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {historyRows.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">No audits yet.</td></tr>
              ) : (
                historyRows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.student_name}</td>
                    <td>{a.auditor_name || '—'}</td>
                    <td>{a.score}/10</td>
                    <td>
                      <span className={`badge ${a.status === 'APPROVED' ? 'approved' : 'rejected'}`}>{a.status}</span>
                    </td>
                    <td>{a.auditor_remarks || '—'}</td>
                    <td>
                      {a.audio_url ? (
                        <a href={fileUrl(a.audio_url)} target="_blank" rel="noreferrer">▶ Play</a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn-sm outline" onClick={() => setDetails(a)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination variant="audit" page={historyPage} total={historyList.length} pageSize={PAGE_SIZE} onChange={setHistoryPage} />
        </div>
      )}

      {/* SCORECARD MODAL */}
      <Modal open={!!auditLead}>
        <h3>Verification Call — {auditLead?.student_name}</h3>
        <form onSubmit={submitAudit}>
          {auditLead && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
                <h4 style={{ margin: '0 0 10px' }}>Invoice Details</h4>
                <div><strong>Student Name:</strong> {auditLead.student_name || '—'}</div>
                <div><strong>Phone:</strong> {auditLead.phone || '—'}</div>
                <div><strong>Email:</strong> {auditLead.email || '—'}</div>
                <InvoiceBlock d={auditLead} />
              </div>
            </div>
          )}

          <div className="checklist-item">
            <input type="checkbox" id="chk1" checked={checks.fees} onChange={(e) => setChecks({ ...checks, fees: e.target.checked })} />
            <label htmlFor="chk1">Fees &amp; installment commitments match the signed agreement</label>
          </div>
          <div className="checklist-item">
            <input type="checkbox" id="chk2" checked={checks.promises} onChange={(e) => setChecks({ ...checks, promises: e.target.checked })} />
            <label htmlFor="chk2">No unauthorized/impossible promises made (guaranteed visa, fake docs)</label>
          </div>
          <div className="checklist-item">
            <input type="checkbox" id="chk3" checked={checks.embassy} onChange={(e) => setChecks({ ...checks, embassy: e.target.checked })} />
            <label htmlFor="chk3">Student understands visa approval is at embassy's sole discretion</label>
          </div>

          <div className="score-row">
            <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Score (1–10)</label>
            <input type="range" min="1" max="10" value={score} onChange={(e) => setScore(e.target.value)} />
            <div className="score-val">{score}</div>
          </div>

          <div className="field">
            <label>Call Audio (mp3 / wav / m4a)</label>
            <input type="file" ref={audioRef} accept=".mp3,.wav,.m4a,.ogg" />
          </div>

          <div className="field">
            <label>Auditor Remarks</label>
            <textarea
              rows="3"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Notes about the call... (required if score is below 7 — this becomes the rejection reason the counselor sees)"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-sm outline" onClick={() => setAuditLead(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-sm orange" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Audit'}
            </button>
          </div>
        </form>
      </Modal>

      {/* AUDIT DETAILS MODAL */}
      <Modal open={!!details}>
        <h3>Audit Details — {details?.student_name || '—'}</h3>
        {details && (
          <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 10px' }}>Student Details</h4>
            <div><strong>Student Name:</strong> {details.student_name || '—'}</div>
            <div><strong>Phone:</strong> {details.phone || '—'}</div>
            <div><strong>Email:</strong> {details.email || '—'}</div>
            <div><strong>Country:</strong> {details.target_country || '—'}</div>
            <div><strong>Visa Category:</strong> {details.visa_category || '—'}</div>
            <div><strong>Counselor:</strong> {details.counselor_name || '—'}</div>

            <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid #ddd' }} />
            <h4 style={{ margin: '0 0 10px' }}>Invoice Details</h4>
            <InvoiceBlock d={details} />

            <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid #ddd' }} />
            <h4 style={{ margin: '0 0 10px' }}>Audit Details</h4>
            <div><strong>Auditor:</strong> {details.auditor_name || '—'}</div>
            <div><strong>Score:</strong> {details.score || '—'}/10</div>
            <div>
              <strong>Result:</strong>{' '}
              <span className={`badge ${details.status === 'APPROVED' ? 'approved' : 'rejected'}`}>
                {details.status || '—'}
              </span>
            </div>
            <div><strong>Remarks:</strong> {details.auditor_remarks || '—'}</div>
            <div style={{ marginTop: 8 }}>
              <strong>Call Audio:</strong>{' '}
              {details.audio_url ? (
                <a href={fileUrl(details.audio_url)} target="_blank" rel="noreferrer">▶ Play Audio</a>
              ) : (
                '—'
              )}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-sm outline" onClick={() => setDetails(null)}>
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}
