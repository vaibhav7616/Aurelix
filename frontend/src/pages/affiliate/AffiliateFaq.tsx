import { Link } from 'react-router-dom';
import { fmtMoney } from '../../lib/format';
import { Page, Panel, WEEKDAYS, usePrograms } from './shared';

export function AffiliateFaq() {
  const { data: p } = usePrograms();
  const day = WEEKDAYS[p?.payoutWeekday ?? 4];
  const top = p?.levels[p.levels.length - 1];
  const first = p?.levels[0];
  const items: Array<[string, React.ReactNode]> = [
    ['How do I start earning?', <>Open <Link to="/affiliate/links" className="text-accent-300 hover:underline">Links</Link>, copy one of your personal links and place it where your audience is. Every trader who registers through it is attributed to you for good.</>],
    ['What is the difference between Revenue Share and Turnover Share?', <>Revenue Share pays a percentage of the platform's net result on your traders' trades ({first?.revsharePct ?? 50}%–{top?.revsharePct ?? 80}% by level); losses on your traders are deducted. Turnover Share pays a percentage of your traders' trade volume ({first?.turnoverPct ?? 2}%–{top?.turnoverPct ?? 5}% by level). The model is fixed for each trader at registration. Details are in <Link to="/affiliate/programs" className="text-accent-300 hover:underline">Affiliate Programs</Link>.</>],
    ['How is my level calculated?', <>Your level for the month is set by the number of deposits your traders made in the previous month. The dashboard shows the progress towards the next level.</>],
    ['When are payouts made?', <>Automatically every {day} for the previous week, to the payout details you saved on the <Link to="/affiliate/withdrawal" className="text-accent-300 hover:underline">Withdrawal</Link> page. The minimum payout is {fmtMoney(p?.minPayout ?? 10)}.</>],
    ['Why is my first withdrawal not available yet?', <>Before the first payout you need {p?.minActiveTraders ?? 10} active traders, a verified partner account and saved payout details. The checklist on the Withdrawal page shows what is still missing.</>],
    ['Why is part of my commission on hold?', <>Commission from traders flagged by our fraud checks (same IP or device as you, shared payment details, multiple accounts) is held until the partner team reviews it. Self-referral is not allowed.</>],
    ['Can I use my own tracker?', <>Yes. Add <span className="font-mono">click_id</span> to your links and set up a <Link to="/affiliate/postbacks" className="text-accent-300 hover:underline">postback</Link> — we will notify your tracker about registrations, deposits and withdrawals.</>],
    ['How do I earn from other partners?', <>Invite partners with your <Link to="/affiliate/sub-affiliate" className="text-accent-300 hover:underline">sub-affiliate</Link> link. You receive a percentage of their commission, depending on your level.</>],
    ['What advertising is not allowed?', <>Promising guaranteed profit, presenting trading as safe, using misleading claims, spam, brand-keyword bidding and traffic from countries where the programme is not available. Always include a risk warning.</>],
  ];
  return (
    <Page title="FAQ" lead="Answers to the questions partners ask most often.">
      <Panel pad={false}>
        <div className="divide-y divide-line">
          {items.map(([q, a]) => (
            <details key={q} className="group px-4 py-3">
              <summary className="cursor-pointer list-none flex items-center gap-2 text-[13px] font-semibold text-ink1">
                <span className="text-accent-300 transition-transform group-open:rotate-90" aria-hidden>›</span>{q}
              </summary>
              <div className="text-xs text-fog leading-relaxed mt-2 pl-4">{a}</div>
            </details>
          ))}
        </div>
      </Panel>
      <p className="text-[11px] text-mute">Still have a question? <Link to="/affiliate/support" className="text-accent-300 hover:underline">Contact partner support</Link>.</p>
    </Page>
  );
}
