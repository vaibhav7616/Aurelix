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
  const { data: cfg } = useQuery({ queryKey: ['pub-options-config'], queryFn: () => get<{ assets: Array<{ symbol: string; payoutPct: number }> }>('/api/v1/options/config'), staleTime: 60_000 });
  const payout = (sym: string) => cfg?.assets.find((a) => a.symbol === sym)?.payoutPct;
  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5">
        <h1 className="ax-h1 text-2xl">Markets</h1>
      </div>
      <p className="text-[13px] text-mute mt-1.5 max-w-[640px]">Live prices and the payout you receive on a winning trade. Payouts are set per market and shown again in the terminal before you trade.</p>
      <div className="ax-panel mt-5 overflow-hidden">
        <table className="w-full">
          <thead><tr>{['Instrument', 'Last', '24h', 'Bid', 'Ask', 'Payout', 'Status', ''].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol} className="ax-row">
                <td className="ax-td"><span className="font-bold text-[13px]">{a.symbol}</span><span className="text-mute text-[11px] ml-2">{a.name}</span></td>
                <td className="ax-td ax-num font-bold text-[13px]">{a.tick ? fmtPrice(a.tick.mid) : '—'}</td>
                <td className={clsx('ax-td ax-num font-semibold', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</td>
                <td className="ax-td ax-num text-fog">{a.tick ? fmtPrice(a.tick.bid) : '—'}</td>
                <td className="ax-td ax-num text-fog">{a.tick ? fmtPrice(a.tick.ask) : '—'}</td>
                <td className="ax-td ax-num font-semibold text-up">{payout(a.symbol) != null ? `${payout(a.symbol)}%` : '—'}</td>
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
        <div className="text-[13px] font-semibold flex-1">Practise free with a $10,000 demo balance.</div>
        <Link to="/register" className="ax-btn-primary">Create account</Link>
      </div>
    </div>
  );
}

export function FeaturesPage() {
  return <Doc title="Features" intro="Everything you need to trade fixed-time contracts — and nothing that hides the terms." blocks={[
    ['Trading terminal', ['Candles, line and area charts across 8 timeframes (5s to 1h)', 'Volume, SMA, EMA, Bollinger, SAR and Supertrend', 'Trend, horizontal, support/resistance and Fibonacci drawings', 'Up / Down ticket with the payout shown before you trade']],
    ['Ways to trade', ['Timer mode: trade lengths from 5 seconds to 4 hours', 'Time mode: close on a fixed clock minute', 'Pending trades: open automatically when price reaches your level', 'Keyboard shortcuts for fast entry']],
    ['Your money', ['Investment reserved on open — you never lose more than you invest', 'Free $10,000 demo account; live account starts at $0', 'Deposits credited after the payment is verified', 'Withdrawals reviewed before payout']],
    ['Records', ['Full trade history with entry and closing prices', 'Closing-quote time shown for every settled trade', 'Wallet ledger of every deposit, trade and withdrawal', 'Win rate and profit/loss analytics']],
  ]} />;
}

export function HowItWorksPage() {
  return <Doc title="How it works" intro="From your click to the result — what happens when you press Up or Down." blocks={[
    ['1 · You choose', ['A market: crypto, forex or gold', 'Up or Down, your investment, and how long the trade runs', 'The payout for a win is shown before you confirm']],
    ['2 · The trade opens', ['Entry price is the live server price at that moment', 'Your investment is reserved and the payout is locked', 'A double-click can never open two trades']],
    ['3 · Checks before it opens', ['Enough available balance', 'Market open and prices current — no trades on a stale price', 'Investment within the market minimum and maximum']],
    ['4 · Settled at expiry', ['Decided on the price live at the exact expiry second', 'Higher (for Up) or lower (for Down): investment + payout credited', 'Equal price: investment returned · Wrong direction: investment lost']],
  ]} />;
}

export function SecurityPage() {
  return <Doc title="Security" intro="How your account, your sessions and your money are protected." blocks={[
    ['Sign-in', ['Passwords stored only as bcrypt hashes', 'Sessions in secure, HttpOnly cookies that page scripts cannot read', 'Session keys renewed on every use; a copied key ends the session', 'Changing your password signs out every device']],
    ['Account protection', ['Login attempts limited per device and per account', 'You can only ever see and act on your own accounts', 'Encrypted connection (HTTPS) between you and the platform', 'Strict browser security policy against injected scripts']],
    ['Money movements', ['Deposits credited only after the payment is verified', 'Each payment reference can be used once', 'Withdrawals reviewed before payout, only from live funds', 'Balances protected against duplicate or parallel requests']],
    ['Accountability', ['Every sensitive action is recorded', 'Administrator balance changes require a written reason', 'Your password and session keys never appear in logs', 'Settlement proof stored with every trade']],
  ]} />;
}

export function FaqPage() {
  const { data: cfg } = useQuery({ queryKey: ['pub-options-config'], queryFn: () => get<{ minWithdrawal?: number }>('/api/v1/options/config'), staleTime: 60_000 });
  const minWd = cfg?.minWithdrawal ?? 100;
  return <Doc title="FAQ" intro="Straight answers before you trade." blocks={[
    ['What is a fixed-time trade?', ['You predict whether the price will be higher (Up) or lower (Down) after a set time.', 'If you are right you get your investment back plus the payout shown.', 'If you are wrong you lose the investment. An equal price returns it.']],
    ['What is the demo account?', ['Every new account includes $10,000 in practice money.', 'Same markets and prices as live; you can top it up any time.', 'Demo money can never be withdrawn.']],
    ['How do deposits work?', ['Deposits go to your live account, which starts at $0.', 'Pay by a method shown in the cashier, then submit your payment reference.', 'Your balance is credited once the payment is confirmed.']],
    ['How do withdrawals work?', [`Request a withdrawal from your live balance (minimum $${minWd}).`, 'The amount is reserved while the request is reviewed.', 'You can cancel a request until it is being processed.']],
    ['What decides if I win?', ['The price live at the exact expiry second, recorded by the server.', 'Closing your browser does not affect the result.', 'Each closed trade shows its entry price, closing price and quote time.']],
    ['Why does the payout differ by market?', ['Each market has its own payout percentage.', 'It is shown on the Markets page and in the terminal before you trade.', 'The payout you see when the trade opens is the one you get.']],
    ['What does OTC mean?', ['OTC markets are priced by the platform’s own quote engine, not an exchange.', 'They are marked OTC in the terminal.', 'Markets that follow an exchange feed are shown without the label.']],
    ['Can I lose more than I invest?', ['No. The most you can lose on a trade is its investment.', 'But you can lose it quickly — trade only money you can afford to lose.', 'Read the risk disclosure before trading live.']],
  ]} />;
}

export function RiskPage() {
  return (
    <div className="max-w-[860px] mx-auto px-4 py-8">
      <h1 className="ax-h1 text-2xl">Risk disclosure</h1>
      <p className="text-[13px] text-mute mt-1.5 max-w-[680px]">Please read this before trading with real money.</p>
      <div className="ax-panel mt-6 p-5 space-y-4 text-[13px] text-fog leading-relaxed">
        {[
          ['High risk of loss', 'Fixed-time trading is speculative and high risk. On every trade you can lose the full amount you invested, and losses can add up quickly over many short trades.'],
          ['Results are not guaranteed', 'The payout percentage applies only to winning trades. Past results — your own, or anyone shown on a leaderboard — do not predict future results.'],
          ['Short time frames', 'Prices can move sharply within seconds. Very short trades behave much like a coin toss; a strategy that works in demo may not work live.'],
          ['OTC prices', 'Markets marked OTC are priced by the platform’s own quote engine rather than an exchange, and can differ from prices quoted elsewhere.'],
          ['Only trade what you can afford to lose', 'Never trade with borrowed money or money you need for living costs. Use the demo account to learn, and set yourself limits before trading live.'],
          ['Not financial advice', 'Nothing on this site is investment, financial or tax advice. Fixed-time products may be restricted or unavailable where you live — it is your responsibility to check the rules that apply to you.'],
        ].map(([h, t]) => (
          <div key={h}>
            <div className="text-[13.5px] font-semibold text-ink1">{h}</div>
            <p className="mt-1">{t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PlatformStatus {
  checkedAt: string;
  overall: 'operational' | 'degraded';
  settlement: { state: 'ok' | 'delayed'; overdueTrades: number; lastSettledAt: string | null };
  markets: Array<{ symbol: string; name: string; state: 'live' | 'delayed' | 'no-data' | 'closed'; otc: boolean; quoteAgeMs: number | null }>;
}

const STATE: Record<PlatformStatus['markets'][number]['state'], [string, string]> = {
  live: ['Live', 'text-up'],
  delayed: ['Prices delayed — trading paused', 'text-warn'],
  'no-data': ['No prices', 'text-down'],
  closed: ['Closed', 'text-mute'],
};

export function StatusPage() {
  const { data, isError } = useQuery({ queryKey: ['pub-status'], queryFn: () => get<PlatformStatus>('/api/v1/public/status'), refetchInterval: 5000 });
  const ok = data?.overall === 'operational';
  return (
    <div className="max-w-[860px] mx-auto px-4 py-8">
      <h1 className="ax-h1 text-2xl">Platform status</h1>
      <p className="text-[13px] text-mute mt-1.5">Checked live every few seconds. A market with delayed prices does not accept new trades until prices are current again.</p>
      <div className={clsx('ax-panel mt-6 p-4 flex items-center gap-3', isError ? 'border-down/40' : ok ? 'border-up/30' : 'border-warn/40')}>
        <span className={clsx('w-2.5 h-2.5 rounded-full', isError ? 'bg-down' : !data ? 'bg-mute' : ok ? 'bg-up' : 'bg-warn')} aria-hidden />
        <div className="text-[14px] font-semibold" role="status">
          {isError ? 'Status unavailable — the platform may be unreachable' : !data ? 'Checking…' : ok ? 'All systems operational' : 'Some services degraded'}
        </div>
        {data && <span className="ml-auto text-[11px] text-mute ax-num">checked {new Date(data.checkedAt).toLocaleTimeString()}</span>}
      </div>
      {data && (
        <>
          <div className="ax-panel mt-2.5 p-4">
            <div className="text-[13px] font-semibold">Trade settlement</div>
            <div className="text-xs text-fog mt-1">
              {data.settlement.state === 'ok'
                ? 'Running normally — every expired trade has been settled.'
                : `Catching up: ${data.settlement.overdueTrades} trade(s) waiting. Each will settle on the price at its exact expiry.`}
              {data.settlement.lastSettledAt && <span className="text-mute"> Last settlement {new Date(data.settlement.lastSettledAt).toLocaleString()}.</span>}
            </div>
          </div>
          <div className="ax-panel mt-2.5 overflow-hidden">
            <table className="w-full">
              <thead><tr>{['Market', 'Price source', 'Status'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
              <tbody>
                {data.markets.map((m) => (
                  <tr key={m.symbol} className="ax-row">
                    <td className="ax-td"><span className="font-semibold">{m.symbol}</span><span className="text-mute text-[11px] ml-2">{m.name}</span></td>
                    <td className="ax-td text-fog">{m.otc ? 'OTC — platform quote engine' : 'Exchange feed'}</td>
                    <td className={clsx('ax-td font-semibold', STATE[m.state][1])}>● {STATE[m.state][0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function ContactPage() {
  const { data: c } = useQuery({ queryKey: ['pub-contact'], queryFn: () => get<{ email: string | null; whatsapp: string | null; telegram: string | null; hours: string | null }>('/api/v1/public/contact'), staleTime: 5 * 60_000 });
  const channels: Array<[string, string, string]> = [];
  if (c?.email) channels.push(['Email', c.email, `mailto:${c.email}`]);
  if (c?.whatsapp) channels.push(['WhatsApp', `+${c.whatsapp}`, `https://wa.me/${c.whatsapp}`]);
  if (c?.telegram) channels.push(['Telegram', `@${c.telegram}`, `https://t.me/${c.telegram}`]);
  return (
    <div className="max-w-[860px] mx-auto px-4 py-8">
      <h1 className="ax-h1 text-2xl">Contact & support</h1>
      <p className="text-[13px] text-mute mt-1.5 max-w-[640px]">We will never ask for your password, your UPI PIN or a one-time code — by any channel. Anyone who does is not Aurelix.</p>
      <div className="grid sm:grid-cols-2 gap-2.5 mt-6">
        <div className="ax-panel p-4">
          <div className="text-[13px] font-semibold">Reach us</div>
          {channels.length ? (
            <ul className="mt-2 space-y-2">
              {channels.map(([k, v, href]) => (
                <li key={k} className="text-xs flex items-center justify-between gap-3">
                  <span className="text-mute">{k}</span>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-300 hover:underline ax-num">{v}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fog mt-2">Signed-in traders can reach support from the Support page in the terminal.</p>
          )}
          {c?.hours && <p className="text-[11px] text-mute mt-3">Hours: {c.hours}</p>}
        </div>
        <div className="ax-panel p-4">
          <div className="text-[13px] font-semibold">Find an answer first</div>
          <ul className="mt-2 space-y-1.5 text-xs">
            {[['/faq', 'FAQ — deposits, withdrawals, payouts'], ['/status', 'Platform status — is everything running?'], ['/risk', 'Risk disclosure'], ['/how-it-works', 'How a trade is settled']].map(([to, l]) => (
              <li key={to}><Link to={to} className="text-fog hover:text-ink1">→ {l}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="ax-panel mt-2.5 p-4 text-xs text-fog">
        <span className="font-semibold text-ink1">About a deposit or withdrawal?</span> Include the deposit order reference (DEP-…) or withdrawal ID and the UTR / transaction hash, so we can find it straight away.
      </div>
    </div>
  );
}

interface PromoTerms {
  bonus: { turnoverMultiple: number; offers: Array<{ code: string; bonusPct: number; minDeposit: number; title: string }> };
}
interface AffiliateTerms {
  levels: Array<{ level: number; minDeposits: number; revsharePct: number; turnoverPct: number; subPct: number }>;
  turnoverCapPctOfDeposits: number; subAffiliateCapUsd: number; minActiveTraders: number; minPayout: number; payoutWeekday: number; cpaAvailable: boolean;
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function PromotionsPage() {
  const { data: t } = useQuery({ queryKey: ['pub-promotions'], queryFn: () => get<PromoTerms>('/api/v1/public/promotions'), staleTime: 60_000 });
  const { data: aff } = useQuery({ queryKey: ['pub-affiliate-programs'], queryFn: () => get<AffiliateTerms>('/api/v1/public/affiliate-programs'), staleTime: 60_000 });
  const m = t?.bonus.turnoverMultiple ?? 100;
  const ex = 50;
  return (
    <div className="max-w-[1000px] mx-auto px-4 py-8">
      <h1 className="ax-h1 text-2xl">Promotions</h1>
      <p className="text-[13px] text-mute mt-1.5 max-w-[680px]">Deposit bonuses and the affiliate programme. The terms below are the exact rules the platform applies — read them before using a bonus.</p>

      <div className="ax-micro mt-8">Deposit bonuses</div>
      <div className="grid sm:grid-cols-3 gap-2.5 mt-3">
        {(t?.bonus.offers ?? []).map((o) => (
          <div key={o.code} className="ax-panel p-4">
            <div className="text-[11px] font-semibold text-warn tracking-[0.08em] uppercase">{o.title}</div>
            <div className="font-display text-[30px] leading-none mt-2">+{o.bonusPct}%</div>
            <div className="text-xs text-fog mt-2">Code <span className="font-mono text-ink1">{o.code}</span> · minimum deposit ${o.minDeposit}</div>
            <div className="text-[11px] text-mute mt-1">e.g. deposit $100 → ${Math.round(o.bonusPct)} bonus · unlocks after ${(o.bonusPct * m).toLocaleString('en-US')} traded</div>
          </div>
        ))}
        {t && !t.bonus.offers.length && <div className="ax-panel p-4 text-xs text-mute sm:col-span-3">No deposit bonus is running right now.</div>}
      </div>
      <div className="ax-panel mt-2.5 p-5">
        <div className="text-[13.5px] font-semibold">How bonuses work</div>
        <ul className="mt-2 space-y-1.5 text-xs text-fog leading-relaxed">
          {[
            'Enter the code in the cashier when you make a live deposit. The bonus is added when the deposit is verified.',
            `The bonus is locked until your trading volume reaches ${m}× the bonus amount (turnover). Example: a $${ex} bonus unlocks after $${(ex * m).toLocaleString('en-US')} of settled live trades.`,
            'Every settled live trade counts its full investment toward turnover. Trades that end in a tie do not count.',
            'Your own deposit and your trading profits are not locked — you can withdraw them at any time.',
            'Withdrawing more than the unlocked amount before turnover is complete cancels the bonus: the bonus amount is removed from your balance. You are always asked to confirm first.',
            'Bonuses apply to live deposits only, one bonus per deposit. Demo accounts have no bonuses.',
          ].map((s) => <li key={s} className="flex gap-2"><span className="text-accent-300">–</span>{s}</li>)}
        </ul>
      </div>

      <div className="ax-micro mt-10">Affiliate programme</div>
      <div className="grid md:grid-cols-[1fr_380px] gap-2.5 mt-3">
        <div className="ax-panel p-5">
          <div className="font-display text-[22px]">Partner with Aurelix</div>
          <p className="text-xs text-fog mt-2 leading-relaxed">Bring traders and earn from their activity through the Aurelix Affiliate Center: tracking links with sub-IDs, partner promo codes, postbacks, statistics, promo materials and Telegram notifications.</p>
          <ul className="mt-3 space-y-1.5 text-xs text-fog leading-relaxed">
            {[
              'Revenue Share — a share of the platform’s net result from your traders.',
              `Turnover Share — a share of your traders’ trading volume (capped at ${aff?.turnoverCapPctOfDeposits ?? '—'}% of each trader’s deposits).`,
              aff?.cpaAvailable ? 'CPA — a fixed payment for each qualified new trader.' : 'CPA — available on request.',
              `Sub-affiliate — earn a share of the partners you invite (up to $${(aff?.subAffiliateCapUsd ?? 0).toLocaleString('en-US')} per partner).`,
              `Your level rises with the number of deposits your traders make each month. Payouts weekly on ${WEEKDAYS[aff?.payoutWeekday ?? 4]}s (minimum $${aff?.minPayout ?? '—'}) once you have ${aff?.minActiveTraders ?? '—'} active traders.`,
              'Partners are reviewed and verified. Self-referrals, shared devices or payment details, spam and misleading advertising void commission.',
            ].map((x) => <li key={x} className="flex gap-2"><span className="text-accent-300">–</span>{x}</li>)}
          </ul>
          <Link to="/affiliate" className="ax-btn-primary mt-4 inline-flex">Open the Affiliate Center</Link>
        </div>
        <div className="ax-panel overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="ax-th">Level</th><th className="ax-th">Deposits / month</th><th className="ax-th text-right">RevShare</th><th className="ax-th text-right">Turnover</th><th className="ax-th text-right">Sub</th></tr></thead>
            <tbody>
              {(aff?.levels ?? []).map((l, i, all) => (
                <tr key={l.level} className="ax-row">
                  <td className="ax-td">{l.level}</td>
                  <td className="ax-td ax-num">{all[i + 1] ? `${l.minDeposits}–${all[i + 1].minDeposits - 1}` : `${l.minDeposits}+`}</td>
                  <td className="ax-td ax-num text-right text-up">{l.revsharePct}%</td>
                  <td className="ax-td ax-num text-right">{l.turnoverPct}%</td>
                  <td className="ax-td ax-num text-right">{l.subPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="ax-panel mt-2.5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="text-[13px] font-semibold flex-1">Bonuses and affiliate earnings involve real money. Trading remains high risk — <Link to="/risk" className="text-accent-300 hover:underline">read the risk disclosure</Link>.</div>
        <Link to="/register" className="ax-btn-primary">Create account</Link>
      </div>
    </div>
  );
}
