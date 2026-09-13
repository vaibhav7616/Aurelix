import React from 'react';
import { clsx } from 'clsx';

export function Logo({ className, size }: { className?: string; size?: number }) {
  const s = size ?? 26;
  return (
    <div className={clsx('flex items-center gap-2.5 select-none', className)}>
      <div
        className="rounded-lg bg-[#2C6B4D] flex items-center justify-center shadow-md shrink-0 border border-[#3e8b66]/40"
        style={{ width: `${s}px`, height: `${s}px` }}
      >
        <svg viewBox="0 0 48 48" width={s * 0.72} height={s * 0.72} fill="none">
          <rect x="9" y="25" width="7" height="13" rx="1.5" fill="#F6F1E4" opacity="0.6" />
          <rect x="20" y="18" width="7" height="20" rx="1.5" fill="#F6F1E4" opacity="0.85" />
          <rect x="31" y="10" width="7" height="28" rx="1.5" fill="#F6F1E4" />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[13.5px] font-black text-white tracking-wider">AURELIX</span>
        <span className="text-[8px] font-bold text-[#00c076] tracking-widest uppercase">TERMINAL</span>
      </div>
    </div>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-[#ea4d4d]/15 border border-[#ea4d4d]/30 text-[#ea4d4d] px-3 py-2 text-xs font-medium">
      {message}
    </div>
  );
}

export function Empty({
  title = 'No data available',
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1.5 select-none">
      <span className="text-xl">📭</span>
      <span className="font-medium text-slate-300">{title}</span>
      {hint && <span className="text-slate-500 text-[11px]">{hint}</span>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-[#161a25] border border-white/10 rounded-lg p-4 shadow-md', className)}>
      {children}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-2 p-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 bg-white/[0.04] rounded w-full flex gap-2">
          {cols &&
            Array.from({ length: cols }).map((_, j) => (
              <div key={j} className="h-full bg-white/[0.03] rounded flex-1" />
            ))}
        </div>
      ))}
    </div>
  );
}
