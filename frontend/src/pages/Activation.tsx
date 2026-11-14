import { useState } from 'react';
import * as OTPAuth from 'otpauth';
import { Lock, AlertTriangle, Calendar } from 'lucide-react';
import { activateApp } from '../lib/db';

export default function Activation({ onActivated }: { onActivated: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const clockTamperReason = (window as any).__clockTamperReason as string | undefined;
  const hasPreviousLicense = Boolean(localStorage.getItem('activation_expiry'));

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
      setError('Invalid Activation Key. Please try again or check your computer date & time.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {hasPreviousLicense ? 'License Renewal' : 'Software Activation'}
          </h1>
          <p className="text-slate-500 text-center mt-2 text-xs leading-relaxed">
            {hasPreviousLicense
              ? 'Your license expired on March 31st. Please enter the 6-digit renewal key from your vendor to unlock for the upcoming Financial Year.'
              : 'Please enter the 6-digit activation key provided by your vendor to activate your license (valid until March 31st).'}
          </p>
        </div>

        {clockTamperReason && (
          <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-xs uppercase tracking-wider text-amber-700">System Clock Warning</span>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-700">{clockTamperReason}</p>
              <p className="mt-1 font-semibold text-[11px] text-amber-800">Please correct your computer clock in Windows settings.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleActivate} className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {hasPreviousLicense ? 'Renewal Key' : 'Activation Key'}
              </label>
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Calendar className="w-3 h-3" /> Valid till March 31
              </span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full text-center text-4xl tracking-[0.5em] font-mono px-4 py-3.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all text-slate-800"
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-xs font-medium text-center bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 cursor-pointer text-sm"
          >
            {hasPreviousLicense ? 'Renew License' : 'Activate Software'}
          </button>
        </form>
      </div>
    </div>
  );
}
