import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useSettingsStore } from '../../stores/settingsStore';
import { soundService } from '../../lib/sound';
import { clsx } from 'clsx';

export function SettingsModal() {
  const {
    isOpen,
    setOpen,
    oneClickTrading,
    setOneClickTrading,
    soundMaster,
    setSoundMaster,
    soundClick,
    setSoundClick,
    soundWin,
    setSoundWin,
    soundLoss,
    setSoundLoss,
    showGrid,
    setShowGrid,
    autoScroll,
    setAutoScroll,
    serverLatency,
    setServerLatency,
  } = useSettingsStore();

  // Measure latency to the server every 4 seconds when modal is open
  const { data: pingData } = useQuery({
    queryKey: ['server-ping'],
    queryFn: async () => {
      const start = performance.now();
      const res = await get<{ serverTime: number; status: string }>('/api/v1/market/ping');
      const elapsed = Math.round(performance.now() - start);
      setServerLatency(elapsed);
      return { elapsed, ...res };
    },
    refetchInterval: 4000,
    enabled: isOpen,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in select-none">
      <div className="w-full max-w-md bg-[#161a25] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#131720]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-sm text-slate-300">
              ⚙️
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Trading Settings</h3>
              <p className="text-[11px] text-slate-400">Execution, sounds, and chart customization</p>
            </div>
          </div>

          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Section 1: 1-Click Fast Trading */}
          <div className="p-3.5 rounded-xl bg-base-900 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <span>⚡ 1-Click Fast Trading</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-extrabold px-1.5 py-0.2 rounded">
                    INSTANT
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Execute orders immediately without confirmation dialogs.
                </div>
              </div>

              <input
                type="checkbox"
                checked={oneClickTrading}
                onChange={(e) => {
                  soundService.playClick();
                  setOneClickTrading(e.target.checked);
                }}
                className="w-4 h-4 accent-[#00c076] cursor-pointer"
              />
            </div>
          </div>

          {/* Section 2: Sound Effects Preferences */}
          <div className="p-3.5 rounded-xl bg-base-900 border border-white/5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div>
                <div className="text-xs font-bold text-white">Audio & Sound FX</div>
                <div className="text-[10px] text-slate-400">Realistic mechanical trading audio feedback</div>
              </div>

              <input
                type="checkbox"
                checked={soundMaster}
                onChange={(e) => {
                  soundService.playClick();
                  setSoundMaster(e.target.checked);
                }}
                className="w-4 h-4 accent-[#00c076] cursor-pointer"
              />
            </div>

            {soundMaster && (
              <div className="space-y-2 pt-1 pl-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Button Click Sound</span>
                  <input
                    type="checkbox"
                    checked={soundClick}
                    onChange={(e) => {
                      setSoundClick(e.target.checked);
                      if (e.target.checked) soundService.playClick();
                    }}
                    className="accent-[#00c076] cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Win Victory Chime</span>
                  <input
                    type="checkbox"
                    checked={soundWin}
                    onChange={(e) => {
                      setSoundWin(e.target.checked);
                      if (e.target.checked) soundService.playTradeWon();
                    }}
                    className="accent-[#00c076] cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Loss Alert Tone</span>
                  <input
                    type="checkbox"
                    checked={soundLoss}
                    onChange={(e) => {
                      setSoundLoss(e.target.checked);
                      if (e.target.checked) soundService.playTradeLost();
                    }}
                    className="accent-[#00c076] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Chart Appearance */}
          <div className="p-3.5 rounded-xl bg-base-900 border border-white/5 space-y-2.5">
            <div className="text-xs font-bold text-white">Chart Appearance</div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Vertical & Horizontal Grid Lines</span>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => {
                  soundService.playClick();
                  setShowGrid(e.target.checked);
                }}
                className="accent-[#00c076] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Auto-Scroll to Latest Candle</span>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => {
                  soundService.playClick();
                  setAutoScroll(e.target.checked);
                }}
                className="accent-[#00c076] cursor-pointer"
              />
            </div>
          </div>

          {/* Section 4: Server Latency Calibration */}
          <div className="p-3.5 rounded-xl bg-base-900 border border-white/5 space-y-2">
            <div className="text-xs font-bold text-white">Server Network Calibration</div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Response Latency:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {serverLatency || pingData?.elapsed || 18} ms
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Server Connection:</span>
              <span className="text-slate-200">High-Speed OTC Feed</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#131720] flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-1.5 rounded-xl bg-[#00c076] hover:bg-[#00d684] text-slate-950 font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-md"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
