import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { User, KeyRound, X } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center bg-surface-soft p-4 relative overflow-hidden">
      {/* Decorative background elements for premium feel */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full bg-canvas rounded-xl border border-hairline overflow-hidden shadow-2xl">
        <div className="p-10 text-center border-b border-hairline bg-surface-soft">
          <div className="w-16 h-16 mx-auto mb-5 shadow-sm rounded-2xl overflow-hidden border border-hairline bg-canvas">
            <img src="/logo.png" alt="Electro Hub Logo" className="w-full h-full object-cover p-1" />
          </div>
          <h1 className="text-3xl font-display font-medium text-ink tracking-tight">Electro Hub</h1>
          <p className="text-body mt-2 text-base">Sign in to your account</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-8">
          {error && (
            <div className="mb-6 p-3 bg-canvas border border-signature-coral text-signature-coral rounded-sm text-sm text-center font-medium animate-in fade-in">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Select User</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <select
                value={selectedUsername}
                onChange={(e) => setSelectedUsername(e.target.value)}
                className="w-full pl-9 pr-4 py-3 bg-canvas border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary transition-colors font-medium text-ink appearance-none text-sm"
              >
                {usernames.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Enter PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-4 py-3 bg-canvas border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary transition-colors font-medium text-center text-xl tracking-[0.5em] text-ink placeholder-muted"
              placeholder="••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || pin.length === 0}
            className="w-full py-3.5 rounded-lg font-medium transition-all bg-primary text-on-primary shadow-md hover:shadow-lg hover:bg-primary-active disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isLoading ? 'Verifying...' : 'Unlock System'}
          </button>
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setShowForgotPin(true);
                setResetError('');
                setResetSuccess('');
                setResetToken('');
              }}
              className="text-sm font-medium text-muted hover:text-ink transition-colors border-b border-transparent hover:border-ink"
            >
              Forgot Admin PIN?
            </button>
          </div>
        </form>
      </div>

      {showForgotPin && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-canvas rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-hairline animate-in zoom-in-95">
            <div className="p-6 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <div className="flex items-center gap-3 text-ink">
                <KeyRound className="w-5 h-5 text-muted" />
                <h3 className="font-medium text-lg">Reset Admin PIN</h3>
              </div>
              <button 
                onClick={() => setShowForgotPin(false)}
                className="text-muted hover:text-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {resetSuccess ? (
                <div className="text-center">
                  <div className="w-12 h-12 bg-surface-soft border border-hairline text-ink rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-ink font-medium">{resetSuccess}</p>
                  <button
                    onClick={() => {
                      setShowForgotPin(false);
                      setSelectedUsername('Admin');
                      setPin('');
                    }}
                    className="mt-6 w-full py-2.5 bg-primary text-on-primary font-medium rounded-lg shadow-sm hover:shadow-md hover:bg-primary-active transition-all"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-body mb-5 text-center">
                    Please contact your vendor to provide the 6-digit reset key to reset the Admin PIN back to <strong>1234</strong>.
                  </p>
                  
                  {resetError && (
                    <div className="mb-4 p-2.5 bg-canvas border border-signature-coral text-signature-coral text-xs text-center font-medium rounded-sm">
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
                    className="w-full text-center text-3xl font-mono tracking-widest p-4 border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary bg-canvas mb-6 text-ink placeholder-muted"
                  />
                  
                  <button
                    onClick={async () => {
                      if (resetToken.length !== 6) {
                        setResetError('Please enter a 6-digit code');
                        return;
                      }

                      let totp = new OTPAuth.TOTP({
                        issuer: "Electro Hub",
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
                    className="w-full py-3 bg-primary text-on-primary font-medium rounded-lg shadow-sm hover:shadow-md hover:bg-primary-active transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
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
