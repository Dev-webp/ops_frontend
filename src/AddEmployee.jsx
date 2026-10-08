import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './services/api';

const ROLES = [
  ['employee', 'Employee', 'Standard employee access across assigned responsibilities.'],
  ['manager', 'Manager', 'Management-level access for operational supervision.'],
  ['mis-executive', 'MIS Executive', 'MIS, audit and operational reporting responsibilities.'],
  ['Full-Stack-Developer', 'Full-Stack Developer', 'Application development and technical responsibilities.'],
  ['Study/Visit Process Consultant', 'Study/Visit Process Consultant', 'Study and visit process counselling responsibilities.'],
  ['Immigration Process Consultant', 'Immigration Process Consultant', 'Immigration process counselling and client handling.'],
];

const WORK_PROFILES = [
  ['MD', 'MD'],
  ['OPS_MANAGER', 'OPS Manager'],
  ['COUNSELOR', 'Counselor'],
  ['AUDITOR', 'Auditor'],
  ['CASE_OFFICER', 'Case Officer'],
];

const STEPS = [
  ['Basic Information', 'Name & credentials'],
  ['Role & Work Profile', 'Team structure'],
  ['Review & Create', 'Confirm details'],
];

export default function AddEmployee() {
  const navigate = useNavigate();
  const redirectTimer = useRef(null);

  const [step, setStep] = useState(1);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    branch_id: '',
    role: 'employee',
    work_profiles: [],
    designation: '',
  });

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api
      .get('/employees/meta')
      .then((d) => setBranches(d.branches || []))
      .catch((err) => {
        console.error(err);
        setError('Could not load employee settings. Please refresh the page.');
      });
    return () => clearTimeout(redirectTimer.current);
  }, []);

  const toggleProfile = (value) =>
    setForm((f) => ({
      ...f,
      work_profiles: f.work_profiles.includes(value)
        ? f.work_profiles.filter((p) => p !== value)
        : [...f.work_profiles, value],
    }));

  // ---- validation (returns an error message, or '' when OK) ----
  const validateStep1 = () => {
    if (!form.name.trim()) return 'Please enter the employee name.';
    if (!form.email.trim()) return 'Please enter the employee email.';
    if (!form.email.includes('@')) return 'Please enter a valid email address.';
    if (!form.password || form.password.length < 6) return 'Password must contain at least 6 characters.';
    return '';
  };
  const validateStep2 = () => {
    if (!form.role) return 'Please select a VJC role.';
    if (!form.work_profiles.length) return 'Please select at least one OPS work profile.';
    return '';
  };

  const goToStep = (target) => {
    setError('');
    setSuccess('');
    if (target >= 2) {
      const msg = validateStep1();
      if (msg) return fail(msg);
    }
    if (target === 3) {
      const msg = validateStep2();
      if (msg) return fail(msg);
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fail = (msg) => {
    setError(msg);
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createEmployee = async () => {
    setError('');
    setSuccess('');
    const msg = validateStep1() || validateStep2();
    if (msg) return fail(msg);

    setCreating(true);
    try {
      await api.post('/employees', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        work_profile: form.work_profiles[0],
        work_profiles: form.work_profiles,
        designation: form.designation.trim() || 'Employee',
        branch_id: form.branch_id || null,
      });
      setSuccess('Employee created successfully');
      setCreated(true);
      redirectTimer.current = setTimeout(() => navigate('/employees'), 3000);
    } catch (err) {
      console.error(err);
      fail(err.message || 'Could not create employee.');
    } finally {
      setCreating(false);
    }
  };

  const branchLabel = () => {
    const b = branches.find((x) => String(x.id) === String(form.branch_id));
    return b ? b.branch_name || b.name || 'Branch' : '— No branch —';
  };

  return (
    <>
      <div className="ae-page">
        <div className="top-bar">
          <div className="heading">
            <h1>Add Employee</h1>
            <p>Create a new VJC OPS Portal login and configure their access.</p>
          </div>
          <Link to="/employees" className="back-link">
            ← Back to Employees
          </Link>
        </div>

        <div className="employee-card">
          {/* STEPPER */}
          <div className="stepper">
            <div className="steps">
              {STEPS.map(([title, sub], i) => {
                const n = i + 1;
                return (
                  <div key={title} className={`step ${n === step ? 'active' : ''} ${n < step ? 'completed' : ''}`}>
                    <div className="step-circle">{n}</div>
                    <div className="step-title">{title}</div>
                    <div className="step-subtitle">{sub}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="content">
            <div className="error" style={{ display: error ? 'block' : 'none' }}>{error}</div>
            <div className="success" style={{ display: success ? 'block' : 'none' }}>{success}</div>

            {/* STEP 1 */}
            <section className={`step-content ${step === 1 ? 'active' : ''}`}>
              <div className="section-heading">
                <h2>Basic Information</h2>
                <p>Enter the employee's login and personal information.</p>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name <span>*</span></label>
                  <input type="text" placeholder="e.g. Rahul Sharma" autoComplete="name" value={form.name} onChange={setField('name')} />
                </div>

                <div className="form-group">
                  <label>Email Address <span>*</span></label>
                  <input type="email" placeholder="rahul@vjcoverseas.com" autoComplete="email" value={form.email} onChange={setField('email')} />
                </div>

                <div className="form-group">
                  <label>Password <span>*</span></label>
                  <div className="password-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a temporary password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={setField('password')}
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword((s) => !s)}>
                      ◉
                    </button>
                  </div>
                  <div className="helper">Employee can use this password for the first login.</div>
                </div>

                <div className="form-group">
                  <label>Branch</label>
                  <select value={form.branch_id} onChange={setField('branch_id')}>
                    <option value="">— No branch —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branch_name || b.name || 'Branch'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="actions">
                <Link
                  to="/employees"
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                >
                  Cancel
                </Link>
                <button type="button" className="btn btn-primary" onClick={() => goToStep(2)}>
                  Next →
                </button>
              </div>
            </section>

            {/* STEP 2 */}
            <section className={`step-content ${step === 2 ? 'active' : ''}`}>
              <div className="section-heading">
                <h2>Role &amp; Work Profile</h2>
                <p>Choose the common VJC role and the employee's OPS responsibility.</p>
              </div>

              <div className="form-group">
                <label>VJC Role <span>*</span></label>
                <div className="role-grid">
                  {ROLES.map(([value, name, desc]) => (
                    <div
                      key={value}
                      className={`role-card ${form.role === value ? 'selected' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, role: value }))}
                    >
                      <input type="radio" name="role" value={value} checked={form.role === value} readOnly />
                      <div className="role-check">✓</div>
                      <div className="role-name">{name}</div>
                      <div className="role-description">{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ height: 25 }}></div>

              <div className="form-grid">
                <div className="form-group">
                  <label>OPS Work Profile <span>*</span></label>
                  <div className="work-profile-grid">
                    {WORK_PROFILES.map(([value, label]) => {
                      const checked = form.work_profiles.includes(value);
                      return (
                        <label key={value} className={`work-profile-card ${checked ? 'selected' : ''}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleProfile(value)} />
                          <div className="work-profile-check">✓</div>
                          <div className="work-profile-name">{label}</div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="helper">
                    Select one or more OPS Work Profiles. Each selected profile provides its corresponding OPS
                    responsibility and permissions.
                  </div>
                </div>

                <div className="form-group">
                  <label>Designation</label>
                  <input type="text" placeholder="e.g. Senior Counselor" value={form.designation} onChange={setField('designation')} />
                </div>
              </div>

              <div className="info-box">
                <strong>Important:</strong> VJC Role is the common company-level role. OPS Work Profile controls the
                employee's existing OPS responsibility. Keeping these separate prevents the current OPS workflow from
                breaking.
              </div>

              <div className="actions">
                <button type="button" className="btn btn-secondary" onClick={() => goToStep(1)}>
                  ← Back
                </button>
                <button type="button" className="btn btn-primary" onClick={() => goToStep(3)}>
                  Review →
                </button>
              </div>
            </section>

            {/* STEP 3 */}
            <section className={`step-content ${step === 3 ? 'active' : ''}`}>
              <div className="section-heading">
                <h2>Review Employee</h2>
                <p>Verify the details before creating the employee account.</p>
              </div>

              <div className="review-card">
                <div className="review-header">Account Information</div>
                <div className="review-row">
                  <div className="review-label">Full Name</div>
                  <div className="review-value">{form.name.trim() || '—'}</div>
                </div>
                <div className="review-row">
                  <div className="review-label">Email</div>
                  <div className="review-value">{form.email.trim() || '—'}</div>
                </div>
                <div className="review-row">
                  <div className="review-label">Branch</div>
                  <div className="review-value">{branchLabel()}</div>
                </div>
              </div>

              <div style={{ height: 18 }}></div>

              <div className="review-card">
                <div className="review-header">Role &amp; Responsibility</div>
                <div className="review-row">
                  <div className="review-label">VJC Role</div>
                  <div className="review-value">{form.role || '—'}</div>
                </div>
                <div className="review-row">
                  <div className="review-label">OPS Work Profile</div>
                  <div className="review-value">{form.work_profiles.length ? form.work_profiles.join(', ') : '—'}</div>
                </div>
                <div className="review-row">
                  <div className="review-label">Designation</div>
                  <div className="review-value">{form.designation.trim() || 'Employee'}</div>
                </div>
              </div>

              <div className="actions">
                <button type="button" className="btn btn-secondary" onClick={() => goToStep(2)}>
                  ← Back
                </button>
                <button type="button" className="btn btn-success" disabled={creating || created} onClick={createEmployee}>
                  {created ? '✓ Employee Created' : creating ? 'Creating...' : '✓ Create Employee'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
