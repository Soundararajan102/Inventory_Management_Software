import { useState, useRef, useEffect } from 'react';
import * as OTPAuth from 'otpauth';
import { 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Lock 
} from 'lucide-react';
import { activateApp } from '../lib/db';

export default function Activation({ onActivated }: { onActivated: () => void }) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const clockTamperReason = (window as any).__clockTamperReason as string | undefined;

  const storedExpiry = localStorage.getItem('activation_expiry');
  const storedType = localStorage.getItem('license_type');
  const hasUsedTrial = localStorage.getItem('has_used_trial') === 'true';

  const isExpired = Boolean(storedExpiry) && new Date(storedExpiry!).getTime() <= Date.now();

  // Auto-focus first input box on load
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, val: string) => {
    setError('');
    const clean = val.replace(/\D/g, '');
    
    // Support multi-digit paste or entry
    if (clean.length > 1) {
      const newDigits = [...digits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = clean[i] || '';
      }
      setDigits(newDigits);
      const nextIdx = Math.min(clean.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    const char = clean.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    const targetIdx = Math.min(pasted.length, 5);
    inputRefs.current[targetIdx]?.focus();
  };

  const fullCode = digits.join('');

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullCode.length !== 6) {
      setError('Please enter the complete 6-digit key.');
      return;
    }

    setError('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      // 1. Full Commercial Key (March 31 Fiscal Renewal)
      const fullTotp = new OTPAuth.TOTP({
        issuer: 'Inventory Software',
        label: 'License Key',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')
      });

      // 2. 15-Day Trial Key (Dedicated Generator)
      const trialTotp = new OTPAuth.TOTP({
        issuer: 'Inventory Software',
        label: 'Trial Key',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32('INVENTORYTRIAL22')
      });

      const trialTotpFallback = new OTPAuth.TOTP({
        issuer: 'Inventory Software',
        label: 'Trial Key',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32('ELECTROHUBTRKEY')
      });

      const isFullValid = fullTotp.validate({
        token: fullCode,
        window: 1 // 30s clock drift tolerance
      });

      const isTrialValid = trialTotp.validate({
        token: fullCode,
        window: 1
      }) !== null || trialTotpFallback.validate({
        token: fullCode,
        window: 1
      }) !== null;

      if (isFullValid !== null) {
        setSuccessMsg('Activation Successful! Starting application...');
        await activateApp('full');
        setTimeout(() => onActivated(), 600);
        return;
      }

      if (isTrialValid) {
        if (hasUsedTrial && storedType === 'trial' && isExpired) {
          setError('This key is no longer valid for this workstation. Please contact your vendor for an activation key.');
          setIsSubmitting(false);
          return;
        }
        setSuccessMsg('Activation Successful! Starting application...');
        await activateApp('trial');
        setTimeout(() => onActivated(), 600);
        return;
      }

      setError('Invalid Activation Key. Please verify the 6-digit code or your computer time.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 flex items-center justify-center p-4 sm:p-6 relative select-none">
      {/* Subtle modern background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.08),rgba(255,255,255,0))] pointer-events-none" />

      {/* Clean, Simple, Professional Card */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/70 p-8 sm:p-10 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Heading */}
        <div className="flex flex-col items-center text-center mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {isExpired ? 'License Renewal' : 'Software Activation'}
          </h1>
          
          <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed">
            {isExpired
              ? 'Your license has expired. Please enter your 6-digit renewal key to continue using the software.'
              : 'Please enter the 6-digit activation key provided by your vendor to activate this software.'}
          </p>
        </div>

        {/* Clock Tamper Alert (if applicable) */}
        {clockTamperReason && (
          <div className="mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-xs uppercase tracking-wider text-amber-800">System Clock Warning</span>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900">{clockTamperReason}</p>
              <p className="mt-1 font-semibold text-[11px] text-amber-700">Please synchronize your computer clock in Windows settings.</p>
            </div>
          </div>
        )}

        {/* Activation Form */}
        <form onSubmit={handleActivate} className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Activation Key
              </label>
              <span className="text-[11px] text-slate-400 font-medium">
                {fullCode.length}/6 digits
              </span>
            </div>

            {/* 6 Segmented PIN Input Boxes */}
            <div className="flex items-center justify-between gap-2 sm:gap-2.5" onPaste={handlePaste}>
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className={`w-12 h-14 sm:h-16 text-center text-2xl sm:text-3xl font-extrabold font-mono rounded-xl border-2 transition-all outline-none ${
                    digit
                      ? 'border-blue-600 bg-blue-50/40 text-blue-900 shadow-xs'
                      : 'border-slate-200 bg-slate-50/60 text-slate-900 hover:border-slate-300 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-500/15'
                  }`}
                  required
                />
              ))}
            </div>
          </div>

          {/* Error Message Alert */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message Alert */}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || fullCode.length !== 6}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              fullCode.length === 6 && !isSubmitting
                ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0'
                : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <span>Activating...</span>
            ) : (
              <>
                <span>Activate Software</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Support Info */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Need an activation key? Contact your software vendor.</span>
        </div>

      </div>
    </div>
  );
}
