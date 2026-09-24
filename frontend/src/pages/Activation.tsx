import { useState } from 'react';
import * as OTPAuth from 'otpauth';
import { Lock } from 'lucide-react';
import { activateApp } from '../lib/db';

export default function Activation({ onActivated }: { onActivated: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Vendor's secret key embedded in the offline software
    const totp = new OTPAuth.TOTP({
      issuer: 'InventoryApp',
      label: 'Admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')
    });

    const isValid = totp.validate({
      token: code.trim(),
      window: 1 // Allow 30 seconds before/after desync
    });

    if (isValid !== null) {
      await activateApp();
      onActivated();
    } else {
      setError('Invalid Activation Key. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Software Activation</h1>
          <p className="text-slate-500 text-center mt-2">
            Please enter the 6-digit activation key provided by your vendor to unlock your 1-year license.
          </p>
        </div>

        <form onSubmit={handleActivate} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 text-center uppercase tracking-wider">
              Activation Key
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full text-center text-4xl tracking-[0.5em] font-mono px-4 py-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all"
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm font-medium text-center bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
          >
            Activate Software
          </button>
        </form>
      </div>
    </div>
  );
}
