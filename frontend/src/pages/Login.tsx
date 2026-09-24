import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Lock, User } from 'lucide-react';
import { getDb } from '../lib/db';

export default function Login() {
  const { login } = useAuth();
  const [usernames, setUsernames] = useState<string[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        </form>
      </div>
    </div>
  );
}
