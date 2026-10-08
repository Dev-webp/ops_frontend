// Everything that is used by MORE THAN ONE page lives here:
//   - small formatting / role helpers
//   - <Modal> and <Pagination>
// Anything used by only one page lives inside that page's own file.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export const underscoreToSpace = (v) => (v ? String(v).replaceAll('_', ' ') : '—');

// ---- Roles ----------------------------------------------------------------
export const workProfilesOf = (user) =>
  Array.isArray(user?.work_profiles) && user.work_profiles.length
    ? user.work_profiles
    : [user?.work_profile].filter(Boolean);

export const hasProfile = (user, ...profiles) =>
  workProfilesOf(user).some((p) => profiles.includes(p));

// Which sidebar sections each role may see.
export const ROLE_SECTIONS = {
  MD: ['dashboard', 'leads', 'audit', 'cases', 'case-processing', 'reports', 'employees'],
  OPS_MANAGER: ['dashboard', 'leads', 'audit', 'cases', 'case-processing', 'reports', 'employees'],
  COUNSELOR: ['dashboard', 'leads', 'reports'],
  AUDITOR: ['dashboard', 'audit', 'reports'],
  CASE_OFFICER: ['dashboard', 'cases', 'reports'],
};

export const allowedSectionsFor = (user) => [
  ...new Set(workProfilesOf(user).flatMap((p) => ROLE_SECTIONS[p] || [])),
];

// ---------------------------------------------------------------------------
// <Modal> — thin wrapper over the existing .modal-overlay / .modal-box CSS
// ---------------------------------------------------------------------------
export function Modal({ open, children, className = '', style, id }) {  if (!open) return null;
  return (
<div id={id} className="modal-overlay" style={{ display: 'flex' }}>      <div className={`modal-box ${className}`.trim()} style={style}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// <Pagination> — one component, three looks (leads / audit / cases pages)
// ---------------------------------------------------------------------------
const PAGINATION_VARIANTS = {
  leads: {
    wrapClass: '',
    wrapStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18 },
    btn: () => 'btn-sm outline',
    pageBtn: (active) => `btn-sm ${active ? 'orange' : 'outline'}`,
  },
  audit: {
    wrapClass: 'audit-pagination',
    wrapStyle: undefined,
    btn: () => 'audit-page-btn',
    pageBtn: (active) => `audit-page-btn ${active ? 'active' : ''}`,
  },
  cases: {
    wrapClass: 'cases-pagination',
    wrapStyle: undefined,
    btn: () => 'pagination-btn',
    pageBtn: (active) => `pagination-btn ${active ? 'active' : ''}`,
  },
};

export function Pagination({ page, total, pageSize, onChange, variant = 'cases' }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const v = PAGINATION_VARIANTS[variant];

  return (
    <div className={v.wrapClass} style={v.wrapStyle}>
      <button type="button" className={v.btn()} disabled={page === 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button key={p} type="button" className={v.pageBtn(p === page)} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
      <button
        type="button"
        className={v.btn()}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
