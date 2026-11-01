import { clsx } from 'clsx';
import { apiError } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { Page, Panel, TableWrap, WEEKDAYS, levelRange, useAffMe, usePrograms, type Level } from './shared';

/** Level table; highlights `current` when given. Exported for the Sub-Affiliate page. */
export function LevelsTable({ levels, current, columns = ['rev', 'turn', 'sub'] }: { levels: Level[]; current?: number; columns?: Array<'rev' | 'turn' | 'sub'> }) {
  return (
    <TableWrap>
      <table className="w-full">
        <thead>
          <tr>
            <th className="ax-th">Level</th><th className="ax-th">Deposits / month</th>
            {columns.includes('rev') && <th className="ax-th text-right">Revenue Share</th>}
            {columns.includes('turn') && <th className="ax-th text-right">Turnover Share</th>}
            {columns.includes('sub') && <th className="ax-th text-right">Sub-affiliate</th>}
          </tr>
        </thead>
        <tbody>
          {levels.map((l, i) => (
            <tr key={l.level} className={clsx('ax-row', current === l.level && 'bg-accent-500/10')} aria-current={current === l.level ? 'true' : undefined}>
              <td className="ax-td ax-num font-semibold">{l.level}{current === l.level && <span className="text-accent-300 font-normal"> · you</span>}</td>
              <td className="ax-td ax-num">{levelRange(levels, i)}</td>
              {columns.includes('rev') && <td className="ax-td text-right ax-num">{l.revsharePct}%</td>}
              {columns.includes('turn') && <td className="ax-td text-right ax-num">{l.turnoverPct}%</td>}
              {columns.includes('sub') && <td className="ax-td text-right ax-num">{l.subPct}%</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function AffiliatePrograms() {
  const { data: p, isLoading, error } = usePrograms();
  const { data: me } = useAffMe();
  const current = me && me.affiliate ? me.level.level : undefined;

  if (isLoading) return <Page title="Affiliate Programs"><p className="text-xs text-mute">Loading…</p></Page>;
  if (!p) return <Page title="Affiliate Programs"><p className="text-xs text-down">{apiError(error)}</p></Page>;

  const levels = [...p.levels].sort((a, b) => a.minDeposits - b.minDeposits);
  const rates = Object.entries(p.cpa.rates);
  const rateLabel = (k: string) => (k === 'default' ? 'All other countries' : k);

  return (
    <Page title="Affiliate Programs" lead="A summary of how partner commission works. The full affiliate terms are available on request from your programme manager through Support.">
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Revenue Share">
          <div className="text-xs text-fog leading-relaxed space-y-2">
            <p>You receive a share of the platform’s net result from the trades of the traders you referred. When the platform’s result from your traders is negative for a period, that amount reduces your balance.</p>
            <p>Share: {levels[0]?.revsharePct}%–{levels[levels.length - 1]?.revsharePct}% depending on your level.</p>
            {!p.revshareAvailable && <p className="text-warn">Revenue Share is not offered in your country.</p>}
          </div>
        </Panel>
        <Panel title="Turnover Share">
          <div className="text-xs text-fog leading-relaxed space-y-2">
            <p>You receive a share of the settled trading volume of your traders, whatever the trade outcome.</p>
            <p>Share: {levels[0]?.turnoverPct}%–{levels[levels.length - 1]?.turnoverPct}% depending on your level. The total turnover commission from one trader can never exceed {p.turnoverCapPctOfDeposits}% of that trader’s deposits.</p>
          </div>
        </Panel>
        <Panel title="CPA" pad className="min-w-0">
          <div className="text-xs text-fog leading-relaxed space-y-2">
            <p>A one-time payment for each qualified new trader: a first deposit of at least {fmtMoney(p.cpa.minFtd)} and trading activity within {p.cpa.withinDays} days of registration.</p>
            {p.cpa.available && rates.length ? (
              <table className="w-full mt-2">
                <thead><tr><th className="ax-th">Trader country</th><th className="ax-th text-right">Payment</th></tr></thead>
                <tbody>
                  {rates.sort(([a], [b]) => (a === 'default' ? 1 : b === 'default' ? -1 : a.localeCompare(b))).map(([k, v]) => (
                    <tr key={k} className="ax-row"><td className="ax-td">{rateLabel(k)}</td><td className="ax-td text-right ax-num">{fmtMoney(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-warn">CPA is not available at the moment.</p>}
          </div>
        </Panel>
        <Panel title="Sub-Affiliate">
          <div className="text-xs text-fog leading-relaxed space-y-2">
            <p>Invite other partners with your sub-affiliate link. When their applications are approved, you receive a percentage of the commission they earn — {levels[0]?.subPct}%–{levels[levels.length - 1]?.subPct}% depending on your level. This is paid on top of their commission, not taken from it.</p>
            <p>Your earnings from one sub-affiliate are capped at {fmtMoney(p.subAffiliateCapUsd)} in total.</p>
          </div>
        </Panel>
      </div>

      <Panel title="Levels" pad={false} className="overflow-hidden">
        <LevelsTable levels={levels} current={current} />
        <p className="px-4 py-3 text-[11px] text-mute">Levels are based on the number of deposits made by your traders in a calendar month.</p>
      </Panel>

      <Panel title="Key rules (summary)">
        <ul className="text-xs text-fog leading-relaxed space-y-1.5 list-disc pl-4">
          <li>The commission model and share are fixed for each trader at the moment they register.</li>
          <li>Levels are recalculated on the 1st of each month from the previous month’s deposits.</li>
          <li>Bonus funds are excluded from all commission calculations.</li>
          <li>Your first withdrawal requires {p.minActiveTraders} active traders. An active trader has made a deposit and at least {p.activeTraderMinTrades} settled trade{p.activeTraderMinTrades === 1 ? '' : 's'}.</li>
          <li>Payouts run weekly every {WEEKDAYS[p.payoutWeekday] ?? '—'} at 00:00 UTC. The minimum payout is {fmtMoney(p.minPayout)}; smaller balances carry over.</li>
          <li>Commission from suspicious traffic may be held for review for up to {p.maxHoldDays} days.</li>
          <li>Self-referrals, shared devices, IP addresses or payment details, fraud and bonus abuse void the related commission.</li>
        </ul>
        <p className="text-[11px] text-mute mt-3">This page is a summary only. The full affiliate terms are provided on request by the programme manager — ask in Support.</p>
      </Panel>
    </Page>
  );
}
