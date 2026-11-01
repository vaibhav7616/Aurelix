import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/ui/primitives';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuth } from '../../stores/authStore';
import { post, apiError, hasSession } from '../../lib/api';

/** The Aurelix logo as a spinning 3D block. */
function Logo3D({ size }: { size: number }) {
  return (
    <div className="aff3d-logo" style={{ width: size, height: size }} aria-hidden>
      {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--z' as string]: i }} />)}
      <img src="/logo.svg" alt="" className="aff3d-face" width={size} height={size} />
      <img src="/logo.svg" alt="" className="aff3d-back" width={size} height={size} />
    </div>
  );
}

/** Left-hand brand scene: perspective grid floor, 3D logo, floating programme cards. Follows the pointer slightly. */
function BrandScene() {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
  };
  const reset = () => { ref.current?.style.setProperty('--ry', '0deg'); ref.current?.style.setProperty('--rx', '0deg'); };
  return (
    <div className="aff3d-stage relative hidden lg:block overflow-hidden border-r border-line bg-base-900" onPointerMove={move} onPointerLeave={reset}>
      {/* flat background layers live outside the 3D scene so they never slice through the logo */}
      <div className="aff3d-glow left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute inset-0 aff3d-stage"><div className="aff3d-floor" /></div>
      <div ref={ref} className="aff3d-scene">
        <div className="absolute left-1/2 top-[36%]" style={{ transformStyle: 'preserve-3d', transform: 'translate3d(-50%, -50%, 30px)' }}>
          <Logo3D size={148} />
        </div>

        <div className="aff3d-card left-[9%] top-[17%] w-[190px]" style={{ ['--tz' as string]: '90px', ['--ty' as string]: '14deg', animationDelay: '-1s' }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">Revenue Share</div>
          <div className="text-[22px] font-semibold text-cream ax-num leading-tight">up to 80%</div>
          <div className="text-[11px] text-fog">7 levels, grows with your traffic</div>
        </div>
        <div className="aff3d-card right-[8%] top-[24%] w-[180px]" style={{ ['--tz' as string]: '130px', ['--ty' as string]: '-14deg', animationDelay: '-3s' }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">Turnover Share</div>
          <div className="text-[22px] font-semibold text-cream ax-num leading-tight">up to 5%</div>
          <div className="flex items-end gap-1 h-7 mt-1.5">
            {[0.5, 0.75, 0.6, 0.9, 1].map((h, i) => (
              <span key={i} className="aff3d-bar w-3 rounded-sm bg-accent-400" style={{ height: `${h * 100}%`, animationDelay: `${-i * 0.4}s` }} />
            ))}
          </div>
        </div>
        <div className="aff3d-card right-[16%] top-[54%] w-[200px]" style={{ ['--tz' as string]: '70px', ['--ty' as string]: '-8deg', animationDelay: '-4.5s' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-up shadow-[0_0_10px] shadow-up" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">Weekly payouts</span>
          </div>
          <div className="text-[15px] font-semibold text-cream mt-1">Every Thursday</div>
          <div className="text-[11px] text-fog">Automatic, to your saved details</div>
        </div>
        <div className="aff3d-card left-[12%] top-[56%] w-[170px]" style={{ ['--tz' as string]: '40px', ['--ty' as string]: '10deg', animationDelay: '-2.2s' }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">Real-time stats</div>
          <div className="text-[13px] text-cream mt-1">Clicks · Registrations · FTD</div>
        </div>
      </div>

      <div className="absolute left-0 right-0 bottom-0 p-10 bg-gradient-to-t from-base-950 via-base-950/80 to-transparent">
        <h2 className="text-[28px] font-semibold tracking-tight text-cream leading-tight max-w-[440px]">Grow with Aurelix.<br />Earn on every trader you bring.</h2>
        <p className="text-[13px] text-fog mt-2 max-w-[440px]">Personal links, postbacks for your tracker, promo materials and transparent commission — all in one partner dashboard.</p>
      </div>
    </div>
  );
}

/** Stand-alone frame for the Affiliate Center sign-in / sign-up pages (no trading-site chrome). */
function AuthFrame({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  useAppTheme();
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] bg-base-950 text-ink1 overflow-x-hidden">
      <BrandScene />
      <div className="flex flex-col min-h-screen min-w-0">
        <header className="h-[60px] shrink-0 flex items-center gap-3 px-5">
          <Link to="/affiliate/login" className="flex items-center gap-2.5" aria-label="Aurelix Affiliate Center">
            <Logo size={28} wordmark={false} />
            <span className="leading-tight">
              <span className="block text-[14px] font-semibold text-cream">Aurelix</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-300">Affiliate Center</span>
            </span>
          </Link>
          <Link to="/" className="ml-auto text-[12px] text-fog hover:text-ink1">Aurelix website →</Link>
        </header>
        <main className="flex-1 flex items-center justify-center p-4 py-8">
          <div className="w-[400px] max-w-full">
            <div className="lg:hidden flex justify-center mb-6 aff3d-stage"><Logo3D size={84} /></div>
            <div className="ax-panel p-6 shadow-[0_30px_80px_-30px_rgb(0_0_0_/_0.8)]">
              <div className="hidden lg:flex justify-center -mt-14 mb-4">
                <div className="rounded-2xl bg-base-950 p-2.5 border border-line"><img src="/logo.svg" alt="" width={52} height={52} /></div>
              </div>
              {children}
            </div>
            <div className="mt-4 text-center text-xs text-mute">{footer}</div>
          </div>
        </main>
        <footer className="py-4 text-center text-[11px] text-mute">
          <Link to="/contact" className="hover:text-fog">Contact</Link>
          <span className="mx-2">·</span>
          <Link to="/risk" className="hover:text-fog">Risk disclosure</Link>
        </footer>
      </div>
    </div>
  );
}

function Err({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-xs text-down">{message}</div>;
}

export function AffiliateLogin() {
  const nav = useNavigate();
  const login = useAuth((s) => s.login);
  const user = useAuth((s) => s.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);

  if (user || hasSession()) return <Navigate to="/affiliate" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await login(email.trim(), password, remember); nav('/affiliate', { replace: true }); }
    catch (e2) { setErr(apiError(e2)); setBusy(false); }
  };
  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await post('/api/v1/auth/forgot-password', { email: email.trim() }); setSent(true); }
    catch (e2) { setErr(apiError(e2)); }
    finally { setBusy(false); }
  };

  return (
    <AuthFrame footer={<>Don't have an account yet? <Link to="/affiliate/signup" className="text-accent-300 font-semibold hover:underline">Sign Up!</Link></>}>
      {!forgot ? (
        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-cream">Affiliate Center login</h1>
            <p className="text-xs text-mute mt-0.5">Sign in to your partner dashboard.</p>
          </div>
          <div>
            <label htmlFor="al-email" className="ax-label">Email</label>
            <input id="al-email" className="ax-input" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="al-pass" className="ax-label">Password</label>
            <input id="al-pass" className="ax-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-fog cursor-pointer">
              <input type="checkbox" className="ax-check" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
            </label>
            <button type="button" className="text-xs text-accent-300 hover:underline" onClick={() => { setForgot(true); setErr(null); }}>Forgot password?</button>
          </div>
          <Err message={err} />
          <button className="ax-btn-primary w-full !h-10" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-3.5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-cream">Reset password</h1>
            <p className="text-xs text-mute mt-0.5">We'll email you a reset link if the address is registered.</p>
          </div>
          {!sent ? (
            <>
              <div>
                <label htmlFor="al-reset" className="ax-label">Email</label>
                <input id="al-reset" className="ax-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Err message={err} />
              <button className="ax-btn-primary w-full !h-10" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </>
          ) : (
            <div className="rounded-md border border-up/30 bg-up/10 px-3 py-3 text-xs">If {email} is registered, a reset link is on its way.</div>
          )}
          <button type="button" className="w-full text-center text-xs text-fog hover:text-ink1" onClick={() => { setForgot(false); setSent(false); }}>← Back to sign in</button>
        </form>
      )}
    </AuthFrame>
  );
}

export function AffiliateSignup() {
  const nav = useNavigate();
  const register = useAuth((s) => s.register);
  const login = useAuth((s) => s.login);
  const user = useAuth((s) => s.user);
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (user || hasSession()) return <Navigate to="/affiliate" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setBusy(true); setErr(null);
    try {
      await register({ email: f.email.trim(), password: f.password, firstName: f.firstName.trim(), lastName: f.lastName.trim() }, { partner: true });
      await login(f.email.trim(), f.password, true);
      nav('/affiliate', { replace: true }); // the Affiliate Center then shows the partner application
    } catch (e2) { setErr(apiError(e2)); setBusy(false); }
  };

  return (
    <AuthFrame footer={<>Already a partner? <Link to="/affiliate/login" className="text-accent-300 font-semibold hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-cream">Become a partner</h1>
          <p className="text-xs text-mute mt-0.5">Create your account, then tell us about your traffic sources. One account works for both the Affiliate Center and the trading platform.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="as-fn" className="ax-label">First name</label><input id="as-fn" className="ax-input" autoComplete="given-name" value={f.firstName} onChange={set('firstName')} required maxLength={80} /></div>
          <div><label htmlFor="as-ln" className="ax-label">Last name</label><input id="as-ln" className="ax-input" autoComplete="family-name" value={f.lastName} onChange={set('lastName')} required maxLength={80} /></div>
        </div>
        <div><label htmlFor="as-email" className="ax-label">Email</label><input id="as-email" className="ax-input" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></div>
        <div><label htmlFor="as-pass" className="ax-label">Password</label><input id="as-pass" className="ax-input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required /></div>
        <Err message={err} />
        <button className="ax-btn-primary w-full !h-10" disabled={busy}>{busy ? 'Creating account…' : 'Sign up'}</button>
      </form>
    </AuthFrame>
  );
}
