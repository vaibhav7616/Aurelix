import { Link } from 'react-router-dom';
import { OpenTradesTable } from '../../components/trading/TradesPanel';

export function PositionsPage() {
  return (
    <div className="max-w-[1240px] mx-auto p-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Running trades</h1>
        <span className="text-[11px] text-mute">Fixed-time trades · settled server-side at expiry</span>
        <Link to="/trading" className="ax-btn-primary ax-btn-sm ml-auto">New trade →</Link>
      </div>
      <div className="ax-panel mt-3 overflow-hidden"><OpenTradesTable /></div>
    </div>
  );
}
