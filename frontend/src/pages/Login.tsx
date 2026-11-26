import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { 
  Building2, 
  ChevronDown, 
  KeyRound, 
  X, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { CompanyModal } from '../components/CompanyModal';
import { getActiveCompany } from '../lib/companies';
import { getDb } from '../lib/db';
import * as OTPAuth from 'otpauth';

const HARDCODED_SECRET = 'JBSWY3DPEHPK3PXP';

export default function Login() {
  const { login } = useAuth();
  const [usernames, setUsernames] = useState<string[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const activeCompany = getActiveCompany();
  const pinInputRef = useRef<HTMLInputElement>(null);
  
  // Forgot PIN state
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    pinInputRef.current?.focus();
  }, [selectedUsername]);

  async function loadUsers() {
    try {
      const db = await getDb();
      const users = await db.select<{username: string}[]>('SELECT username FROM users');
      const names = users.map(u => u.username);
      setUsernames(names);
      if (names.length > 0) {
        setSelectedUsername(names[0]);
      }
    } catch (e) {
      console.error(e);
      setUsernames(['Admin']);
      setSelectedUsername('Admin');
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    setError('');
    setIsLoading(true);

    const success = await login(selectedUsername, pin);
    if (!success) {
      setError('Incorrect security PIN. Please try again.');
      setPin('');
      pinInputRef.current?.focus();
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-100/80 flex items-center justify-center p-4 relative select-none">
      {/* Subtle modern ambient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.08),rgba(255,255,255,0))] pointer-events-none" />

      {/* Main Login Card - Professional Desktop Proportions */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/70 border border-slate-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Section */}
        <div className="pt-8 pb-5 px-8 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200/90 shadow-sm p-1.5 flex items-center justify-center mb-4 transition-transform hover:scale-105">
            <img src="/logo.png" alt="Electro Hub" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {activeCompany.name || 'Electro Hub'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Sign in to your account
          </p>

          {/* Business / Company Switcher Pill */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowCompanyModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition-colors cursor-pointer font-medium shadow-2xs group"
              title="Click to Switch Business"
            >
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="font-semibold text-slate-900 truncate max-w-[170px]">{activeCompany.name}</span>
              <span className="text-[11px] text-blue-600 font-bold group-hover:underline flex items-center">
                Switch <ChevronDown className="w-3 h-3 ml-0.5" />
              </span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 w-full" />

        {/* Form Section */}
        <form onSubmit={handleLogin} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2 font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* User Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select User
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </div>
              <select
                value={selectedUsername}
                onChange={(e) => {
                  setSelectedUsername(e.target.value);
                  setPin('');
                  setError('');
                }}
                className="w-full pl-10 pr-10 py-3 bg-slate-50/70 hover:bg-slate-100/60 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer appearance-none"
              >
                {usernames.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Security PIN Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Enter PIN
              </label>
              <span className="text-[11px] text-slate-400 font-medium">
                {pin.length}/4 digits
              </span>
            </div>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </div>
              <input
                ref={pinInputRef}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  setError('');
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                }}
                placeholder="Enter 4-digit PIN"
                className={`w-full pl-10 pr-11 py-3 bg-slate-50/70 hover:bg-slate-100/60 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all text-center placeholder:text-slate-400 placeholder:text-xs placeholder:tracking-normal placeholder:font-normal ${
                  pin ? 'font-mono text-xl font-bold tracking-[0.5em]' : 'text-sm font-medium'
                }`}
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                title={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || pin.length < 4}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                pin.length === 4 && !isLoading
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25 hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <span>Verifying...</span>
              ) : (
                <>
                  <span>Unlock System</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Forgot PIN Link */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => {
                setShowForgotPin(true);
                setResetError('');
                setResetSuccess('');
                setResetToken('');
              }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              Forgot Admin PIN?
            </button>
          </div>
        </form>
      </div>

      {/* Forgot Admin PIN Recovery Modal */}
      {showForgotPin && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <span>Reset Admin PIN</span>
              </div>
              <button 
                type="button"
                onClick={() => setShowForgotPin(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div>
              {resetSuccess ? (
                <div className="text-center py-3">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-200">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-slate-900 font-bold text-sm">{resetSuccess}</p>
                  <p className="text-xs text-slate-500 mt-1">Default PIN is restored: <strong>1234</strong></p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPin(false);
                      setSelectedUsername('Admin');
                      setPin('');
                    }}
                    className="mt-5 w-full py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-blue-700 transition-all cursor-pointer"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Contact your vendor to get the 6-digit emergency reset key. This will restore the Admin PIN back to default <strong>1234</strong>.
                  </p>
                  
                  {resetError && (
                    <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs text-center font-semibold rounded-xl">
                      {resetError}
                    </div>
                  )}

                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit key"
                    style={resetToken ? { letterSpacing: '0.35em', textIndent: '0.35em' } : { letterSpacing: 'normal', textIndent: '0' }}
                    className="w-full text-center text-3xl font-mono py-3 border-2 border-slate-300 rounded-xl focus:outline-none focus:border-blue-600 bg-slate-50 mb-4 text-slate-900 font-bold placeholder:text-slate-300 placeholder:text-xs placeholder:tracking-normal placeholder:font-normal"
                  />
                  
                  <button
                    type="button"
                    onClick={async () => {
                      if (resetToken.length !== 6) {
                        setResetError('Please enter a 6-digit code');
                        return;
                      }

                      let totp = new OTPAuth.TOTP({
                        issuer: "Inventory Software",
                        label: "License Key",
                        algorithm: "SHA1",
                        digits: 6,
                        period: 30,
                        secret: OTPAuth.Secret.fromBase32(HARDCODED_SECRET),
                      });

                      let delta = totp.validate({ token: resetToken, window: 1 });
                      
                      if (delta !== null) {
                        try {
                          const db = await getDb();
                          await db.execute("UPDATE users SET pin = '1234' WHERE role = 'admin' OR username = 'Admin'");
                          setResetSuccess('Admin PIN has been successfully reset to 1234!');
                        } catch(e) {
                          setResetError('Database error during reset');
                        }
                      } else {
                        setResetError('Invalid or expired code. Try again.');
                        setResetToken('');
                      }
                    }}
                    disabled={resetToken.length !== 6}
                    className="w-full py-3 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Verify & Reset PIN
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <CompanyModal isOpen={showCompanyModal} onClose={() => setShowCompanyModal(false)} isReadOnly={true} />
    </div>
  );
}
