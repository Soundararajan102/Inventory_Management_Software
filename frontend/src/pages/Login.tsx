import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Lock, User, KeyRound, X } from 'lucide-react';
import { getDb } from '../lib/db';
import * as OTPAuth from 'otpauth';

const HARDCODED_SECRET = 'JBSWY3DPEHPK3PXP';

export default function Login() {
  const { login } = useAuth();
  const [usernames, setUsernames] = useState<string[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Forgot PIN state
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const db = await getDb();
      const users = await db.select<{username: string}[]>('SELECT username FROM users');
      setUsernames(users.map(u => u.username));
      if (users.length > 0) {
        setSelectedUsername(users[0].username);
      }
    } catch (e) {
      console.error(e);
      // Fallback in case DB is uninitialized or missing table
      setUsernames(['Admin']);
      setSelectedUsername('Admin');
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const success = await login(selectedUsername, pin);
    if (!success) {
      setError('Invalid PIN. Please try again.');
      setPin('');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Electrical POS</h1>
          <p className="text-blue-100 mt-1">Sign in to your account</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-8">
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center font-medium animate-in fade-in">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select User</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={selectedUsername}
                onChange={(e) => setSelectedUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 appearance-none"
              >
                {usernames.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Enter PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center text-2xl tracking-[0.5em] text-slate-700"
              placeholder="••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || pin.length === 0}
            className={`w-full py-3.5 rounded-xl font-bold text-lg transition-all
              ${isLoading || pin.length === 0 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'}`}
          >
            {isLoading ? 'Verifying...' : 'Unlock System'}
          </button>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setShowForgotPin(true);
                setResetError('');
                setResetSuccess('');
                setResetToken('');
              }}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Forgot Admin PIN?
            </button>
          </div>
        </form>
      </div>

      {showForgotPin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3 text-slate-800">
                <KeyRound className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-lg">Reset Admin PIN</h3>
              </div>
              <button 
                onClick={() => setShowForgotPin(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {resetSuccess ? (
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-slate-800 font-medium">{resetSuccess}</p>
                  <button
                    onClick={() => {
                      setShowForgotPin(false);
                      setSelectedUsername('Admin');
                      setPin('');
                    }}
                    className="mt-6 w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-4 text-center">
                    Please contact your vendor to provide the 6-digit reset key to reset the Admin PIN back to <strong>1234</strong>.
                  </p>
                  
                  {resetError && (
                    <div className="mb-4 p-2.5 bg-red-50 text-red-600 text-xs text-center font-medium rounded-lg">
                      {resetError}
                    </div>
                  )}

                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full text-center text-3xl font-mono tracking-widest p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 mb-6"
                  />
                  
                  <button
                    onClick={async () => {
                      if (resetToken.length !== 6) {
                        setResetError('Please enter a 6-digit code');
                        return;
                      }

                      let totp = new OTPAuth.TOTP({
                        issuer: "Electrical Shop",
                        label: "Admin",
                        algorithm: "SHA1",
                        digits: 6,
                        period: 30,
                        secret: OTPAuth.Secret.fromBase32(HARDCODED_SECRET),
                      });

                      let delta = totp.validate({ token: resetToken, window: 1 });
                      
                      if (delta !== null) {
                        try {
                          const db = await getDb();
                          // Force reset Admin PIN to '1234'
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
                    className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Verify & Reset PIN
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
