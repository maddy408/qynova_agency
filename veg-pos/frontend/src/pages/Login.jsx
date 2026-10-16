import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.jsx';
import { useSettings } from '../hooks/useSettings.jsx';
import { setAppLanguage } from '../i18n';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { login, user } = useAuth();
  const { companyName } = useSettings();
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedUser = await login(username, password);
      if (loggedUser) {
        navigate('/', { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err?.response?.data?.error || err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-y-auto bg-gradient-to-br from-[#ebf5ff] via-[#f4f9fd] to-[#e6f0fa] select-none font-sans">
      {/* Liquid background glow effects */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-200/50 filter blur-[90px] pointer-events-none animate-pulse" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-300/40 filter blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-sky-100/60 filter blur-[120px] pointer-events-none" />

      {/* Outer Liquid Glass Frame */}
      <div className="relative w-full max-w-[420px] rounded-[30px] p-[2px] bg-gradient-to-b from-white/90 via-sky-100/60 to-blue-200/50 shadow-[0_20px_60px_-15px_rgba(20,80,180,0.18),0_0_25px_rgba(255,255,255,0.85)] backdrop-blur-2xl">
        {/* Inner Glass Card */}
        <div className="rounded-[28px] bg-white/75 backdrop-blur-xl p-8 sm:p-9 border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-1px_1px_rgba(0,0,0,0.03)]">
          
          {/* Top-Right Language Pill */}
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => setAppLanguage(i18n.language === 'ta' ? 'en' : 'ta')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/85 hover:bg-white text-blue-800 border border-blue-200/80 shadow-xs hover:shadow transition-all"
            >
              <span className="text-xs">🌐</span>
              <span>{i18n.language === 'ta' ? 'English' : 'தமிழ்'}</span>
            </button>
          </div>

          {/* Main Title */}
          <h1 className="text-xl sm:text-2xl font-black text-center text-[#0f294a] tracking-tight font-sans mb-6">
            {companyName || t('app_title') || 'காய்கறி கமிஷன் பில்லிங்'}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 tracking-wide">
                {t('login.username')}
              </label>
              <input
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/85 border border-blue-200/80 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-400/20 text-gray-800 text-sm font-semibold transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder-gray-400"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                autoFocus
              />
            </div>

            {/* Password Input with Eye Toggle */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 tracking-wide">
                {t('login.password')}
              </label>
              <div className="relative">
                <input
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-white/85 border border-blue-200/80 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-400/20 text-gray-800 text-sm font-semibold transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder-gray-400"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-blue-700 transition-colors focus:outline-none"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-xs font-bold bg-red-50/80 border border-red-200/60 rounded-lg p-2 text-center">
                {error}
              </div>
            )}

            {/* Login Button with liquid glossy sheen */}
            <button
              type="submit"
              className="w-full mt-2 bg-gradient-to-r from-[#0d2a58] via-[#153f7f] to-[#0d2a58] hover:from-[#11356e] hover:to-[#1b4d96] text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99] flex items-center justify-center text-sm tracking-wide disabled:opacity-60 cursor-pointer"
              disabled={loading}
            >
              {loading ? 'உள்நுழைகிறது...' : t('login.login_button')}
            </button>
          </form>

          {/* Demo Hint Footer */}
          <p className="text-[11px] text-gray-400 font-mono text-center mt-4 font-medium">
            admin / Admin@123
          </p>
        </div>
      </div>
    </div>
  );
}
