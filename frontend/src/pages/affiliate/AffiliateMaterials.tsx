import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton, Page, Panel, linkUrl, useLinks } from './shared';

const BANNERS: Array<{ file: string; w: number; h: number; label: string }> = [
  { file: 'banner-728x90.svg', w: 728, h: 90, label: 'Leaderboard' },
  { file: 'banner-300x250.svg', w: 300, h: 250, label: 'Medium rectangle' },
  { file: 'banner-160x600.svg', w: 160, h: 600, label: 'Wide skyscraper' },
  { file: 'banner-1080x1080.svg', w: 1080, h: 1080, label: 'Social square' },
];

const RISK = 'Trading involves risk. You can lose the money you invest.';

const TEMPLATES: Array<{ title: string; body: (url: string) => string }> = [
  {
    title: 'Short post',
    body: (url) => `I use Aurelix to follow currency and crypto price moves on a clean, fast chart. You can open a free demo account and practise before deciding anything.\n\n${url}\n\n${RISK}`,
  },
  {
    title: 'Video description',
    body: (url) => `The platform shown in this video is Aurelix. If you want to look at the same charts, you can register here: ${url}\n\nStart on the demo account to learn how it works, and only use money you can afford to lose. This channel is independent and is not run by Aurelix.\n\n${RISK}`,
  },
  {
    title: 'Blog / review footer',
    body: (url) => `Want to explore the tools mentioned in this article? Aurelix offers a demo account, a range of markets and educational material for beginners. Read the platform’s terms and decide for yourself: ${url}\n\nThis site is an independent partner and may receive a commission if you register.\n\n${RISK}`,
  },
];

const RULES = [
  'Always show a risk warning next to your promotion.',
  'Never promise profits or describe trading as easy or guaranteed.',
  'Never present yourself as Aurelix staff or an official representative.',
  'No spam, mass messaging or unsolicited personal messages.',
  'No paid search ads on the Aurelix brand name or its misspellings.',
  'No sites, pages or profiles that copy or imitate the official website.',
  'Make clear that your site or channel is independent and unofficial.',
];

export function AffiliateMaterials() {
  const links = useLinks();
  const active = (links.data ?? []).filter((l) => !l.archived);
  const [linkId, setLinkId] = useState('');
  const chosen = active.find((l) => l.id === linkId) ?? active[0];
  const url = chosen ? linkUrl(chosen) : '';
  const origin = window.location.origin;

  return (
    <Page title="Promo Materials" lead="Banners and text templates ready to use with your tracking links. Pick a link and every snippet below will use it.">
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 sm:flex-none">
            <label htmlFor="pm-link" className="ax-label">Tracking link for snippets</label>
            <select id="pm-link" className="ax-input" value={chosen?.id ?? ''} onChange={(e) => setLinkId(e.target.value)} disabled={!active.length}>
              {!active.length && <option value="">No links yet</option>}
              {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {url ? <span className="font-mono text-[11px] text-fog break-all">{url}</span> : (
            <span className="text-xs text-mute">{links.isLoading ? 'Loading links…' : <>Create a link first in <Link to="/affiliate/links" className="text-accent-300 hover:underline">Links</Link>.</>}</span>
          )}
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        {BANNERS.map((b) => {
          const src = `${origin}/affiliate/banners/${b.file}`;
          const snippet = `<a href="${url || `${window.location.origin}/?lid=YOUR_LINK_ID`}" target="_blank" rel="noopener sponsored"><img src="${src}" width="${b.w}" height="${b.h}" alt="Aurelix — trading involves risk"></a>`;
          return (
            <Panel key={b.file} title={`${b.label} · ${b.w}×${b.h}`} right={<a href={`/affiliate/banners/${b.file}`} download={b.file} className="ax-btn-ghost ax-btn-sm">Download</a>}>
              <div className="ax-well p-3 flex items-center justify-center h-[220px] overflow-hidden">
                <img src={`/affiliate/banners/${b.file}`} alt={`${b.label} banner, ${b.w} by ${b.h}`} className="max-w-full max-h-full object-contain" loading="lazy" />
              </div>
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="ax-label mb-0">HTML embed</span>
                  <CopyButton text={snippet} what="embed code" className="ml-auto" />
                </div>
                <textarea readOnly value={snippet} rows={3} aria-label={`HTML embed code for ${b.w}×${b.h} banner`} className="ax-input h-auto py-2 font-mono text-[11px] leading-relaxed resize-none" onFocus={(e) => e.currentTarget.select()} />
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {TEMPLATES.map((t) => {
            const text = t.body(url || `${window.location.origin}/?lid=YOUR_LINK_ID`);
            return (
              <Panel key={t.title} title={t.title} right={<CopyButton text={text} what="template" />}>
                <p className="text-xs text-fog leading-relaxed whitespace-pre-wrap break-words">{text}</p>
              </Panel>
            );
          })}
        </div>
        <Panel title="Marketing rules">
          <ul className="space-y-2 text-xs text-fog leading-relaxed list-disc pl-4">
            {RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="text-[11px] text-mute mt-3">Breaking these rules can lead to commission being voided and the partner account being blocked.</p>
        </Panel>
      </div>
    </Page>
  );
}
