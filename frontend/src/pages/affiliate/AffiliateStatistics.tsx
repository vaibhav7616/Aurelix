import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { get, apiError } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import {
  AFF, EmptyRow, LoadingRow, MODEL_LABEL, Page, Panel, StatusTag, TableWrap, downloadCsv, fmtDate, isoDay, pct, useLinks,
  type DayRow, type Trader,
} from './shared';

const QUICK = [7, 30, 90];
type View = 'daily' | 'traders' | 'links' | 'countries';
const TABS: Array<[View, string]> = [['daily', 'Dates'], ['traders', 'Traders'], ['links', 'Links'], ['countries', 'Countries']];
interface LinkStat { id: string; num: number; name: string; model: string; landing: string; clicks: number; registrations: number; ftd: number; ftdSum: number; depositSum: number; commission: number }
interface CountryStat { country: string | null; clicks: number; registrations: number; ftd: number; ftdSum: number }
const countryName = (c: string | null) => {
  if (!c) return 'Unknown';
  try { return `${new Intl.DisplayNames(['en'], { type: 'region' }).of(c) ?? c} (${c})`; } catch { return c; }
};

export function AffiliateStatistics() {
  const [from, setFrom] = useState(isoDay(29));
  const [to, setTo] = useState(isoDay(0));
  const [linkId, setLinkId] = useState('');
  const [subInput, setSubInput] = useState('');
  const [subId, setSubId] = useState('');
  const [params, setParams] = useSearchParams();
  const view = (TABS.some(([v]) => v === params.get('tab')) ? params.get('tab') : 'daily') as View;
  const setView = (v: View) => setParams(v === 'daily' ? {} : { tab: v }, { replace: true });
  const links = useLinks();

  const validRange = !!from && !!to && from <= to;
  const stats = useQuery({
    queryKey: ['aff', 'stats', from, to, linkId, subId],
    queryFn: () => get<{ days: DayRow[] }>(`${AFF}/stats`, { from, to, ...(linkId ? { linkId } : {}), ...(subId ? { subId } : {}) }),
    enabled: validRange,
  });
  const traders = useQuery({ queryKey: ['aff', 'traders'], queryFn: () => get<Trader[]>(`${AFF}/traders`) });
  const byLinks = useQuery({ queryKey: ['aff', 'stats-by', 'links', from, to], queryFn: () => get<LinkStat[]>(`${AFF}/stats/by`, { dim: 'links', from, to }), enabled: validRange && view === 'links' });
  const byCountries = useQuery({ queryKey: ['aff', 'stats-by', 'countries', from, to], queryFn: () => get<CountryStat[]>(`${AFF}/stats/by`, { dim: 'countries', from, to }), enabled: validRange && view === 'countries' });

  const days = stats.data?.days ?? [];
  const totals = useMemo(() => days.reduce(
    (a, d) => ({ clicks: a.clicks + d.clicks, registrations: a.registrations + d.registrations, ftd: a.ftd + d.ftd, ftdSum: a.ftdSum + d.ftdSum, deposits: a.deposits + d.deposits, depositSum: a.depositSum + d.depositSum, commission: a.commission + d.commission }),
    { clicks: 0, registrations: 0, ftd: 0, ftdSum: 0, deposits: 0, depositSum: 0, commission: 0 },
  ), [days]);

  const traderRows = (traders.data ?? []).filter((t) => (!linkId || t.linkId === linkId) && (!subId || t.subId === subId));
  const span = validRange ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;

  const exportCsv = () => {
    if (view === 'links') {
      downloadCsv(`affiliate-links-${from}_${to}.csv`, ['Link ID', 'Comment', 'Program', 'Clicks', 'Registrations', 'FTD', 'FTD sum', 'Deposit sum', 'Commission'],
        (byLinks.data ?? []).map((l) => [l.num, l.name, MODEL_LABEL[l.model] ?? l.model, l.clicks, l.registrations, l.ftd, l.ftdSum, l.depositSum, l.commission]));
      return;
    }
    if (view === 'countries') {
      downloadCsv(`affiliate-countries-${from}_${to}.csv`, ['Country', 'Clicks', 'Registrations', 'FTD', 'FTD sum'],
        (byCountries.data ?? []).map((c) => [c.country ?? '', c.clicks, c.registrations, c.ftd, c.ftdSum]));
      return;
    }
    if (view === 'daily') {
      downloadCsv(`affiliate-daily-${from}_${to}.csv`,
        ['Date', 'Clicks', 'Registrations', 'First deposits', 'First deposit sum', 'Deposits', 'Deposit sum', 'Commission'],
        [...days.map((d) => [d.day, d.clicks, d.registrations, d.ftd, d.ftdSum, d.deposits, d.depositSum, d.commission]),
          ['Total', totals.clicks, totals.registrations, totals.ftd, totals.ftdSum.toFixed(2), totals.deposits, totals.depositSum.toFixed(2), totals.commission.toFixed(2)]]);
    } else {
      downloadCsv('affiliate-traders.csv',
        ['Trader', 'Model', 'Level', 'Share %', 'Link', 'Sub-ID', 'Registered', 'First deposit date', 'First deposit', 'Deposits total', 'Active', 'Status', 'Commission'],
        traderRows.map((t) => [t.trader, MODEL_LABEL[t.model] ?? t.model, t.level, t.sharePct, t.link, t.subId ?? '', fmtDate(t.registeredAt), t.ftdAt ? fmtDate(t.ftdAt) : '', t.ftdAmount ?? '', t.depositTotal, t.active ? 'yes' : 'no', t.status, t.commission]));
    }
  };

  return (
    <Page title="Statistics" lead="Statistics by dates, traders, links and countries. Dates are in UTC.">
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="st-from" className="ax-label">From</label>
            <input id="st-from" type="date" className="ax-input w-[150px]" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="st-to" className="ax-label">To</label>
            <input id="st-to" type="date" className="ax-input w-[150px]" value={to} min={from} max={isoDay(0)} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="ax-seg w-[180px]" role="group" aria-label="Quick range">
            {QUICK.map((n) => (
              <button key={n} type="button" className="ax-seg-btn" aria-pressed={span === n && to === isoDay(0)} data-active={span === n && to === isoDay(0)} onClick={() => { setFrom(isoDay(n - 1)); setTo(isoDay(0)); }}>{n} days</button>
            ))}
          </div>
          <div className="min-w-[160px] flex-1 sm:flex-none">
            <label htmlFor="st-link" className="ax-label">Link</label>
            <select id="st-link" className="ax-input" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              <option value="">All links</option>
              {(links.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}{l.archived ? ' (archived)' : ''}</option>)}
            </select>
          </div>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSubId(subInput.trim()); }}>
            <div>
              <label htmlFor="st-sub" className="ax-label">Sub-ID</label>
              <input id="st-sub" className="ax-input w-[140px]" placeholder="any" maxLength={64} value={subInput} onChange={(e) => setSubInput(e.target.value)} />
            </div>
            <button type="submit" className="ax-btn-ghost">Apply</button>
          </form>
        </div>
        {!validRange && <p className="text-[11px] text-down mt-2">The start date must be before the end date.</p>}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <div className="ax-seg w-[380px] max-w-full" role="tablist" aria-label="Statistics by">
          {TABS.map(([v, l]) => (
            <button key={v} role="tab" aria-selected={view === v} data-active={view === v} className="ax-seg-btn" onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <button className="ax-btn-ghost ax-btn-sm ml-auto" onClick={exportCsv}
          disabled={view === 'daily' ? !days.length : view === 'traders' ? !traderRows.length : view === 'links' ? !byLinks.data?.length : !byCountries.data?.length}>Export CSV</button>
      </div>

      {view === 'links' && (
        <Panel pad={false} className="overflow-hidden">
          <TableWrap>
            <table className="w-full">
              <thead><tr>
                <th className="ax-th">ID</th><th className="ax-th">Comment</th><th className="ax-th">Program</th><th className="ax-th text-right">Clicks</th><th className="ax-th text-right">Registrations</th>
                <th className="ax-th text-right">Conv.</th><th className="ax-th text-right">FTD</th><th className="ax-th text-right">FTD sum</th><th className="ax-th text-right">Deposit sum</th><th className="ax-th text-right">Commission</th>
              </tr></thead>
              <tbody>
                {byLinks.isLoading && <LoadingRow cols={10} />}
                {byLinks.isError && <EmptyRow cols={10} text={apiError(byLinks.error)} />}
                {(byLinks.data ?? []).map((l) => (
                  <tr key={l.id} className="ax-row">
                    <td className="ax-td font-mono">#{l.num}</td><td className="ax-td">{l.name}</td><td className="ax-td">{MODEL_LABEL[l.model] ?? l.model}</td>
                    <td className="ax-td text-right ax-num">{l.clicks}</td><td className="ax-td text-right ax-num">{l.registrations}</td>
                    <td className="ax-td text-right ax-num text-mute">{pct(l.registrations, l.clicks)}</td><td className="ax-td text-right ax-num">{l.ftd}</td>
                    <td className="ax-td text-right ax-num">{fmtMoney(l.ftdSum)}</td><td className="ax-td text-right ax-num">{fmtMoney(l.depositSum)}</td>
                    <td className={clsx('ax-td text-right ax-num', l.commission < 0 && 'text-down')}>{fmtMoney(l.commission)}</td>
                  </tr>
                ))}
                {byLinks.data && !byLinks.data.length && <EmptyRow cols={10} text="No links yet." />}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      )}
      {view === 'countries' && (
        <Panel pad={false} className="overflow-hidden">
          <TableWrap>
            <table className="w-full">
              <thead><tr>
                <th className="ax-th">Country</th><th className="ax-th text-right">Clicks</th><th className="ax-th text-right">Registrations</th><th className="ax-th text-right">Conv.</th><th className="ax-th text-right">FTD</th><th className="ax-th text-right">FTD sum</th>
              </tr></thead>
              <tbody>
                {byCountries.isLoading && <LoadingRow cols={6} />}
                {byCountries.isError && <EmptyRow cols={6} text={apiError(byCountries.error)} />}
                {(byCountries.data ?? []).map((c) => (
                  <tr key={c.country ?? '??'} className="ax-row">
                    <td className="ax-td">{countryName(c.country)}</td><td className="ax-td text-right ax-num">{c.clicks}</td><td className="ax-td text-right ax-num">{c.registrations}</td>
                    <td className="ax-td text-right ax-num text-mute">{pct(c.registrations, c.clicks)}</td><td className="ax-td text-right ax-num">{c.ftd}</td><td className="ax-td text-right ax-num">{fmtMoney(c.ftdSum)}</td>
                  </tr>
                ))}
                {byCountries.data && !byCountries.data.length && <EmptyRow cols={6} text="No data for this period." />}
              </tbody>
            </table>
          </TableWrap>
          <p className="px-4 py-3 text-[11px] text-mute">Clicks use the visitor's country when the network edge provides it; registrations use the trader's country.</p>
        </Panel>
      )}
      {view === 'links' || view === 'countries' ? null : view === 'daily' ? (
        <Panel pad={false} className="overflow-hidden">
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="ax-th">Date</th><th className="ax-th text-right">Clicks</th><th className="ax-th text-right">Registrations</th><th className="ax-th text-right">Conv.</th>
                  <th className="ax-th text-right">First dep.</th><th className="ax-th text-right">First dep. sum</th><th className="ax-th text-right">Deposits</th><th className="ax-th text-right">Deposit sum</th><th className="ax-th text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {stats.isLoading && <LoadingRow cols={9} />}
                {stats.isError && <EmptyRow cols={9} text={apiError(stats.error)} />}
                {[...days].reverse().map((d) => (
                  <tr key={d.day} className="ax-row">
                    <td className="ax-td ax-num">{d.day}</td>
                    <td className="ax-td text-right ax-num">{d.clicks}</td>
                    <td className="ax-td text-right ax-num">{d.registrations}</td>
                    <td className="ax-td text-right ax-num text-mute">{pct(d.registrations, d.clicks)}</td>
                    <td className="ax-td text-right ax-num">{d.ftd}</td>
                    <td className="ax-td text-right ax-num">{fmtMoney(d.ftdSum)}</td>
                    <td className="ax-td text-right ax-num">{d.deposits}</td>
                    <td className="ax-td text-right ax-num">{fmtMoney(d.depositSum)}</td>
                    <td className={clsx('ax-td text-right ax-num', d.commission < 0 && 'text-down')}>{fmtMoney(d.commission)}</td>
                  </tr>
                ))}
                {stats.data && !days.length && <EmptyRow cols={9} text="No data for this period." />}
              </tbody>
              {days.length > 0 && (
                <tfoot>
                  <tr className="bg-base-850 font-semibold">
                    <td className="ax-td">Total</td>
                    <td className="ax-td text-right ax-num">{totals.clicks}</td>
                    <td className="ax-td text-right ax-num">{totals.registrations}</td>
                    <td className="ax-td text-right ax-num text-mute">{pct(totals.registrations, totals.clicks)}</td>
                    <td className="ax-td text-right ax-num">{totals.ftd}</td>
                    <td className="ax-td text-right ax-num">{fmtMoney(totals.ftdSum)}</td>
                    <td className="ax-td text-right ax-num">{totals.deposits}</td>
                    <td className="ax-td text-right ax-num">{fmtMoney(totals.depositSum)}</td>
                    <td className={clsx('ax-td text-right ax-num', totals.commission < 0 && 'text-down')}>{fmtMoney(totals.commission)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </TableWrap>
        </Panel>
      ) : (
        <Panel pad={false} className="overflow-hidden">
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="ax-th">Trader</th><th className="ax-th">Model</th><th className="ax-th text-right">Level</th><th className="ax-th text-right">Share</th><th className="ax-th">Link</th><th className="ax-th">Sub-ID</th>
                  <th className="ax-th">Registered</th><th className="ax-th">First deposit</th><th className="ax-th text-right">Deposits</th><th className="ax-th">Active</th><th className="ax-th">Status</th><th className="ax-th text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {traders.isLoading && <LoadingRow cols={12} />}
                {traders.isError && <EmptyRow cols={12} text={apiError(traders.error)} />}
                {traderRows.map((t) => (
                  <tr key={t.id} className="ax-row">
                    <td className="ax-td font-mono">{t.trader}</td>
                    <td className="ax-td">{MODEL_LABEL[t.model] ?? t.model}</td>
                    <td className="ax-td text-right ax-num">{t.level}</td>
                    <td className="ax-td text-right ax-num">{t.sharePct}%</td>
                    <td className="ax-td">{t.link}</td>
                    <td className="ax-td font-mono">{t.subId ?? '—'}</td>
                    <td className="ax-td ax-num">{fmtDate(t.registeredAt)}</td>
                    <td className="ax-td ax-num">{t.ftdAt ? `${fmtDate(t.ftdAt)} · ${fmtMoney(t.ftdAmount)}` : '—'}</td>
                    <td className="ax-td text-right ax-num">{fmtMoney(t.depositTotal)}</td>
                    <td className="ax-td">{t.active ? <span className="text-up">Yes</span> : <span className="text-mute">No</span>}</td>
                    <td className="ax-td"><StatusTag status={t.status} />{t.status === 'SUSPICIOUS' && <span className="ml-1.5 text-[10px] text-warn">Commission held for review</span>}</td>
                    <td className={clsx('ax-td text-right ax-num', t.commission < 0 && 'text-down')}>{fmtMoney(t.commission)}</td>
                  </tr>
                ))}
                {traders.data && !traderRows.length && <EmptyRow cols={12} text={linkId || subId ? 'No traders match these filters.' : 'No traders yet.'} />}
              </tbody>
            </table>
          </TableWrap>
          <p className="px-4 py-3 text-[11px] text-mute">The trader list shows all time (latest 200) and follows the link and sub-ID filters; the date range applies to the daily table.</p>
        </Panel>
      )}
    </Page>
  );
}
