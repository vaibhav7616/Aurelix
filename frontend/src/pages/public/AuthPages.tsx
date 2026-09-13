import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, apiError } from '../../lib/api';
import { useAuth } from '../../stores/authStore';
import { useUI } from '../../stores/uiStore';
import { Logo, FieldError } from '../../components/ui/primitives';
import { fmtPrice, fmtPct, clsUpDown } from '../../lib/format';
import { clsx } from 'clsx';

interface Asset { symbol: string; tick: { mid: number; changePct24h: number } | null }

/** faint live-candle backdrop drawn from real market data */
function MarketBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { data } = useQuery({
    queryKey: ['auth-bg'],
    queryFn: () => get<{ candles: Array<{ open: number; high: number; low: number; close: number }> }>('/api/v1/market/candles', { symbol: 'BTC/USD', timeframe: '15m', limit: 60 }),
    refetchInterval: 30000,
  });
  useEffect(() => {
    const cv = ref.current;
    const candles = data?.candles ?? [];
    if (!cv || !candles.length) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const W = (cv.width = cv.offsetWidth * devicePixelRatio);
      const H = (cv.height = cv.offsetHeight * devicePixelRatio);
      ctx.clearRect(0, 0, W, H);
      const min = Math.min(...candles.map((c) => c.low));
      const max = Math.max(...candles.map((c) => c.high));
      const Y = (p: number) => H * 0.08 + (1 - (p - min) / (max - min || 1)) * H * 0.84;
      const step = W / candles.length;
      candles.forEach((c, i) => {
        const x = step * (i + 0.5);
        const up = c.close >= c.open;
        ctx.strokeStyle = up ? 'rgba(60,177,121,0.22)' : 'rgba(212,105,78,0.22)';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, Y(c.high)); ctx.lineTo(x, Y(c.low)); ctx.stroke();
        const yO = Y(c.open); const yC = Y(c.close);
        ctx.fillRect(x - step * 0.22, Math.min(yO, yC), step * 0.44, Math.max(2, Math.abs(yO - yC)));
      });
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [data]);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full opacity-70" />;
}

function Tape() {
  const { data } = useQuery({
    queryKey: ['pub-assets'],
    queryFn: () => get<{ assets: Asset[] }>('/api/v1/assets'),
    refetchInterval: 4000,
  });
  const items = [...(data?.assets ?? []), ...(data?.assets ?? [])];
  return (
    <div className="h-9 border-b border-line bg-base-900/80 overflow-hidden shrink-0">
      <div className="tape-track flex items-center h-9 w-max">
        {items.map((a, i) => (
          <span key={i} className="flex items-center gap-2 px-4 text-[11px] ax-num whitespace-nowrap">
            <span className="font-bold">{a.symbol}</span>
            <span className="text-fog">{a.tick ? fmtPrice(a.tick.mid) : '—'}</span>
            <span className={clsx('font-semibold', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Shell({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col relative overflow-hidden">
      <Tape />
      <div className="absolute inset-0 top-9 auth-grid" />
      <div className="absolute inset-0 top-9"><MarketBackdrop /></div>
      <div className="absolute inset-0 top-9 bg-gradient-to-b from-base-950/40 via-transparent to-base-950/85 pointer-events-none" />
      <div className="relative flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-[400px] max-w-full">
          <div className="ax-panel shadow-pop">
            <div className="px-6 pt-6 pb-5 border-b border-line text-center">
              <div className="flex justify-center"><Logo size={34} /></div>
            </div>
            <div className="p-6">{children}</div>
          </div>
          <div className="mt-3 text-center">{footer}</div>
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-mute">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>
            Your account is protected with secure authentication.
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  const login = useAuth((s) => s.login);
  const push = useUI((s) => s.push);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await login(email.trim(), password, remember); nav('/trading'); }
    catch (e2) { setErr(apiError(e2)); }
    finally { setBusy(false); }
  };
  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await post('/api/v1/auth/forgot-password', { email: email.trim() }); setForgotSent(true); }
    catch (e2) { setErr(apiError(e2)); }
    finally { setBusy(false); }
  };

  return (
    <Shell footer={<span className="text-xs text-mute">Don't have an account? <Link to="/register" className="text-accent-300 font-semibold hover:underline">Create account</Link></span>}>
      {!forgot ? (
        <form onSubmit={submit} className="space-y-3.5">
          <div><h1 className="text-lg font-bold tracking-tight">Welcome back</h1><p className="text-xs text-mute mt-0.5">Log in to enter the trading terminal.</p></div>
          <div><label className="ax-label">Username or email</label><input className="ax-input" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin or you@example.com" required /></div>
          <div><label className="ax-label">Password</label><input className="ax-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-fog cursor-pointer"><input type="checkbox" className="ax-check" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label>
            <button type="button" onClick={() => { setForgot(true); setErr(null); }} className="text-xs text-accent-300 hover:underline">Forgot password?</button>
          </div>
          <FieldError message={err} />
          <button className="ax-btn-primary w-full !h-10" disabled={busy}>{busy ? 'Authenticating…' : 'Log in →'}</button>
        </form>
      ) : (
        <form onSubmit={sendReset} className="space-y-3.5">
          <div><h1 className="text-lg font-bold tracking-tight">Reset password</h1><p className="text-xs text-mute mt-0.5">We'll email you a reset link if the address exists.</p></div>
          {!forgotSent ? (
            <>
              <div><label className="ax-label">Email</label><input className="ax-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <FieldError message={err} />
              <button className="ax-btn-primary w-full !h-10" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </>
          ) : (
            <div className="rounded-md border border-up/30 bg-updim/50 px-3 py-3 text-xs leading-relaxed">If <span className="font-semibold">{email}</span> is registered, a reset link is on its way. Check your inbox.</div>
          )}
          <button type="button" onClick={() => { setForgot(false); setForgotSent(false); }} className="w-full text-center text-xs text-fog hover:text-ink1">← Back to log in</button>
        </form>
      )}
    </Shell>
  );
}

export function RegisterPage() {
  const nav = useNavigate();
  const register = useAuth((s) => s.register);
  const login = useAuth((s) => s.login);
  const push = useUI((s) => s.push);
  const [f, setF] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ack) { setErr('Please acknowledge the risk notice to continue.'); return; }
    setBusy(true); setErr(null);
    try {
      await register(f);
      await login(f.email.trim(), f.password, true);
      push('ok', 'Account created — welcome to Aurelix.');
      nav('/trading');
    } catch (e2) { setErr(apiError(e2)); }
    finally { setBusy(false); }
  };

  return (
    <Shell footer={<span className="text-xs text-mute">Already have an account? <Link to="/login" className="text-accent-300 font-semibold hover:underline">Log in</Link></span>}>
      <form onSubmit={submit} className="space-y-3.5">
        <div><h1 className="text-lg font-bold tracking-tight">Create account</h1><p className="text-xs text-mute mt-0.5">Instant $10,000 starting balance. No card required.</p></div>
        <div className="grid grid-cols-2 gap-2.5">
          <div><label className="ax-label">First name</label><input className="ax-input" value={f.firstName} onChange={set('firstName')} required /></div>
          <div><label className="ax-label">Last name</label><input className="ax-input" value={f.lastName} onChange={set('lastName')} required /></div>
        </div>
        <div><label className="ax-label">Email</label><input className="ax-input" type="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@example.com" required /></div>
        <div><label className="ax-label">Password <span className="normal-case font-normal text-mute">(8+ characters)</span></label><input className="ax-input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} placeholder="••••••••" required /></div>
        <label className="flex gap-2.5 text-[11px] text-fog leading-relaxed cursor-pointer bg-white/[0.04] border border-line rounded-md p-2.5">
          <input type="checkbox" className="ax-check mt-[1px] shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          I understand that trading involves substantial risk of loss.
        </label>
        <FieldError message={err} />
        <button className="ax-btn-primary w-full !h-10" disabled={busy}>{busy ? 'Creating account…' : 'Create free account'}</button>
      </form>
    </Shell>
  );
}
