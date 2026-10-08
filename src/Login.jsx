import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login({ user, loading, onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already logged in? Skip straight to the dashboard.
  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* LEFT BRAND PANEL */}
        <div className="login-side">
          <div className="ops-visual">
            <div className="visual-orbit orbit-1"></div>
            <div className="visual-orbit orbit-2"></div>

            <div className="visual-node node-doc">📄</div>
            <div className="visual-node node-check">✓</div>
            <div className="visual-node node-users">👥</div>
            <div className="visual-node node-chart">📊</div>

            <div className="visual-shield">
              <div className="shield-icon">🔒</div>
            </div>
          </div>

          <div className="login-side-content">
            <h2>
              Audit &amp; Case Filing
              <br />
              Operations
            </h2>

            <p className="side-tagline">
              Verify every promise, track every case — audit to visa outcome, on one platform.
            </p>

            <div className="login-feature">
              <div className="tick">✓</div>
              <div>
                <strong>Quality Audit Verification</strong>
                <span>Recorded call review, 1–10 scorecard, pass/fail gating.</span>
              </div>
            </div>

            <div className="login-feature">
              <div className="tick">📄</div>
              <div>
                <strong>Case Filing Kanban</strong>
                <span>Track every file across the 9-stage visa filing pipeline.</span>
              </div>
            </div>

            <div className="login-feature">
              <div className="tick">📊</div>
              <div>
                <strong>Live Approval Insights</strong>
                <span>See approved vs rejected counts at a glance.</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT LOGIN PANEL */}
        <div className="login-form-side">
          <img src="/images/vjc-logo.png" alt="VJC Overseas" className="brand-logo-image" />
          <div className="brand-sub">VJC OVERSEAS</div>
          <div className="brand-title">IMMIGRATION &amp; VISA CONSULTANTS</div>
          <div className="product-title">VJC OPS PORTAL</div>
          <div className="product-divider"></div>
          <div className="product-tagline">
            Verify every promise, track every case — audit to visa outcome, on one screen.
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <div className="input-wrap">
                <span className="input-icon">✉</span>
                <input
                  type="email"
                  placeholder="you@vjcoverseas.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Password</label>
              <div className="input-wrap">
                <span className="input-icon">🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span className="password-eye" onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? '👀' : '👁'}
                </span>
              </div>
            </div>

            <div className="login-row">
              <label className="remember-label">
                <input type="checkbox" />
                <span>Remember Me</span>
              </label>
              <a href="#" onClick={(e) => e.preventDefault()}>
                Forgot your password?
              </a>
            </div>

            <div className="error-msg">{error}</div>

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'SIGNING IN…' : 'LOGIN'}
            </button>

            <div className="form-footnote">VJC Overseas Immigration &amp; Visa Consultants</div>
          </form>
        </div>
      </div>
    </div>
  );
}
