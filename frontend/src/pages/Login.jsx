import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { Button } from '../components/Button.jsx';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleEmailChange = (val) => {
    setEmail(val);
    setError('');
    const trimmed = val.trim();
    if (trimmed && !EMAIL_REGEX.test(trimmed)) {
      setEmailError('Please enter a valid email address (e.g. name@domain.com)');
    } else {
      setEmailError('');
    }
  };

  const handlePasswordChange = (val) => {
    setPassword(val);
    setError('');
    if (val && val.length < 4) {
      setPasswordError('Password must be at least 4 characters long');
    } else {
      setPasswordError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Invalid email format. Please check the address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmedEmail, password);
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-[#071230] via-[#0B1B45] to-[#142B5C] p-4 overflow-hidden">
      {/* Decorative background glow circles */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#2449C6]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[#E8C985]/15 blur-3xl" />

      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-sm rounded-3xl border border-white/15 bg-white p-8 shadow-2xl">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-[#E8C985] shadow-lg ring-4 ring-[#E8C985]/20">
            <span className="font-display text-2xl font-black">AJ</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1B45]">AJ Agency</h1>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Distributor Billing &amp; Inventory
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">Email Address</label>
            <input
              type="text"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm font-semibold text-[#0B1B45] outline-none transition focus:bg-white focus:ring-2 ${
                emailError ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200' : 'border-[#D5E3F7] bg-[#F8FAFD] focus:border-[#2449C6] focus:ring-[#2449C6]/20'
              }`}
              placeholder="name@company.com"
              required
            />
            {emailError && <p className="mt-1 text-[11px] font-semibold text-rose-500">{emailError}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                className={`w-full rounded-xl border px-4 py-2.5 pr-11 text-sm font-semibold text-[#0B1B45] outline-none transition focus:bg-white focus:ring-2 ${
                  passwordError ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200' : 'border-[#D5E3F7] bg-[#F8FAFD] focus:border-[#2449C6] focus:ring-[#2449C6]/20'
                }`}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0B1B45] focus:outline-none transition"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordError && <p className="mt-1 text-[11px] font-semibold text-rose-500">{passwordError}</p>}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200/80 p-3 text-xs font-semibold text-rose-600">
            {error}
          </div>
        )}

        <div className="mt-6">
          <Button
            type="submit"
            disabled={submitting}
            className="w-full py-3 text-sm font-bold shadow-md hover:shadow-lg"
            size="lg"
          >
            {submitting ? 'Signing in…' : 'Sign in to Dashboard'}
          </Button>
        </div>

        <div className="mt-6 text-center text-xs font-medium text-slate-400">
          Protected POS &middot; Enterprise Grade
        </div>
      </form>
    </div>
  );
}

