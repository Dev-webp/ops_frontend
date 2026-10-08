import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, fileUrl } from './services/api';
import { Modal, Pagination, hasProfile, inr } from './Shared';

// ===========================================================================
// Case Filing / Case Processing page
// Everything for this feature lives in this one file:
//   1. constants + small helpers
//   2. <Cases>              the page (table, filters, KPIs, pagination)
//   3. <AssignModal>        assign a case officer
//   4. <DocumentsModal>     view / upload / verify case documents
//   5. <RejectedDocsModal>  list of rejected documents
//   6. <CaseDetailsModal>   10-tab case details (university, offer, visa ...)
// ===========================================================================

// ---------- 1. constants + helpers ----------
const DOC_LABELS = {
  PASSPORT: 'Passport',
  TRANSCRIPTS: 'Transcripts',
  IELTS_PTE: 'IELTS / PTE',
  BANK_LETTER: 'Bank Letter',
  CAS_I20: 'CAS / I-20',
  PHOTO: 'Photo',
  OFFER_LETTER: 'Offer Letter',
};
const REQUIRED_DOC_COUNT = Object.keys(DOC_LABELS).length;

const STAGE_LABELS = {
  CHECKLIST_SENT: 'Checklist Sent',
  DOCUMENT_COLLECTION: 'Document Collection',
  SOP_LOR_REVIEW: 'SOP / LOR Review',
  UNIVERSITY_APPLICATION_SUBMITTED: 'University Application Submitted',
  OFFER_RECEIVED: 'Offer Received',
  FINANCIAL_DOCUMENTATION: 'Financial Documentation',
  EMBASSY_SLOT_BOOKED: 'Embassy Slot Booked',
  BIOMETRICS_DONE: 'Biometrics Done',
  VISA_OUTCOME: 'Visa Outcome',
  PRE_DEPARTURE: 'Pre-Departure',
  TRAVEL_ARRIVAL: 'Travel / Arrival',
  STUDENT_ONBOARDING: 'Student Onboarding',
  CASE_CLOSED: 'Case Closed',
};

const inrOrDash = (v) => (v != null ? inr(v) : '—');

const toDateInput = (v) => (v ? String(v).slice(0, 10) : '');

const initialsOf = (name, count = 2) =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, count)
    .map((p) => p[0].toUpperCase())
    .join('');

// ---------- 2. the page ----------
const PAGE_SIZE = 20;

export default function Cases({ user, showToast }) {
  const [searchParams] = useSearchParams();

  const isProcessingView = searchParams.get('view') === 'processing';
  const canAssign = hasProfile(user, 'OPS_MANAGER', 'MD');
  const showUnassigned = canAssign && !isProcessingView;
  // Case officers (who can't assign) always get the "Case Processing" wording
  const processingTitle = isProcessingView || !canAssign;
  const canVerifyDocs = canAssign && !isProcessingView;

  const [stages, setStages] = useState([]);
  const [board, setBoard] = useState({});
  const [unassigned, setUnassigned] = useState([]);
  const [officers, setOfficers] = useState([]);

  const [stageFilter, setStageFilter] = useState('ALL');
  const [officerFilter, setOfficerFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [caseDate, setCaseDate] = useState('');
  const [page, setPage] = useState(1);

  // modals
  const [assignLead, setAssignLead] = useState(null);
  const [invoiceLead, setInvoiceLead] = useState(null);
  const [outcome, setOutcome] = useState(null); // { caseId, status, note }
  const [docsCase, setDocsCase] = useState(null);
  const [detailsCase, setDetailsCase] = useState(null);
  const [rejectedDocs, setRejectedDocs] = useState(null);

  // ---- data loading ----
  const loadBoard = useCallback(async () => {
    try {
      const { stages, board } = await api.get('/cases/board');
      setStages(stages);
      setBoard(board);
    } catch (err) {
      showToast(err.message, true);
    }
  }, [showToast]);

  const loadUnassigned = useCallback(async () => {
    try {
      const { leads } = await api.get('/cases/unassigned');
      setUnassigned(leads);
    } catch (err) {
      showToast(err.message, true);
    }
  }, [showToast]);

  useEffect(() => {
    loadBoard();
    if (canAssign) {
      api
        .get('/cases/officers')
        .then(({ officers }) => setOfficers(officers))
        .catch((err) => console.error('Could not load case officers:', err));
    }
  }, [loadBoard, canAssign]);

  useEffect(() => {
    if (showUnassigned) loadUnassigned();
  }, [showUnassigned, loadUnassigned]);

  // ---- derived ----
  const allCases = useMemo(
    () => stages.flatMap((stage) => (board[stage] || []).map((c) => ({ ...c, current_stage: stage }))),
    [stages, board]
  );

  const kpis = useMemo(
    () => ({
      active: allCases.filter((c) => c.current_stage !== 'CASE_CLOSED').length,
      docsPending: allCases.filter((c) => Number(c.documents_verified || 0) < REQUIRED_DOC_COUNT).length,
      processing: allCases.filter((c) => c.current_stage !== 'CASE_CLOSED' && c.current_stage !== 'VISA_OUTCOME')
        .length,
      visaApproved: (board.VISA_OUTCOME || []).filter(
        (c) => String(c.visa_status || '').toUpperCase() === 'APPROVED'
      ).length,
      closed: (board.CASE_CLOSED || []).length,
    }),
    [allCases, board]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allCases.filter((c) => {
      const stageMatch = stageFilter === 'ALL' || c.current_stage === stageFilter;
      const officerMatch = officerFilter === 'ALL' || String(c.officer_id || '') === String(officerFilter);
      const searchMatch =
        !term ||
        String(c.student_name || '').toLowerCase().includes(term) ||
        String(c.passport_number || '').toLowerCase().includes(term) ||
        String(c.invoice_number || '').toLowerCase().includes(term);
      const updated = c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-CA') : '';
      const dateMatch = !caseDate || updated === caseDate;
      return stageMatch && officerMatch && searchMatch && dateMatch;
    });
  }, [allCases, stageFilter, officerFilter, search, caseDate]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageCases = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const onFilter = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  // ---- actions ----
  const handleStageChange = async (c, newStage) => {
    if (!newStage || newStage === c.current_stage) return;
    if (newStage === 'VISA_OUTCOME') {
      setOutcome({ caseId: c.id, status: 'APPROVED', note: '' });
      return;
    }
    try {
      await api.patch(`/cases/${c.id}/stage`, { stage: newStage });
      await loadBoard();
    } catch (err) {
      alert(err.message || 'Failed to update stage');
    }
  };

  const saveOutcome = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/cases/${outcome.caseId}/stage`, {
        stage: 'VISA_OUTCOME',
        visa_status: outcome.status,
        note: outcome.note,
      });
      showToast('Visa outcome recorded.');
      setOutcome(null);
      loadBoard();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const invoiceRows = invoiceLead
    ? [
        ['Student Name', invoiceLead.student_name],
        ['Phone', invoiceLead.phone],
        ['Email', invoiceLead.email],
        ['Service Type', invoiceLead.target_country],
        ['Invoice No', invoiceLead.invoice_number],
        ['Total Amount', inr(invoiceLead.total_amount)],
        ['Paid Amount', inr(invoiceLead.paid_amount)],
        ['Outstanding', inr(invoiceLead.outstanding_amount)],
        ['Payment Status', invoiceLead.payment_status],
        ['Sent to OPS By', invoiceLead.sent_to_ops_by_name],
        [
          'Agreement PDF',
          invoiceLead.agreement_pdf_url ? (
            <a href={fileUrl(invoiceLead.agreement_pdf_url)} target="_blank" rel="noreferrer">
              View Agreement
            </a>
          ) : null,
        ],
      ]
    : [];

  return (
    <>
      <div className="topbar">
        <h1>
          {processingTitle ? 'Case ' : 'Case Filing '}
          <span style={{ color: '#f28c18', fontWeight: 800 }}>{processingTitle ? 'Processing' : 'Ops'}</span>
        </h1>

        <div className="case-date-filters">
          <input type="date" title="Updated date" value={caseDate} onChange={onFilter(setCaseDate)} />
        </div>
      </div>

      {/* UNASSIGNED */}
      {showUnassigned && (
        <div className="section-card">
          <h3>Audit-Approved — Waiting for Case Officer Assignment</h3>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Country</th>
                <th>Visa Type</th>
                <th>Invoice No</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Payment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-state">
                    Nothing waiting — all audit-approved leads are assigned.
                  </td>
                </tr>
              ) : (
                unassigned.map((l) => (
                  <tr key={l.id}>
                    <td>{l.student_name}</td>
                    <td>{l.target_country}</td>
                    <td>{l.visa_category}</td>
                    <td>{l.invoice_number || '—'}</td>
                    <td>{inr(l.total_amount)}</td>
                    <td>{inr(l.paid_amount)}</td>
                    <td>{inr(l.outstanding_amount)}</td>
                    <td>
                      <span className={`badge ${l.payment_status === 'Paid' ? 'approved' : 'pending'}`}>
                        {l.payment_status || 'Pending'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-sm" onClick={() => setAssignLead(l)}>
                        Assign Case Officer
                      </button>
                      <button className="btn-sm outline" style={{ marginLeft: 4 }} onClick={() => setInvoiceLead(l)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* KPI CARDS */}
      <div className="case-processing-kpis">
        <Kpi cls="kpi-blue" icon="👥" value={kpis.active} title="Total Active Cases" sub="All currently active cases" />
        <Kpi cls="kpi-purple" icon="📄" value={kpis.docsPending} title="Documents Pending" sub="Cases waiting for documents" />
        <Kpi cls="kpi-teal" icon="⚙️" value={kpis.processing} title="In Processing" sub="Cases currently being processed" />
        <Kpi cls="kpi-orange" icon="🛂" value={kpis.visaApproved} title="Visa Approved" sub="Cases with visa approved" />
        <Kpi cls="kpi-green" icon="✓" value={kpis.closed} title="Case Closed" sub="Successfully completed cases" />
      </div>

      {/* ACTIVE CASES */}
      <div className="section-card">
        <div className="active-cases-header">
          <div>
            <h3>Active Cases</h3>
            <div className="active-cases-subtitle">Manage and track all client cases across different stages</div>
          </div>

          <div className="active-cases-filters">
            <select value={stageFilter} onChange={onFilter(setStageFilter)}>
              <option value="ALL">All stages</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s] || s}
                </option>
              ))}
            </select>

            <select value={officerFilter} onChange={onFilter(setOfficerFilter)}>
              <option value="ALL">All officers</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Search by client name, passport, invoice..."
              value={search}
              onChange={onFilter(setSearch)}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="cases-list-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Country</th>
                <th>Visa Type</th>
                <th>Case Officer</th>
                <th>Documents</th>
                <th>Rejected Files</th>
                <th>Stage</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageCases.length === 0 ? (
                <tr>
                  <td colSpan="10" className="empty-state">
                    {stages.length ? 'No active cases found.' : 'Loading…'}
                  </td>
                </tr>
              ) : (
                pageCases.map((c, i) => (
                  <tr key={c.id}>
                    <td>{startIndex + i + 1}</td>
                    <td>
                      <strong>{c.student_name}</strong>
                    </td>
                    <td>{c.target_country || '-'}</td>
                    <td>{c.visa_category || '-'}</td>
                    <td>{c.officer_name || '-'}</td>
                    <td>
                      <div className="document-progress">
                        <span className="document-progress-bar">
                          <span
                            style={{
                              width: `${Math.min((Number(c.documents_verified || 0) / REQUIRED_DOC_COUNT) * 100, 100)}%`,
                            }}
                          ></span>
                        </span>
                        <span>
                          {c.documents_verified || 0}/{REQUIRED_DOC_COUNT}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="rejected-files-count"
                        title="View rejected documents"
                        onClick={() => setRejectedDocs(c.rejected_documents || [])}
                      >
                        {Number(c.rejected_count || 0)}
                      </button>
                    </td>
                    <td>
                      <select
                        className="case-stage-select"
                        data-stage={c.current_stage}
                        value={c.current_stage}
                        onChange={(e) => handleStageChange(c, e.target.value)}
                      >
                        {stages.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABELS[s] || s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <button type="button" className="btn-sm outline" onClick={() => setDocsCase(c)}>
                        📁 Documents
                      </button>
                      <button
                        type="button"
                        className="btn-sm outline"
                        style={{ marginLeft: 4 }}
                        onClick={() => setDetailsCase(c)}
                      >
                        📄 Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination variant="cases" page={currentPage} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* MODALS */}
      <AssignModal
        showToast={showToast}
        lead={assignLead}
        officers={officers}
        onClose={() => setAssignLead(null)}
        onAssigned={() => {
          setAssignLead(null);
          loadUnassigned();
          loadBoard();
        }}
      />

      <Modal open={!!invoiceLead} style={{ maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3>Invoice Details</h3>
        <table>
          <tbody>
            {invoiceRows.map(([label, value]) => (
              <tr key={label}>
                <td>
                  <strong>{label}</strong>
                </td>
                <td>{value || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button type="button" className="btn-sm outline" onClick={() => setInvoiceLead(null)}>
            Close
          </button>
        </div>
      </Modal>

      <Modal open={!!outcome}>
        <h3>Visa Outcome</h3>
        {outcome && (
          <form onSubmit={saveOutcome}>
            <div className="field">
              <label>Result</label>
              <select value={outcome.status} onChange={(e) => setOutcome({ ...outcome, status: e.target.value })}>
                <option value="APPROVED">Visa Approved</option>
                <option value="REJECTED">Visa Rejected</option>
              </select>
            </div>
            <div className="field">
              <label>Note</label>
              <textarea rows="2" value={outcome.note} onChange={(e) => setOutcome({ ...outcome, note: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-sm outline" onClick={() => setOutcome(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-sm orange">
                Save Outcome
              </button>
            </div>
          </form>
        )}
      </Modal>

      <DocumentsModal
        showToast={showToast}
        caseInfo={docsCase}
        isManagement={canVerifyDocs}
        onClose={() => {
          setDocsCase(null);
          loadBoard(); // refresh verified-document counts
        }}
      />

      <CaseDetailsModal showToast={showToast} caseData={detailsCase} onClose={() => setDetailsCase(null)} />

      <RejectedDocsModal documents={rejectedDocs} onClose={() => setRejectedDocs(null)} />
    </>
  );
}

function Kpi({ cls, icon, value, title, sub }) {
  return (
    <div className={`case-kpi-card ${cls}`}>
      <div className="case-kpi-icon">{icon}</div>
      <div className="case-kpi-content">
        <div className="case-kpi-value">{value}</div>
        <div className="case-kpi-title">{title}</div>
        <div className="case-kpi-subtitle">{sub}</div>
      </div>
    </div>
  );
}

// ---------- 3. assign case officer ----------
function AssignModal({ lead, officers, onClose, onAssigned, showToast }) {
  const [officerId, setOfficerId] = useState('');
  const [university, setUniversity] = useState('');

  useEffect(() => {
    if (lead) {
      setOfficerId(officers[0]?.id ?? '');
      setUniversity('');
    }
  }, [lead, officers]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${lead.id}/assign`, {
        case_officer_id: officerId,
        target_university: university,
      });
      showToast('Case assigned to officer.');
      onAssigned();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  return (
    <Modal open={!!lead}>
      <h3>Assign Case Officer</h3>
      <form onSubmit={submit}>
        <div className="field">
          <label>Case Officer</label>
          <select required value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.specialty ? ` — ${o.specialty}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Target University (optional)</label>
          <input value={university} onChange={(e) => setUniversity(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-sm outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-sm orange">
            Assign
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- 4. documents ----------
const STATUS_BADGE = {
  UPLOADED: <span className="badge pending">Uploaded — awaiting review</span>,
  VERIFIED: <span className="badge approved">Verified</span>,
  REJECTED: <span className="badge rejected">Rejected</span>,
  NOT_REQUIRED: <span className="badge info">Not Required</span>,
};

function DocumentsModal({ caseInfo, isManagement, onClose, showToast }) {
  const caseId = caseInfo?.id;
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!caseId) return;
    try {
      const { documents } = await api.get(`/case-documents/${caseId}`);
      setDocuments(documents);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [caseId, showToast]);

  useEffect(() => {
    setLoading(true);
    setDocuments([]);
    load();
  }, [load]);

  const upload = async (docType, file, successMsg) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('doc_type', docType);
    fd.append('file', file);
    try {
      await api.upload(`/case-documents/${caseId}`, fd);
      showToast(successMsg);
      load();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const setStatus = async (doc, status) => {
    let rejection_reason;
    if (status === 'REJECTED') {
      rejection_reason = window.prompt('Reason for rejecting this document (student/officer will see this):');
      if (!rejection_reason || !rejection_reason.trim()) {
        showToast('Rejection needs a reason — cancelled.', true);
        load();
        return;
      }
    }
    try {
      await api.patch(`/case-documents/doc/${doc.id}/status`, { status, rejection_reason });
      showToast(`Marked as ${status.replace('_', ' ').toLowerCase()}.`);
    } catch (err) {
      showToast(err.message, true);
    }
    load();
  };

  const byType = {};
  documents.forEach((d) => {
    byType[d.doc_type] = d;
  });
  const additional = documents.filter((d) => d.doc_type.startsWith('ADDITIONAL_'));

  const renderStatus = (doc) => {
    const reason =
      doc.status === 'REJECTED' && doc.rejection_reason ? (
        <div className="empty-state" style={{ marginTop: 4 }}>
          Reason: {doc.rejection_reason}
        </div>
      ) : null;

    if (isManagement) {
      return (
        <>
          <select value={doc.status} onChange={(e) => setStatus(doc, e.target.value)}>
            <option value="UPLOADED">Uploaded</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
            <option value="NOT_REQUIRED">Not Required</option>
          </select>
          {reason}
        </>
      );
    }
    return (
      <>
        {STATUS_BADGE[doc.status] || doc.status}
        {reason}
      </>
    );
  };

  return (
    <Modal open={!!caseInfo} className="documents-modal-box">
      <div className="documents-modal-header">
        <div>
          <h3>Documents — {caseInfo?.student_name}</h3>
          <div className="documents-modal-subtitle">View, upload and verify case documents</div>
        </div>
        <button type="button" className="documents-close-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="documents-section">
        <div className="documents-section-header">
          <div>
            <h4>Required Documents</h4>
            <span>Case documents submitted by the client</span>
          </div>
        </div>

        <div className="documents-table-wrap">
          <table className="documents-table">
            <thead>
              <tr>
                <th>Document Type</th>
                <th>File</th>
                <th>Uploaded By</th>
                <th>Verification</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="empty-state">Loading…</td>
                </tr>
              ) : (
                Object.keys(DOC_LABELS).map((type) => {
                  const doc = byType[type];
                  return (
                    <tr key={type}>
                      <td>{DOC_LABELS[type]}</td>
                      <td>
                        {doc ? (
                          <a href={fileUrl(doc.file_url)} target="_blank" rel="noreferrer">
                            {doc.original_filename || 'View'}
                          </a>
                        ) : (
                          <span className="empty-state">Not uploaded (Pending)</span>
                        )}
                      </td>
                      <td>{doc ? doc.uploaded_by_name || '—' : '—'}</td>
                      <td>{doc ? renderStatus(doc) : <span className="empty-state">—</span>}</td>
                      <td>
                        <label className="btn-sm outline" style={{ cursor: 'pointer' }}>
                          {doc ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              upload(type, e.target.files[0], `${DOC_LABELS[type]} uploaded.`);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="documents-section additional-documents-section">
        <div className="documents-section-header">
          <div>
            <h4>Additional Documents</h4>
            <span>Supporting files added during case processing</span>
          </div>
        </div>

        <div className="documents-table-wrap">
          <table className="documents-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Uploaded By</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody>
              {additional.length === 0 ? (
                <tr>
                  <td colSpan="3" className="empty-state">None yet.</td>
                </tr>
              ) : (
                additional.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <a href={fileUrl(doc.file_url)} target="_blank" rel="noreferrer">
                        {doc.original_filename || 'View'}
                      </a>
                    </td>
                    <td>{doc.uploaded_by_name || '—'}</td>
                    <td>{renderStatus(doc)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <label className="documents-upload-btn">
          <span>＋ Add Additional Document</span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={(e) => {
              upload('ADDITIONAL', e.target.files[0], 'Additional document uploaded.');
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="documents-modal-footer">
        <button type="button" className="btn-sm outline" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ---------- 5. rejected documents ----------
function RejectedDocsModal({ documents, onClose }) {
  return (
    <Modal open={!!documents} style={{ maxWidth: 600 }}>
      <div className="documents-modal-header">
        <div>
          <h3>Rejected Documents</h3>
          <div className="documents-modal-subtitle">Documents rejected during case processing</div>
        </div>
        <button type="button" className="documents-close-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {!documents || documents.length === 0 ? (
        <div className="empty-state" style={{ padding: 30 }}>
          No rejected documents found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {documents.map((doc, i) => (
            <div
              key={i}
              style={{ padding: 16, border: '1px solid #fecaca', borderRadius: 10, background: '#fff7f7' }}
            >
              <div style={{ fontWeight: 800, color: '#dc2626', marginBottom: 6 }}>
                {i + 1}. {doc.doc_type || 'Document'}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                <strong>Rejection Reason:</strong> {doc.rejection_reason || 'No reason provided'}
              </div>
              {doc.rejected_at && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
                  Rejected on: {new Date(doc.rejected_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="documents-modal-footer">
        <button type="button" className="btn-sm outline" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ---------- 6. case details ----------
const TABS = [
  ['overview', 'Overview'],
  ['university', 'University'],
  ['offer', 'Offer'],
  ['financial', 'Financial'],
  ['embassy', 'Embassy'],
  ['visa', 'Visa'],
  ['biometrics', 'Biometrics'],
  ['predeparture', 'Pre-Departure'],
  ['travel', 'Travel'],
  ['onboarding', 'Onboarding'],
];

// ---- tiny form helpers -------------------------------------------------
function useSection(initial) {
  const [values, setValues] = useState(initial);
  const bind = (key) => ({
    value: values[key] ?? '',
    onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });
  return [values, setValues, bind];
}

const Field = ({ label, children }) => (
  <div className="field">
    <label>{label}</label>
    {children}
  </div>
);

const YesNo = ({ bind, yes = 'Yes', no = 'No' }) => (
  <select {...bind}>
    <option value="false">{no}</option>
    <option value="true">{yes}</option>
  </select>
);

const Section = ({ title, children }) => (
  <fieldset style={{ marginBottom: 16 }}>
    <legend>
      <strong>{title}</strong>
    </legend>
    {children}
  </fieldset>
);

const bool = (v) => v === 'true' || v === true;

// ---- initial values -----------------------------------------------------
const INIT = {
  ua: { university: '', course: '', intake: '', application_number: '', application_date: '', status: 'SUBMITTED' },
  of: { university: '', course: '', intake: '', offer_date: '', is_conditional: 'false', offer_status: 'RECEIVED', conditions: '' },
  va: { application_number: '', submission_date: '', status: 'PREPARING', notes: '' },
  ap: { appointment_date: '', appointment_time: '', location: '', booking_reference: '', is_rescheduled: 'false', biometrics_date: '', biometrics_completed: 'false' },
  fd: { financial_institution: '', funds_amount: '', currency: 'INR', document_type: '', document_date: '', verification_status: 'PENDING', notes: '' },
  es: { embassy_vfs_center: '', appointment_date: '', appointment_time: '', location: '', reference_number: '', appointment_status: 'PENDING', notes: '' },
  pd: { briefing_completed: 'false', documents_confirmed: 'false', accommodation_confirmed: 'false', travel_guidance_completed: 'false', departure_date: '', notes: '' },
  ta: { flight_number: '', departure_date: '', arrival_date: '', departure_city: '', arrival_city: '', travel_confirmed: 'false', arrival_confirmed: 'false', notes: '' },
  so: { student_arrived: 'false', university_joined: 'false', accommodation_confirmed: 'false', onboarding_completed: 'false', joining_date: '', notes: '' },
};

function CaseDetailsModal({ caseData, onClose, showToast }) {
  const caseId = caseData?.id;
  const [tab, setTab] = useState('overview');

  const [ua, setUa, uaBind] = useSection(INIT.ua);
  const [of, setOf, ofBind] = useSection(INIT.of);
  const [va, setVa, vaBind] = useSection(INIT.va);
  const [ap, setAp, apBind] = useSection(INIT.ap);
  const [fd, setFd, fdBind] = useSection(INIT.fd);
  const [es, setEs, esBind] = useSection(INIT.es);
  const [pd, setPd, pdBind] = useSection(INIT.pd);
  const [ta, setTa, taBind] = useSection(INIT.ta);
  const [so, setSo, soBind] = useSection(INIT.so);

  // Load everything whenever a different case is opened
  useEffect(() => {
    if (!caseId) return;
    setTab('overview');
    setUa(INIT.ua); setOf(INIT.of); setVa(INIT.va); setAp(INIT.ap);
    setFd(INIT.fd); setEs(INIT.es); setPd(INIT.pd); setTa(INIT.ta); setSo(INIT.so);

    let cancelled = false;

    // Financial documentation + embassy slot fail silently (as before)
    api.get(`/cases/${caseId}/financial-documentation`)
      .then(({ financialDocumentation: x }) => {
        if (cancelled || !x) return;
        setFd({
          financial_institution: x.financial_institution || '',
          funds_amount: x.funds_amount || '',
          currency: x.currency || 'INR',
          document_type: x.document_type || '',
          document_date: toDateInput(x.document_date),
          verification_status: x.verification_status || 'PENDING',
          notes: x.notes || '',
        });
      })
      .catch((err) => console.error('Failed to load Financial Documentation:', err));

    api.get(`/cases/${caseId}/embassy-slot`)
      .then(({ embassySlot: x }) => {
        if (cancelled || !x) return;
        setEs({
          embassy_vfs_center: x.embassy_vfs_center || '',
          appointment_date: toDateInput(x.appointment_date),
          appointment_time: x.appointment_time ? String(x.appointment_time).slice(0, 5) : '',
          location: x.location || '',
          reference_number: x.reference_number || '',
          appointment_status: x.appointment_status || 'PENDING',
          notes: x.notes || '',
        });
      })
      .catch((err) => console.error('Failed to load Embassy Slot:', err));

    Promise.all([
      api.get(`/case-details/${caseId}`),
      api.get(`/cases/${caseId}/pre-departure`),
      api.get(`/cases/${caseId}/travel-arrival`),
      api.get(`/cases/${caseId}/student-onboarding`),
    ])
      .then(([details, preDep, travel, onboarding]) => {
        if (cancelled) return;
        const { universityApplication: u, offer: o, visaApplication: v, appointment: a } = details;
        const { preDeparture: p } = preDep;
        const { travelArrival: t } = travel;
        const { studentOnboarding: s } = onboarding;

        setUa({
          university: u?.university || '',
          course: u?.course || '',
          intake: u?.intake || '',
          application_number: u?.application_number || '',
          application_date: toDateInput(u?.application_date),
          status: u?.status || 'SUBMITTED',
        });
        setOf({
          university: o?.university || '',
          course: o?.course || '',
          intake: o?.intake || '',
          offer_date: toDateInput(o?.offer_date),
          is_conditional: String(!!o?.is_conditional),
          offer_status: o?.offer_status || 'RECEIVED',
          conditions: o?.conditions || '',
        });
        setVa({
          application_number: v?.application_number || '',
          submission_date: toDateInput(v?.submission_date),
          status: v?.status || 'PREPARING',
          notes: v?.notes || '',
        });
        setAp({
          appointment_date: toDateInput(a?.appointment_date),
          appointment_time: a?.appointment_time || '',
          location: a?.location || '',
          booking_reference: a?.booking_reference || '',
          is_rescheduled: String(!!a?.is_rescheduled),
          biometrics_date: toDateInput(a?.biometrics_date),
          biometrics_completed: String(!!a?.biometrics_completed),
        });
        setPd({
          briefing_completed: String(!!p?.briefing_completed),
          documents_confirmed: String(!!p?.documents_confirmed),
          accommodation_confirmed: String(!!p?.accommodation_confirmed),
          travel_guidance_completed: String(!!p?.travel_guidance_completed),
          departure_date: toDateInput(p?.departure_date),
          notes: p?.notes || '',
        });
        setTa({
          flight_number: t?.flight_number || '',
          departure_date: toDateInput(t?.departure_date),
          arrival_date: toDateInput(t?.arrival_date),
          departure_city: t?.departure_city || '',
          arrival_city: t?.arrival_city || '',
          travel_confirmed: String(!!t?.travel_confirmed),
          arrival_confirmed: String(!!t?.arrival_confirmed),
          notes: t?.notes || '',
        });
        setSo({
          student_arrived: String(!!s?.student_arrived),
          university_joined: String(!!s?.university_joined),
          accommodation_confirmed: String(!!s?.accommodation_confirmed),
          onboarding_completed: String(!!s?.onboarding_completed),
          joining_date: toDateInput(s?.joining_date),
          notes: s?.notes || '',
        });
      })
      .catch((err) => showToast(err.message, true));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // ---- save helper ------------------------------------------------------
  const save = async (path, body, message) => {
    try {
      await api.put(path, body);
      showToast(message);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const saveUa = () =>
    save(`/case-details/${caseId}/university-application`, { ...ua, application_date: ua.application_date || null }, 'University Application saved.');

  const saveOffer = () =>
    save(`/case-details/${caseId}/offer`, { ...of, offer_date: of.offer_date || null, is_conditional: bool(of.is_conditional) }, 'Offer saved.');

  const saveVisa = () =>
    save(`/case-details/${caseId}/visa-application`, { ...va, submission_date: va.submission_date || null }, 'Visa Application saved.');

  const saveAppointment = () =>
    save(
      `/case-details/${caseId}/appointment`,
      {
        ...ap,
        appointment_date: ap.appointment_date || null,
        is_rescheduled: bool(ap.is_rescheduled),
        biometrics_date: ap.biometrics_date || null,
        biometrics_completed: bool(ap.biometrics_completed),
      },
      'Appointment saved.'
    );

  const saveFinancial = () =>
    save(
      `/cases/${caseId}/financial-documentation`,
      { ...fd, funds_amount: fd.funds_amount || null, document_date: fd.document_date || null },
      'Financial Documentation saved.'
    );

  const saveEmbassy = () =>
    save(
      `/cases/${caseId}/embassy-slot`,
      { ...es, appointment_date: es.appointment_date || null, appointment_time: es.appointment_time || null },
      'Embassy Slot saved.'
    );

  const savePreDeparture = () =>
    save(
      `/cases/${caseId}/pre-departure`,
      {
        briefing_completed: bool(pd.briefing_completed),
        documents_confirmed: bool(pd.documents_confirmed),
        accommodation_confirmed: bool(pd.accommodation_confirmed),
        travel_guidance_completed: bool(pd.travel_guidance_completed),
        departure_date: pd.departure_date || null,
        notes: pd.notes,
      },
      'Pre-Departure saved successfully.'
    );

  const saveTravel = () =>
    save(
      `/cases/${caseId}/travel-arrival`,
      {
        ...ta,
        departure_date: ta.departure_date || null,
        arrival_date: ta.arrival_date || null,
        travel_confirmed: bool(ta.travel_confirmed),
        arrival_confirmed: bool(ta.arrival_confirmed),
      },
      'Travel / Arrival saved successfully.'
    );

  const saveOnboarding = () =>
    save(
      `/cases/${caseId}/student-onboarding`,
      {
        student_arrived: bool(so.student_arrived),
        university_joined: bool(so.university_joined),
        accommodation_confirmed: bool(so.accommodation_confirmed),
        onboarding_completed: bool(so.onboarding_completed),
        joining_date: so.joining_date || null,
        notes: so.notes,
      },
      'Student Onboarding saved successfully.'
    );

  const c = caseData || {};
  const name = c.student_name || '-';
  const agreement = c.agreement_pdf_url ? fileUrl(c.agreement_pdf_url) : null;

  return (
    <Modal open={!!caseData} className="case-details-modal-box">
      {/* HEADER */}
      <div className="case-details-header">
        <div>
          <div className="case-details-title-row">
            <h3>Case Details — {name}</h3>
            <span className="case-details-case-badge">{STAGE_LABELS[c.current_stage] || 'Case'}</span>
          </div>
          <div className="case-details-header-subtitle">Complete case information and processing details</div>
        </div>
        <button type="button" className="case-details-close-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* SUMMARY */}
      <div className="case-details-summary">
        <div className="case-summary-client">
          <div className="case-client-avatar">{initialsOf(name) || 'C'}</div>
          <div className="case-summary-client-info">
            <div className="case-summary-client-name">{name}</div>
            <div className="case-summary-contact-row">
              <span>☎ <span>{c.phone || '-'}</span></span>
              <span>✉ <span>{c.email || '-'}</span></span>
            </div>
            <div className="case-summary-meta-row">
              <span>◉ <span>{c.target_country || '-'}</span></span>
              <span className="case-summary-category">
                <span>{c.visa_category || '-'}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="case-summary-invoice">
          <div className="case-summary-invoice-top">
            <div>
              <div className="case-summary-label">Invoice No</div>
              <div className="case-summary-invoice-number">{c.invoice_number || '-'}</div>
            </div>
            <span className="case-summary-payment-badge">{c.payment_status || 'Pending'}</span>
          </div>

          <div className="case-summary-amounts">
            <div>
              <div className="case-summary-label">Total Amount</div>
              <strong>{inr(c.total_amount)}</strong>
            </div>
            <div>
              <div className="case-summary-label">Paid Amount</div>
              <strong className="case-summary-paid">{inr(c.paid_amount)}</strong>
            </div>
            <div>
              <div className="case-summary-label">Outstanding</div>
              <strong className="case-summary-outstanding">{inr(c.outstanding_amount)}</strong>
            </div>
          </div>

          <div className="case-summary-bottom">
            <div>
              <div className="case-summary-label">Sent to OPS By</div>
              <strong>{c.sent_to_ops_by_name || '-'}</strong>
            </div>
            <div className="case-summary-agreement">
              <div className="case-summary-label">Agreement</div>
              {agreement ? (
                <a href={agreement} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
                  View Agreement PDF ↗
                </a>
              ) : (
                <span>Not available</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="case-details-tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`case-details-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {tab === 'overview' && (
        <fieldset className="case-summary-section">
          <legend>
            <strong>Client &amp; Invoice Details</strong>
          </legend>
          <div className="case-summary-grid">
            {[
              ['Client Name', c.student_name],
              ['Phone Number', c.phone],
              ['Email', c.email],
              ['Country', c.target_country],
              ['Visa Category', c.visa_category],
              ['Invoice Number', c.invoice_number],
              ['Total Amount', c.total_amount != null ? inrOrDash(c.total_amount) : ''],
              ['Paid Amount', c.paid_amount != null ? inrOrDash(c.paid_amount) : ''],
              ['Outstanding Amount', c.outstanding_amount != null ? inrOrDash(c.outstanding_amount) : ''],
              ['Payment Status', c.payment_status || 'Pending'],
              ['Sent to OPS By', c.sent_to_ops_by_name],
            ].map(([label, value]) => (
              <div className="case-summary-item" key={label}>
                <span>{label}</span>
                <input readOnly value={value || ''} />
              </div>
            ))}

            <div className="case-summary-item">
              <span>Agreement</span>
              <div className="case-agreement-box">
                {agreement ? (
                  <a href={agreement} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
                    View Agreement PDF
                  </a>
                ) : (
                  <span>Not available</span>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      )}

      {tab === 'university' && (
        <Section title="University Application">
          <div className="form-inline-grid">
            <Field label="University"><input {...uaBind('university')} /></Field>
            <Field label="Course"><input {...uaBind('course')} /></Field>
            <Field label="Intake"><input placeholder="e.g. Sep 2026" {...uaBind('intake')} /></Field>
            <Field label="Application Number"><input {...uaBind('application_number')} /></Field>
            <Field label="Application Date"><input type="date" {...uaBind('application_date')} /></Field>
            <Field label="Status">
              <select {...uaBind('status')}>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="OFFER_RECEIVED">Offer Received</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </Field>
          </div>
          <button type="button" className="btn-sm" onClick={saveUa}>Save University Application</button>
        </Section>
      )}

      {tab === 'offer' && (
        <Section title="Offer Management">
          <div className="form-inline-grid">
            <Field label="University"><input {...ofBind('university')} /></Field>
            <Field label="Course"><input {...ofBind('course')} /></Field>
            <Field label="Intake"><input {...ofBind('intake')} /></Field>
            <Field label="Offer Date"><input type="date" {...ofBind('offer_date')} /></Field>
            <Field label="Conditional?">
              <YesNo bind={ofBind('is_conditional')} yes="Conditional" no="Unconditional" />
            </Field>
            <Field label="Offer Status">
              <select {...ofBind('offer_status')}>
                <option value="RECEIVED">Received</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="DECLINED">Declined</option>
              </select>
            </Field>
          </div>
          <Field label="Conditions (if conditional)"><textarea rows="2" {...ofBind('conditions')} /></Field>
          <button type="button" className="btn-sm" onClick={saveOffer}>Save Offer</button>
        </Section>
      )}

      {tab === 'financial' && (
        <Section title="Financial Documentation">
          <div className="form-inline-grid">
            <Field label="Financial Institution"><input {...fdBind('financial_institution')} /></Field>
            <Field label="Funds Amount"><input type="number" step="0.01" {...fdBind('funds_amount')} /></Field>
            <Field label="Currency"><input {...fdBind('currency')} /></Field>
            <Field label="Document Type"><input placeholder="e.g. Bank Statement" {...fdBind('document_type')} /></Field>
            <Field label="Document Date"><input type="date" {...fdBind('document_date')} /></Field>
            <Field label="Verification Status">
              <select {...fdBind('verification_status')}>
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Verified</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </Field>
          </div>
          <Field label="Notes"><textarea rows="3" {...fdBind('notes')} /></Field>
          <button type="button" className="btn-sm" onClick={saveFinancial}>Save Financial Documentation</button>
        </Section>
      )}

      {tab === 'embassy' && (
        <Section title="Embassy Slot">
          <div className="form-inline-grid">
            <Field label="Embassy / VFS Center"><input {...esBind('embassy_vfs_center')} /></Field>
            <Field label="Appointment Date"><input type="date" {...esBind('appointment_date')} /></Field>
            <Field label="Appointment Time"><input type="time" {...esBind('appointment_time')} /></Field>
            <Field label="Location"><input {...esBind('location')} /></Field>
            <Field label="Reference Number"><input {...esBind('reference_number')} /></Field>
            <Field label="Appointment Status">
              <select {...esBind('appointment_status')}>
                <option value="PENDING">Pending</option>
                <option value="BOOKED">Booked</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="RESCHEDULED">Rescheduled</option>
              </select>
            </Field>
          </div>
          <Field label="Notes"><textarea rows="3" {...esBind('notes')} /></Field>
          <button type="button" className="btn-sm" onClick={saveEmbassy}>Save Embassy Slot</button>
        </Section>
      )}

      {tab === 'visa' && (
        <Section title="Visa Application">
          <div className="form-inline-grid">
            <Field label="Application / Reference Number"><input {...vaBind('application_number')} /></Field>
            <Field label="Submission Date"><input type="date" {...vaBind('submission_date')} /></Field>
            <Field label="Status">
              <select {...vaBind('status')}>
                <option value="PREPARING">Preparing</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </Field>
          </div>
          <Field label="Notes / Supporting Documents"><textarea rows="2" {...vaBind('notes')} /></Field>
          <button type="button" className="btn-sm" onClick={saveVisa}>Save Visa Application</button>
        </Section>
      )}

      {tab === 'biometrics' && (
        <Section title="Appointment & Biometrics">
          <div className="form-inline-grid">
            <Field label="Appointment Date"><input type="date" {...apBind('appointment_date')} /></Field>
            <Field label="Appointment Time"><input placeholder="e.g. 10:30 AM" {...apBind('appointment_time')} /></Field>
            <Field label="Location"><input {...apBind('location')} /></Field>
            <Field label="Booking Reference"><input {...apBind('booking_reference')} /></Field>
            <Field label="Rescheduled?"><YesNo bind={apBind('is_rescheduled')} /></Field>
            <Field label="Biometrics Date"><input type="date" {...apBind('biometrics_date')} /></Field>
            <Field label="Biometrics Completed?"><YesNo bind={apBind('biometrics_completed')} /></Field>
          </div>
          <button type="button" className="btn-sm" onClick={saveAppointment}>Save Appointment</button>
        </Section>
      )}

      {tab === 'predeparture' && (
        <Section title="Pre-Departure">
          <div className="form-inline-grid">
            <Field label="Pre-Departure Briefing"><YesNo bind={pdBind('briefing_completed')} yes="Completed" no="Pending" /></Field>
            <Field label="Documents Confirmed"><YesNo bind={pdBind('documents_confirmed')} /></Field>
            <Field label="Accommodation Confirmed"><YesNo bind={pdBind('accommodation_confirmed')} /></Field>
            <Field label="Travel Guidance Completed"><YesNo bind={pdBind('travel_guidance_completed')} yes="Completed" no="Pending" /></Field>
            <Field label="Departure Date"><input type="date" {...pdBind('departure_date')} /></Field>
          </div>
          <Field label="Notes"><textarea rows="3" {...pdBind('notes')} /></Field>
          <button type="button" className="btn-sm" onClick={savePreDeparture}>Save Pre-Departure</button>
        </Section>
      )}

      {tab === 'travel' && (
        <Section title="Travel / Arrival">
          <div className="form-inline-grid">
            <Field label="Flight Number"><input {...taBind('flight_number')} /></Field>
            <Field label="Departure Date"><input type="date" {...taBind('departure_date')} /></Field>
            <Field label="Arrival Date"><input type="date" {...taBind('arrival_date')} /></Field>
            <Field label="Departure City"><input {...taBind('departure_city')} /></Field>
            <Field label="Arrival City"><input {...taBind('arrival_city')} /></Field>
            <Field label="Travel Confirmed"><YesNo bind={taBind('travel_confirmed')} /></Field>
            <Field label="Arrival Confirmed"><YesNo bind={taBind('arrival_confirmed')} /></Field>
          </div>
          <Field label="Notes"><textarea rows="3" {...taBind('notes')} /></Field>
          <button type="button" className="btn-sm" onClick={saveTravel}>Save Travel / Arrival</button>
        </Section>
      )}

      {tab === 'onboarding' && (
        <Section title="Student Onboarding">
          <div className="form-inline-grid">
            <Field label="Student Arrived"><YesNo bind={soBind('student_arrived')} /></Field>
            <Field label="University Joined"><YesNo bind={soBind('university_joined')} /></Field>
            <Field label="Accommodation Confirmed"><YesNo bind={soBind('accommodation_confirmed')} /></Field>
            <Field label="Onboarding Completed"><YesNo bind={soBind('onboarding_completed')} /></Field>
            <Field label="Joining Date"><input type="date" {...soBind('joining_date')} /></Field>
          </div>
          <Field label="Notes"><textarea rows="3" {...soBind('notes')} /></Field>
          <button type="button" className="btn-sm" onClick={saveOnboarding}>Save Student Onboarding</button>
        </Section>
      )}

      <div className="modal-actions">
        <button type="button" className="btn-sm outline" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
