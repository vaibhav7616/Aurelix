import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { fmtPrice, fmtPct, clsUpDown } from '../../lib/format';
import { clsx } from 'clsx';

interface Quote { symbol: string; name: string; category: string; enabled: boolean; tick: { mid: number; bid: number; ask: number; changePct24h: number } | null }

export function MarketsPage() {
  const { data } = useQuery({
    queryKey: ['pub-assets'],
    queryFn: () => get<{ demo: boolean; assets: Quote[] }>('/api/v1/assets'),
    refetchInterval: 3000,
  });
  const assets = data?.assets ?? [];
  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5">
        <h1 className="ax-h1 text-2xl">Markets</h1>
      </div>
      <p className="text-[13px] text-mute mt-1.5 max-w-[640px]">Live streaming quotes from the Aurelix market engine.</p>
      <div className="ax-panel mt-5 overflow-hidden">
        <table className="w-full">
          <thead><tr>{['Instrument', 'Last', '24h', 'Bid', 'Ask', 'Status', ''].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol} className="ax-row">
                <td className="ax-td"><span className="font-bold text-[13px]">{a.symbol}</span><span className="text-mute text-[11px] ml-2">{a.name}</span></td>
                <td className="ax-td ax-num font-bold text-[13px]">{a.tick ? fmtPrice(a.tick.mid) : '—'}</td>
                <td className={clsx('ax-td ax-num font-semibold', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</td>
                <td className="ax-td ax-num text-fog">{a.tick ? fmtPrice(a.tick.bid) : '—'}</td>
                <td className="ax-td ax-num text-fog">{a.tick ? fmtPrice(a.tick.ask) : '—'}</td>
                <td className="ax-td">{a.enabled ? <span className="text-up text-[11px] font-semibold">● Tradable</span> : <span className="text-down text-[11px] font-semibold">● Halted</span>}</td>
                <td className="ax-td text-right"><Link to="/register" className="ax-btn-ghost ax-btn-sm">Trade →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Doc({ title, intro, blocks }: { title: string; intro: string; blocks: Array<[string, string[]]> }) {
  return (
    <div className="max-w-[860px] mx-auto px-4 py-8">
      <h1 className="ax-h1 text-2xl">{title}</h1>
      <p className="text-[13px] text-mute mt-1.5 max-w-[640px]">{intro}</p>
      <div className="grid sm:grid-cols-2 gap-2.5 mt-6">
        {blocks.map(([h, pts]) => (
          <div key={h} className="ax-panel p-4">
            <div className="text-[13px] font-bold">{h}</div>
            <ul className="mt-2 space-y-1.5">
              {pts.map((p) => <li key={p} className="text-xs text-fog leading-relaxed flex gap-2"><span className="text-accent-300 mt-[1px]">–</span>{p}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="ax-panel mt-2.5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="text-[13px] font-semibold flex-1">Try it with a free $10,000 account.</div>
        <Link to="/register" className="ax-btn-primary">Create account</Link>
      </div>
    </div>
  );
}

export function FeaturesPage() {
  return <Doc title="Features" intro="A complete terminal stack: pricing, charting, execution, risk and reporting." blocks={[
    ['Trading terminal', ['Candlestick, line and area charts across 7 timeframes', 'Volume, SMA, EMA and Bollinger overlays', 'Trend-line and horizontal-line drawing tools', 'One-click Up / Down ticket with live payout preview']],
    ['Execution engine', ['Server-side fills at live quotes', 'Atomic order → position → ledger writes', 'Idempotent submission — no double fills', 'Realized P/L with per-asset fees']],
    ['Risk management', ['Stake debited on open — you can never lose more than you invest', 'Daily and total loss circuit breakers', 'Per-trade and running-trade limits', 'Halted-asset protection']],
    ['Account & reporting', ['Multiple accounts per user', 'Full trade history with filters', 'Immutable-style transaction ledger', 'Win rate, P/L and activity analytics']],
  ]} />;
}

export function HowItWorksPage() {
  return <Doc title="How it works" intro="From quote to settlement — what happens when you press Up or Down." blocks={[
    ['1 · Quotes stream in', ['Engine ticks every second per asset', 'Volatility and spread calibrated per symbol', 'Candles built and cached for 7 timeframes']],
    ['2 · You place a trade', ['Direction (Up/Down), investment, expiry time', 'Entry price is fixed server-side at the moment you click', 'Idempotency key prevents duplicates on double-click']],
    ['3 · Risk validates', ['Balance vs. available funds', 'Order, position and loss limits', 'Asset status and account standing']],
    ['4 · Trade runs to expiry', ['Live win/lose preview on every tick', 'Settlement loop fires at the exact expiry', 'Won → stake + payout credited · Tie → stake returned · Lost → nothing']],
  ]} />;
}

export function SecurityPage() {
  return <Doc title="Security" intro="How accounts, sessions and money-movements are protected." blocks={[
    ['Credentials', ['Passwords hashed with bcrypt (12 rounds)', 'Short-lived access tokens (15 min)', 'Revocable refresh sessions per device', 'Password change revokes all sessions']],
    ['Access control', ['Trader / admin / super-admin roles', 'Users only see their own accounts', 'Private websocket rooms per user', 'Admin money actions require a reason']],
    ['Edge protection', ['Rate limits on auth and orders', 'Validated input on every endpoint', 'Security headers via nginx', 'Request IDs and structured logs']],
    ['Auditability', ['Every sensitive action is logged', 'Login, orders, closes, adjustments', 'Withdrawal state machine with notes', 'No secrets ever written to logs']],
  ]} />;
}

export function FaqPage() {
  return <Doc title="FAQ" intro="Straight answers about the platform." blocks={[
    ['How does my account work?', ['Registration opens an account with a $10,000 balance.', 'Orders execute instantly against streaming quotes.', 'Deposits and withdrawals run through your wallet.']],
    ['What does it cost?', ['Free. Registration opens a $10,000 account.', 'No card, no trial clock, no upsell inside.']],
    ['Do stops really work?', ['Yes — evaluated on the server tick stream.', 'They trigger even if you disconnect.', 'Fills settle to ledger and history instantly.']],
    ['Can I self-host?', ['Yes — docker compose up -d --build.', 'Postgres + Redis + API + web + nginx.', 'See the README for credentials and ops.']],
  ]} />;
}
