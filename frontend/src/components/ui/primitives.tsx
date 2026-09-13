import { ReactNode } from 'react';
import { clsx } from 'clsx';

export function Logo({ size = 26, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <img src="/logo.svg" alt="Aurelix" width={size} height={size} />
      {wordmark && (
        <span className="font-display font-bold text-[15px] tracking-tight text-ink1">
          Aurelix
        </span>
      )}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('ax-panel p-4', className)}>{children}</div>;
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-fog">{title}</h2>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' | 'accent' }) {
  return (
    <div className="ax-panel px-3.5 py-3">
      <div className="ax-micro">{label}</div>
      <div className={clsx('mt-1 text-[19px] font-bold ax-num leading-none', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'accent' && 'text-accent-300')}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-mute ax-num">{sub}</div>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-9 px-4">
      <div className="mx-auto w-9 h-9 rounded-md bg-white/[0.06] border border-line flex items-center justify-center">
        <span className="w-3.5 h-3.5 rounded-[3px] border border-mute/60" />
      </div>
      <div className="mt-2.5 text-[13px] font-semibold">{title}</div>
      {hint && <div className="text-xs text-mute mt-1 max-w-[280px] mx-auto leading-relaxed">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

export function TableSkeleton({ rows = 4, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-2.5 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, j) => <div key={j} className="skeleton h-6" />)}
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-3 rounded-md border border-down/30 bg-downdim/60 px-3 py-2.5 flex items-center gap-3">
      <span className="w-1.5 h-1.5 rounded-full bg-down shrink-0" />
      <span className="text-xs text-ink1 flex-1">{message}</span>
      {onRetry && <button onClick={onRetry} className="ax-btn-ghost ax-btn-sm">Retry</button>}
    </div>
  );
}

export function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-md border border-down/30 bg-downdim/60 px-3 py-2 text-xs text-down">{message}</div>;
}
