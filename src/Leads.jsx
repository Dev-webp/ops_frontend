import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fileUrl } from './services/api';
import { Modal, Pagination, hasProfile, inr, underscoreToSpace } from './Shared';

const PAGE_SIZE = 20;

const BADGE = {
  PENDING_INVOICE_REVIEW: 'info',
  AGREEMENT_SIGNED: 'info',
  AUDIT_PENDING: 'pending',
  AUDIT_FAILED: 'rejected',
  AUDIT_APPROVED: 'approved',
  CASE_ASSIGNED: 'info',
  CASE_FILED: 'approved',
};

const TAB_FILTERS = {
  new: (l) => l.current_status === 'PENDING_INVOICE_REVIEW',

  progress: (l) =>
    !['PENDING_INVOICE_REVIEW', 'AUDIT_FAILED'].includes(l.current_status),

  returned: (l) => l.current_status === 'AUDIT_FAILED',

  all: () => true,
};

const TABS = [
  { key: 'new', icon: '📋', title: 'New Leads' },
  { key: 'progress', icon: '✓', title: 'In Progress' },
  { key: 'returned', icon: '✕', title: 'Returned / Rejected' },
];

const EMPTY_FORM = {
  student_name: '',
  phone: '',
  email: '',
  target_country: '',
  visa_category: '',
  package_amount: '',
};

function StatusBadge({ status }) {
  const label = status === 'PENDING_INVOICE_REVIEW' ? 'NEW (FROM INVOICE)' : underscoreToSpace(status);
  return <span className={`badge ${BADGE[status] || 'info'}`}>{label}</span>;
}

export default function Leads({ user, showToast }) {
  // Counselors, OPS Managers and the MD may confirm an invoice lead (matches backend/routes/leads.js)
  const canConfirmInvoice = hasProfile(user, 'COUNSELOR', 'OPS_MANAGER', 'MD');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
const [activeTab, setActiveTab] = useState('new');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [invoiceLead, setInvoiceLead] = useState(null);
  const [invoiceReadOnly, setInvoiceReadOnly] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const [correction, setCorrection] = useState(null); // { leadId, reason }
  const [correctionText, setCorrectionText] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      const { leads } = await api.get('/leads');
      setLeads(leads);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // ---- derived data ----
  const counts = useMemo(
  () => ({
    new: leads.filter(TAB_FILTERS.new).length,
    progress: leads.filter(TAB_FILTERS.progress).length,
    returned: leads.filter(TAB_FILTERS.returned).length,
  }),
  [leads]
);
  const pendingInvoice = leads.filter((l) => l.current_status === 'PENDING_INVOICE_REVIEW').length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
return leads.filter(TAB_FILTERS[activeTab] || TAB_FILTERS.new).filter((l) => {
        if (!term) return true;
      return ['student_name', 'target_country', 'visa_category'].some((k) =>
        String(l[k] || '').toLowerCase().includes(term)
      );
    });
  }, [leads, activeTab, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageLeads = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const switchTab = (key) => {
    setActiveTab(key);
    setPage(1);
  };

  // ---- actions ----
  const submitLead = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leads', { ...form, package_amount: Number(form.package_amount) || 0 });
      showToast('Lead added — ready for Quality Audit.');
      setForm(EMPTY_FORM);
      loadLeads();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const openCorrection = (lead) => {
    setCorrection({ leadId: lead.id, reason: lead.last_audit_remarks || 'No reason given' });
    setCorrectionText('');
    setCorrectionError('');
  };

  const saveCorrection = async () => {
    if (!correction) return;
    if (!correctionText.trim()) {
      setCorrectionError('Please enter what you corrected before resubmitting.');
      return;
    }
    setCorrectionError('');
    setCorrectionBusy(true);
    try {
      await api.patch(`/leads/${correction.leadId}/resubmit`, {
        correction_details: correctionText.trim(),
      });
      setCorrection(null);
      showToast('Correction saved — Lead sent back to Quality Audit.');
      await loadLeads();
    } catch (err) {
      setCorrectionError(err.message);
    } finally {
      setCorrectionBusy(false);
    }
  };

  const openInvoice = (lead, readOnly = false) => {
    setInvoiceLead(lead);
    setInvoiceReadOnly(readOnly);
  };

  const confirmInvoiceLead = async () => {
    if (!invoiceLead) return;
    setInvoiceBusy(true);
    try {
      await api.patch(`/leads/${invoiceLead.id}/confirm-from-invoice`);
      showToast('Lead added — sent to Quality Audit.');
      setInvoiceLead(null);
      await loadLeads();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setInvoiceBusy(false);
    }
  };

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const invoiceRows = invoiceLead
    ? [
        ['Student Name', invoiceLead.student_name],
        ['Phone', invoiceLead.phone],
        ['Email', invoiceLead.email || '—'],
        ['Service Type', invoiceLead.target_country],
        ['Invoice No', invoiceLead.invoice_number || '—'],
        ['Total Amount', invoiceLead.total_amount != null ? inr(invoiceLead.total_amount) : '—'],
        ['Paid Amount', invoiceLead.paid_amount != null ? inr(invoiceLead.paid_amount) : '—'],
        ['Outstanding', invoiceLead.outstanding_amount != null ? inr(invoiceLead.outstanding_amount) : '—'],
        ['Payment Status', invoiceLead.payment_status || '—'],
        ['Sent to OPS By', invoiceLead.sent_to_ops_by_name || '—'],
        [
          'Agreement PDF',
          invoiceLead.agreement_pdf_url ? (
            <a href={fileUrl(invoiceLead.agreement_pdf_url)} target="_blank" rel="noreferrer">
              View Agreement
            </a>
          ) : (
            '—'
          ),
        ],
      ]
    : [];

  const thStyle = { color: '#000', fontWeight: 700 };

  return (
    <>

<div className="topbar">
  
<h1
  style={{
    fontWeight: 900,
    fontSize: '28px',
    letterSpacing: '-0.7px',
    color: '#102a56',
    margin: 0,
    lineHeight: 1.2,
    WebkitTextStroke: '0.5px currentColor'
  }}
>
  Leads &amp; Agreements
</h1>


  <button
    type="button"
    className="btn-primary"
    style={{ marginLeft: 'auto', width: 'auto', padding: '11px 20px', whiteSpace: 'nowrap' }}
    onClick={() => setShowAddForm((s) => !s)}
  >

          + Add New Lead (Manual)
        </button>
      </div>

      
{/* ADD NEW LEAD */}
{showAddForm && (
  <div className="section-card manual-lead-form">
    <div className="manual-lead-header">
      <div>
        <h3>Add New Lead</h3>
        <p>Enter student, invoice and agreement details.</p>
      </div>

      <button
        type="button"
        className="btn-secondary"
        onClick={() => setShowAddForm(false)}
      >
        Close
      </button>
    </div>

    <form onSubmit={submitLead}>
      <h4>Student Details</h4>

      <div className="manual-lead-grid">
        <div className="field">
          <label>Student Name *</label>
          <input
            required
            value={form.student_name}
            onChange={setField('student_name')}
            placeholder="Enter student name"
          />
        </div>

        <div className="field">
          <label>Phone *</label>
          <input
            required
            value={form.phone}
            onChange={setField('phone')}
            placeholder="Enter phone number"
          />
        </div>

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={setField('email')}
            placeholder="Enter email address"
          />
        </div>

        <div className="field">
          <label>Country / Service Type *</label>
          <input
            required
            value={form.target_country}
            onChange={setField('target_country')}
            placeholder="Enter country or service"
          />
        </div>

        <div className="field">
          <label>Visa Category *</label>
          <input
            required
            value={form.visa_category}
            onChange={setField('visa_category')}
            placeholder="Enter visa category"
          />
        </div>
      </div>

      <h4>Invoice Details</h4>

      <div className="manual-lead-grid">
        <div className="field">
          <label>Invoice Number</label>
          <input
            value={form.invoice_number || ''}
            onChange={setField('invoice_number')}
            placeholder="Enter invoice number"
          />
        </div>

        <div className="field">
          <label>Total Amount (₹) *</label>
          <input
            type="number"
            min="0"
            required
            value={form.total_amount || ''}
            onChange={setField('total_amount')}
            placeholder="0.00"
          />
        </div>

        <div className="field">
          <label>Paid Amount (₹)</label>
          <input
            type="number"
            min="0"
            value={form.paid_amount || ''}
            onChange={setField('paid_amount')}
            placeholder="0.00"
          />
        </div>

        <div className="field">
          <label>Outstanding Amount (₹)</label>
          <input
            value={Math.max(
              0,
              Number(form.total_amount || 0) -
                Number(form.paid_amount || 0)
            ).toLocaleString('en-IN')}
            readOnly
          />
        </div>

        <div className="field">
          <label>Payment Status</label>
          <select
            value={form.payment_status || 'Pending'}
            onChange={setField('payment_status')}
          >
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
          </select>
        </div>

        <div className="field">
          <label>Package Amount (₹)</label>
          <input
            type="number"
            min="0"
            value={form.package_amount}
            onChange={setField('package_amount')}
            placeholder="0.00"
          />
        </div>
      </div>

      <h4>Agreement Document</h4>

      <div className="field manual-agreement-upload">
        <label htmlFor="manual-agreement-pdf">
          Upload Agreement PDF
        </label>

        <input
          id="manual-agreement-pdf"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];

            if (file && file.type !== 'application/pdf') {
              showToast('Please select a PDF file.', true);
              e.target.value = '';
              return;
            }

            setForm((f) => ({
              ...f,
              agreement_pdf_file: file || null
            }));
          }}
        />

        <small>PDF format only.</small>
      </div>

      <div className="manual-lead-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowAddForm(false)}
        >
          Cancel
        </button>

        <button type="submit" className="btn-primary">
          Save Lead
        </button>
      </div>
    </form>
  </div>
)}

      {/* STAT CARDS */}
<div className="stat-grid">
  <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => switchTab('new')}>
    <div className="icon">📋</div>
    <div className="label">New Leads</div>
    <div className="value">{counts.new}</div>
  </div>

  <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => switchTab('progress')}>
    <div className="icon">🔄</div>
    <div className="label">In Progress</div>
    <div className="value">{counts.progress}</div>
  </div>

  <div className="stat-card red" style={{ cursor: 'pointer' }} onClick={() => switchTab('returned')}>
    <div className="icon">❌</div>
    <div className="label">Returned / Rejected</div>
    <div className="value">{counts.returned}</div>
  </div>
      </div>

      {/* FILTER BAR */}
      <div className="lead-filter-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-tab={t.key}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            <span className="lead-filter-icon">{t.icon}</span>
            <span className="lead-filter-text">
              <strong>{t.title}</strong>
            </span>
            <span className="lead-filter-count">{counts[t.key]}</span>
          </button>
        ))}

        <div className="lead-search-box">
          <span className="lead-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search by student name, country, visa..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* LEADS TABLE */}
      <div className="section-card">
        <h3>Leads</h3>
        <table>
          <thead>
            <tr>
              {['S.No', 'Student', 'Country', 'Visa', 'Status', 'Created', 'Action'].map((h) => (
                <th key={h} style={thStyle}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  Loading…
                </td>
              </tr>
            ) : pageLeads.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  No leads in this tab.
                </td>
              </tr>
            ) : (
              pageLeads.map((l, i) => {
                const isFailed = l.current_status === 'AUDIT_FAILED';
                const isInvoicePending = l.current_status === 'PENDING_INVOICE_REVIEW';
                return (
                  <tr key={l.id}>
                    <td>{startIndex + i + 1}</td>
                    <td>{l.student_name}</td>
                    <td>{l.target_country}</td>
                    <td>{l.visa_category}</td>
                    <td>
                      <StatusBadge status={l.current_status} />
                      {isFailed && (
                        <div className="empty-state" style={{ marginTop: 4 }}>
                          Score: {l.last_audit_score ?? '—'}/10 — Reason:{' '}
                          {l.last_audit_remarks || 'No reason given'}
                        </div>
                      )}
                    </td>
                    <td>{new Date(l.created_at).toLocaleDateString()}</td>
                    <td>
                      {isFailed && (
                        <button type="button" className="btn-sm orange" onClick={() => openCorrection(l)}>
                          View / Correct
                        </button>
                      )}
                      {isInvoicePending && canConfirmInvoice && (
                        <button type="button" className="btn-sm green" onClick={() => openInvoice(l)}>
                          Add Lead
                        </button>
                      )}
                      {l.source === 'FROM_INVOICE' && !isInvoicePending && (
                        <button
                          type="button"
                          className="btn-sm outline"
                          style={{ marginTop: 4 }}
                          onClick={() => openInvoice(l, true)}
                        >
                          View Invoice
                        </button>
                      )}
                      {!isFailed && !(isInvoicePending && canConfirmInvoice) && !(l.source === 'FROM_INVOICE' && !isInvoicePending) && '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <Pagination
          variant="leads"
          page={currentPage}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>

      {/* INVOICE REVIEW MODAL */}
      <Modal open={!!invoiceLead}>
        <h2>Review — Lead from Invoice</h2>
        <table>
          <tbody>
            {invoiceRows.map(([label, value]) => (
              <tr key={label}>
                <td style={{ fontWeight: 600 }}>{label}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
          {!invoiceReadOnly && (
            <button type="button" className="btn-primary" disabled={invoiceBusy} onClick={confirmInvoiceLead}>
              {invoiceBusy ? 'Adding...' : 'Confirm & Add Lead'}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => setInvoiceLead(null)}>
            {invoiceReadOnly ? 'Close' : 'Cancel'}
          </button>
        </div>
      </Modal>

      {/* AUDIT CORRECTION MODAL */}
      <Modal open={!!correction}>
        <h2>Audit Correction</h2>
        <div className="audit-reason">
          <strong>Auditor's Reason:</strong>
          <div style={{ marginTop: 6 }}>{correction?.reason}</div>
        </div>

        <div className="field">
          <label>What did you correct?</label>
          <textarea
            rows="6"
            placeholder="Explain what was corrected based on the auditor's remarks..."
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
          <button type="button" className="btn-primary" disabled={correctionBusy} onClick={saveCorrection}>
            {correctionBusy ? 'Saving...' : 'Save Correction & Resubmit'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setCorrection(null)}>
            Cancel
          </button>
        </div>

        {correctionError && <div style={{ marginTop: 10 }} className="error-msg">{correctionError}</div>}
      </Modal>
    </>
  );
}
