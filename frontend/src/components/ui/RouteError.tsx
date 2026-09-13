import { Link, useRouteError } from 'react-router-dom';

/** Route-level crash screen — a render failure never whitescreens the app. */
export function RouteError() {
  const err = useRouteError() as { message?: string } | null;
  return (
    <div className="min-h-screen flex items-center justify-center bg-base-950 p-4">
      <div className="ax-panel max-w-[420px] w-full p-6 text-center">
        <img src="/logo.svg" alt="" width={36} height={36} className="mx-auto" />
        <h1 className="text-[15px] font-bold mt-3">Something went wrong</h1>
        <p className="text-xs text-mute mt-1.5 leading-relaxed">
          This view hit an unexpected error{err?.message ? `: ${String(err.message).slice(0, 140)}` : '.'} Your
          session and positions are unaffected.
        </p>
        <div className="flex gap-2 justify-center mt-4">
          <button onClick={() => window.location.reload()} className="ax-btn-primary !h-9 !px-4">Reload view</button>
          <Link to="/trading" className="ax-btn-ghost !h-9 !px-4 inline-flex items-center">Back to terminal</Link>
        </div>
      </div>
    </div>
  );
}
