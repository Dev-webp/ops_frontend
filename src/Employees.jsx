import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './services/api';
import { Modal, underscoreToSpace } from './Shared';

const AVATAR_BG = ['#e8ddff', '#ffe1eb', '#dcecff', '#d9f6ea', '#ffe8d1'];
const AVATAR_FG = ['#7b4ed1', '#d94d82', '#3578d4', '#15966a', '#df7a1b'];

const WORK_PROFILE_OPTIONS = [
  ['MD', 'MD'],
  ['OPS_MANAGER', 'OPS Manager'],
  ['COUNSELOR', 'Counselor'],
  ['AUDITOR', 'Auditor'],
  ['CASE_OFFICER', 'Case Officer'],
];

function roleClass(role) {
  const v = (role || '').toLowerCase();
  if (v === 'employee') return 'role-employee';
  if (v === 'manager') return 'role-manager';
  if (v === 'mis-executive') return 'role-mis';
  if (v.includes('consultant') || v.includes('process')) return 'role-consultant';
  return 'role-default';
}

function workClass(wp) {
  const v = (wp || '').toLowerCase();
  if (v === 'counselor') return 'work-counselor';
  if (v === 'case_officer') return 'work-case';
  if (v === 'auditor') return 'work-auditor';
  if (v === 'ops_manager') return 'work-manager';
  return 'work-default';
}

export default function Employees({ showToast }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [meta, setMeta] = useState(null);

  // edit modal
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [editError, setEditError] = useState('');

  const loadEmployees = useCallback(async () => {
    try {
      const { employees } = await api.get('/employees');
      setEmployees(employees);
      setSearch('');
      setStatusFilter('all');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const active = employees.filter((e) => e.is_active).length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((e) => {
      const matchesSearch =
        !term ||
        ['name', 'email', 'role', 'work_profile', 'branch_name'].some((k) =>
          (e[k] || '').toLowerCase().includes(term)
        );
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && e.is_active) ||
        (statusFilter === 'inactive' && !e.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [employees, search, statusFilter]);

  const toggleActive = async (employee) => {
    const question = employee.is_active ? 'Set this employee as inactive?' : 'Set this employee as active?';
    if (!window.confirm(question)) return;
    try {
      await api.patch(`/employees/${employee.id}`, { is_active: !employee.is_active });
      showToast(employee.is_active ? 'Employee set to inactive' : 'Employee set to active');
      loadEmployees();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const openEdit = async (employee) => {
    try {
      const m = meta || (await api.get('/employees/meta'));
      setMeta(m);
      setForm({
        name: employee.name,
        role: employee.role,
        branch_name: employee.branch_name,
        branch_id: m.branches.find((b) => b.branch_name === employee.branch_name)?.id || '',
        specialty: employee.specialty || '',
        is_active: String(employee.is_active),
        work_profiles: employee.work_profiles || [employee.work_profile],
        password: '',
      });
      setEditError('');
      setEditing(employee);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const toggleProfile = (value) =>
    setForm((f) => ({
      ...f,
      work_profiles: f.work_profiles.includes(value)
        ? f.work_profiles.filter((p) => p !== value)
        : [...f.work_profiles, value],
    }));

  const saveEdit = async () => {
    setEditError('');
    const payload = {
      name: form.name.trim(),
      role: form.role,
      work_profiles: form.work_profiles,
      specialty: form.specialty.trim() || null,
      branch_id: form.branch_id || null,
      is_active: form.is_active === 'true',
    };
    if (form.password) payload.password = form.password;

    try {
      await api.patch(`/employees/${editing.id}`, payload);
      setEditing(null);
      showToast('Employee updated');
      loadEmployees();
    } catch (err) {
      setEditError(err.message);
    }
  };

  return (
    <>
      <div className="employees-page">
        <div className="employee-page-header">
          <div className="employee-page-title">
            <div className="employee-page-icon">👥</div>
            <div>
              <h1>Employees</h1>
              <p>Manage team members and their access to the OPS portal</p>
            </div>
          </div>

          <Link to="/employees/new" className="btn-primary" style={{ width: 'auto', padding: '12px 20px', whiteSpace: 'nowrap' }}>
            + Add Employee
          </Link>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Total Employees</div>
            <div className="value">{employees.length}</div>
          </div>
          <div className="stat-card green">
            <div className="label">Active</div>
            <div className="value">{active}</div>
          </div>
          <div className="stat-card red">
            <div className="label">Inactive</div>
            <div className="value">{employees.length - active}</div>
          </div>
        </div>

        <div className="section-card">
          <div className="employee-toolbar">
            <div className="employee-section-title">
              <h3>All Employees</h3>
              <p>View and manage all team members</p>
            </div>

            <div className="employee-tools">
              <input
                type="search"
                className="employee-search"
                name="employee-search-box"
                placeholder="Search by name, email, role or profile..."
                autoComplete="new-password"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="employee-table-wrap">
            <table className="employee-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Employee</th>
                  <th>Email</th>
                  <th>Password</th>
                  <th>VJC Role</th>
                  <th>OPS Work Profile</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" className="empty-state">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan="9" className="empty-state">No employees found.</td></tr>
                ) : (
                  filtered.map((e, i) => (
                    <tr key={e.id}>
                      <td className="serial-number">{i + 1}</td>
                      <td>
                        <div className="employee-info">
                          <div
                            className="employee-avatar"
                            style={{ background: AVATAR_BG[i % 5], color: AVATAR_FG[i % 5] }}
                          >
                            {(e.name || '?').trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="employee-name">{e.name}</div>
                        </div>
                      </td>
                      <td><span className="employee-email">{e.email}</span></td>
                      <td><span className="password-value">{e.display_password || '—'}</span></td>
                      <td><span className={`role-badge ${roleClass(e.role)}`}>{underscoreToSpace(e.role)}</span></td>
                      <td>
                        <span className={`work-badge ${workClass(e.work_profile)}`}>
                          {underscoreToSpace(e.work_profile)}
                        </span>
                      </td>
                      <td>{e.branch_name || '—'}</td>
                      <td>
                        <span className={`status-badge ${e.is_active ? 'active' : 'inactive'}`}>
                          <span className="status-dot"></span>
                          {e.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="action-wrap">
                          <button type="button" className="employee-edit-btn" onClick={() => openEdit(e)}>
                            ✎ Edit
                          </button>
                          <button
                            type="button"
                            className="employee-more-btn"
                            title={e.is_active ? 'Set inactive' : 'Set active'}
                            onClick={() => toggleActive(e)}
                          >
                            ⋮
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="employee-footer">
            <div>
              Showing {filtered.length} employee{filtered.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>

      {/* EDIT MODAL */}
      <Modal open={!!editing}>
        <h2>Edit Employee</h2>

        <div className="field">
          <label>Name</label>
          <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="form-inline-grid">
          <div className="field">
            <label>Role</label>
            <select value={form.role || ''} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {(meta?.roles || []).map((r) => (
                <option key={r} value={r}>{underscoreToSpace(r)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Branch</label>
            <select value={form.branch_id || ''} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">— No branch —</option>
              {(meta?.branches || []).map((b) => (
                <option key={b.id} value={b.id}>{b.branch_name} ({b.city})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Specialty (optional — e.g. UK Specialist)</label>
          <input value={form.specialty || ''} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
        </div>

        <div className="field">
          <label>Status</label>
          <select value={form.is_active || 'true'} onChange={(e) => setForm({ ...form, is_active: e.target.value })}>
            <option value="true">Active</option>
            <option value="false">Inactive (blocked from logging in)</option>
          </select>
        </div>

        <div className="field">
          <label style={{ fontWeight: 700 }}>OPS Work Profiles</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            {WORK_PROFILE_OPTIONS.map(([value, label]) => (
              <label
                key={value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 12,
                  border: '1px solid #dfe4ec',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: '#fff',
                }}
              >
                <input
                  type="checkbox"
                  checked={(form.work_profiles || []).includes(value)}
                  onChange={() => toggleProfile(value)}
                />
                <strong>{label}</strong>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 7, fontSize: 12, color: '#6b7280' }}>Select one or more OPS Work Profiles.</div>
        </div>

        <div className="field">
          <label>Reset Password (leave blank to keep current password)</label>
          <input
            type="password"
            placeholder="New password (min 6 characters)"
            value={form.password || ''}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={saveEdit}>
            Save Changes
          </button>
          <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>

        {editError && (
          <div style={{ marginTop: 10 }}>
            <div className="error-msg">{editError}</div>
          </div>
        )}
      </Modal>
    </>
  );
}
