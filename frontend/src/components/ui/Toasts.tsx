import { useUI } from '../../stores/uiStore';
import { clsx } from 'clsx';

export function Toasts() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-[330px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            'w-full text-left pl-3 pr-3 py-2.5 rounded-md border text-xs shadow-pop bg-base-900/95 backdrop-blur transition hover:brightness-125 flex gap-2.5 items-start',
            t.kind === 'ok' && 'border-up/30',
            t.kind === 'err' && 'border-down/40',
            t.kind === 'info' && 'border-line'
          )}
        >
          <span className={clsx('mt-1 w-1.5 h-1.5 rounded-full shrink-0', t.kind === 'ok' && 'bg-up', t.kind === 'err' && 'bg-down', t.kind === 'info' && 'bg-accent-500')} />
          <span className="text-ink1 leading-relaxed">{t.text}</span>
        </button>
      ))}
    </div>
  );
}
