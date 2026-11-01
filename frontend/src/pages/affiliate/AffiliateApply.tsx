import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, apiError } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { useUI } from '../../stores/uiStore';
import { AFF, Page, Panel, StatusTag, fmtDate, usePrograms, WEEKDAYS, type Affiliate } from './shared';

const COUNTRIES: Array<[string, string]> = [
  ['IN', 'India'], ['BR', 'Brazil'], ['ID', 'Indonesia'], ['NG', 'Nigeria'], ['PK', 'Pakistan'], ['BD', 'Bangladesh'],
  ['VN', 'Vietnam'], ['TR', 'Türkiye'], ['AE', 'United Arab Emirates'], ['EG', 'Egypt'], ['PH', 'Philippines'],
  ['TH', 'Thailand'], ['MY', 'Malaysia'], ['MX', 'Mexico'], ['CO', 'Colombia'], ['KE', 'Kenya'], ['ZA', 'South Africa'],
  ['AR', 'Argentina'], ['CL', 'Chile'], ['PE', 'Peru'], ['GH', 'Ghana'], ['MA', 'Morocco'], ['SA', 'Saudi Arabia'],
  ['LK', 'Sri Lanka'], ['NP', 'Nepal'], ['UA', 'Ukraine'], ['KZ', 'Kazakhstan'], ['UZ', 'Uzbekistan'], ['PL', 'Poland'],
  ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['PT', 'Portugal'], ['GB', 'United Kingdom'],
];

function readSubRef(): string | undefined {
  try { return localStorage.getItem('ax_subref') || undefined; } catch { return undefined; }
}

/** Shown on every affiliate page while the signed-in user has not applied yet. */
export function AffiliateApply() {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const { data: p } = usePrograms();
  const [country, setCountry] = useState('IN');
  const [other, setOther] = useState('');
  const [traffic, setTraffic] = useState('');
  const [agree, setAgree] = useState(false);
  const subRef = readSubRef();

  const code = (country === 'OTHER' ? other : country).trim().toUpperCase();
  const codeOk = /^[A-Z]{2}$/.test(code);
  const trafficOk = traffic.trim().length >= 10 && traffic.trim().length <= 2000;

  const apply = useMutation({
    mutationFn: () => post<{ id: string; status: string }>(`${AFF}/apply`, {
      country: code, trafficSources: traffic.trim(), acceptTerms: true, ...(subRef && /^[A-Za-z0-9]{1,16}$/.test(subRef) ? { subRef } : {}),
    }),
    onSuccess: (r) => {
      try { localStorage.removeItem('ax_subref'); } catch { /* ignore */ }
      push('ok', r.status === 'APPROVED' ? 'Welcome to the Aurelix Affiliate Center — your partner tools are open' : 'Application sent — we will review it shortly');
      qc.invalidateQueries({ queryKey: ['aff'] });
    },
    onError: (e) => push('err', apiError(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!codeOk) return push('err', 'Choose your country or enter a 2-letter country code');
    if (!trafficOk) return push('err', 'Describe your traffic sources (10–2000 characters)');
    if (!agree) return push('err', 'Please accept the affiliate terms and the marketing rules');
    apply.mutate();
  };

  const top = p?.levels[p.levels.length - 1];
  const first = p?.levels[0];

  return (
    <Page title="Become an Aurelix partner" lead="Refer traders to Aurelix and earn commission on their activity. Fill in this short form once — your partner tools open straight away.">
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <Panel title="Application">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="aff-country" className="ax-label">Country of residence</label>
                <select id="aff-country" className="ax-input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
                  <option value="OTHER">Other (type code)</option>
                </select>
              </div>
              {country === 'OTHER' && (
                <div>
                  <label htmlFor="aff-country-other" className="ax-label">2-letter country code</label>
                  <input id="aff-country-other" className="ax-input uppercase" maxLength={2} placeholder="e.g. FR" value={other} onChange={(e) => setOther(e.target.value.replace(/[^A-Za-z]/g, ''))} />
                </div>
              )}
            </div>
            <div>
              <label htmlFor="aff-traffic" className="ax-label">Traffic sources</label>
              <textarea
                id="aff-traffic" rows={6} maxLength={2000} value={traffic} onChange={(e) => setTraffic(e.target.value)}
                className="ax-input h-auto py-2 leading-relaxed"
                placeholder="Describe your channels: websites, social profiles, video channels, communities — include links and approximate audience size."
              />
              <div className="text-[11px] text-mute mt-1 ax-num">{traffic.trim().length}/2000 · at least 10 characters</div>
            </div>
            <label className="flex items-start gap-2 text-xs text-fog cursor-pointer">
              <input type="checkbox" className="ax-check mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
              <span>I agree to the affiliate terms and the marketing rules</span>
            </label>
            {subRef && <p className="text-[11px] text-mute">You were invited by partner code <span className="font-mono text-fog">{subRef}</span>.</p>}
            <button type="submit" className="ax-btn-primary" disabled={apply.isPending}>{apply.isPending ? 'Opening…' : 'Become a partner'}</button>
          </form>
        </Panel>

        <Panel title="What partners get">
          {!p ? <p className="text-xs text-mute">Loading programme details…</p> : (
            <ul className="space-y-2.5 text-xs text-fog leading-relaxed">
              {first && top && <li><span className="text-ink1 font-semibold">Turnover Share</span> from {first.turnoverPct}% up to {top.turnoverPct}% of your traders’ settled volume, depending on your level.</li>}
              {p.revshareAvailable && first && top && <li><span className="text-ink1 font-semibold">Revenue Share</span> from {first.revsharePct}% up to {top.revsharePct}% of the platform’s net result from your traders.</li>}
              {p.cpa.available && <li><span className="text-ink1 font-semibold">CPA</span> — a one-time payment per qualified new trader.</li>}
              {first && top && <li><span className="text-ink1 font-semibold">Sub-affiliate</span> earnings from {first.subPct}% up to {top.subPct}% when partners you invite earn.</li>}
              <li><span className="text-ink1 font-semibold">{p.levels.length} levels</span> based on your traders’ monthly deposits.</li>
              <li>Weekly payouts every {WEEKDAYS[p.payoutWeekday]} (UTC), minimum {fmtMoney(p.minPayout)}.</li>
              <li>Links, promo codes, postbacks, statistics and support in one place.</li>
            </ul>
          )}
          <Link to="/affiliate/programs" className="inline-block mt-3 text-[12px] font-semibold text-accent-300 hover:underline">Programme details</Link>
        </Panel>
      </div>
    </Page>
  );
}

/** Pending / rejected / blocked application states. */
export function AffiliateStatusScreen({ affiliate }: { affiliate: Affiliate }) {
  const pending = affiliate.status === 'PENDING';
  return (
    <Page title={pending ? 'Application under review' : 'Partner account unavailable'}>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="ax-micro">Status</span>
          <StatusTag status={affiliate.status} />
          <span className="text-[11px] text-mute">Applied {fmtDate(affiliate.createdAt)}</span>
        </div>
        {pending ? (
          <p className="text-xs text-fog leading-relaxed max-w-[640px]">
            Thanks for applying. Our partner team is reviewing your traffic sources. Partner tools unlock as soon as the application is approved.
            If you have questions or want to add details, open a ticket in Support.
          </p>
        ) : (
          <div className="text-xs text-fog leading-relaxed max-w-[640px] space-y-2">
            <p>{affiliate.status === 'REJECTED' ? 'Your application was not approved.' : 'Your partner account has been blocked.'}</p>
            {affiliate.note && <p className="ax-raised p-3 text-ink1 whitespace-pre-wrap">{affiliate.note}</p>}
            <p>If you believe this is a mistake, contact the partner team through Support.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <Link to="/affiliate/support" className="ax-btn-primary">Open Support</Link>
          <Link to="/affiliate/programs" className="ax-btn-ghost">Programme details</Link>
        </div>
      </Panel>
    </Page>
  );
}
