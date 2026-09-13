import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type Time, type MouseEventParams,
  type BarPrice, type DeepPartial, type PriceFormatCustom,
} from 'lightweight-charts';
import { get } from '../../lib/api';
import { useTerminal, type Tick } from '../../stores/terminalStore';
import { fmtPrice } from '../../lib/format';
import { normalizeCandles } from '../../lib/candles';
import { fmtHMS, secondsLeft, previewOutcome, type OptionTrade } from '../../lib/options';
import { getAssetMeta } from '../../lib/assetMeta';
import { connectSocket, subscribeMarket } from '../../services/socket';
import { clsx } from 'clsx';

interface Candle { open: number; high: number; low: number; close: number; volume: number; openTime: number; closeTime?: number; symbol?: string; timeframe?: string }
type Tool = 'select' | 'trend' | 'hline' | 'support' | 'resistance';
type DrawType = 'trend' | 'hline' | 'support' | 'resistance';
interface Drawing { id: string; type: DrawType; t1: number; p1: number; t2?: number; p2?: number }

// Quotex official binary candle colors (matched to platform screenshot)
const UP = '#0faf59';
const DOWN = '#ea4d4d';
const DN_FILL = '#ea4d4d';
const ACC = '#0faf59';
const GRID = 'rgba(255, 255, 255, 0.04)';
const TEXT = '#94a3b8';

export function tfToMs(tf: string): number {
  switch (tf) {
    case '5s': return 5_000;
    case '10s': return 10_000;
    case '15s': return 15_000;
    case '30s': return 30_000;
    case '1m': return 60_000;
    case '2m': return 120_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '30m': return 1_800_000;
    case '1h': return 3_600_000;
    case '4h': return 14_400_000;
    case '1d': return 86_400_000;
    default: return 60_000;
  }
}

function sma(values: number[], period: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    return s / period;
  });
}
function ema(values: number[], period: number): Array<number | null> {
  const k = 2 / (period + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i < period - 1) { out.push(null); return; }
    if (prev === null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else prev = v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}
function bollinger(values: number[], period = 20, mult = 2): Array<{ mid: number; up: number; lo: number } | null> {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const w = values.slice(i - period + 1, i + 1);
    const mid = w.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
    return { mid, up: mid + mult * sd, lo: mid - mult * sd };
  });
}
function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0; let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
function macd(values: number[], fast = 12, slow = 26, signal = 9): Array<{ m: number; s: number; h: number } | null> {
  const ef = ema(values, fast); const es = ema(values, slow);
  const line = values.map((_, i) => (ef[i] !== null && es[i] !== null ? (ef[i] as number) - (es[i] as number) : null));
  const validIdx: number[] = [];
  const validVals: number[] = [];
  line.forEach((v, i) => { if (v !== null) { validIdx.push(i); validVals.push(v); } });
  const sig = ema(validVals, signal);
  const out: Array<{ m: number; s: number; h: number } | null> = new Array(values.length).fill(null);
  validIdx.forEach((vi, k) => {
    if (sig[k] !== null && line[vi] !== null) {
      const m = line[vi] as number; const s = sig[k] as number;
      out[vi] = { m, s, h: m - s };
    }
  });
  return out;
}

interface IndState { vol: boolean; sma20: boolean; sma50: boolean; ema20: boolean; bb: boolean; osc: 'none' | 'rsi' | 'macd' }
const DEFAULT_INDS: IndState = { vol: false, sma20: false, sma50: false, ema20: false, bb: false, osc: 'none' };
function loadInds(): IndState {
  try {
    const parsed = JSON.parse(localStorage.getItem('ax_inds') ?? '{}') as Partial<IndState>;
    // Keep volume disabled by default to maintain clean Quotex layout
    return { ...DEFAULT_INDS, ...parsed, vol: false };
  } catch {
    return DEFAULT_INDS;
  }
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PriceChart() {
  const symbol = useTerminal((s) => s.symbol);
  const timeframe = useTerminal((s) => s.timeframe);
  const chartType = useTerminal((s) => s.chartType);
  const setTimeframe = useTerminal((s) => s.setTimeframe);
  const setChartType = useTerminal((s) => s.setChartType);

  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<'Candlestick' | 'Line' | 'Area'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indRefs = useRef<Array<{ s: ISeriesApi<'Line'>; kind: string }>>([]);
  const oscRefs = useRef<Array<ISeriesApi<'Line' | 'Histogram'>>>([]);
  const crossRef = useRef<MouseEventParams | null>(null);
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const [tool, setTool] = useState<Tool>('select');
  const [pending, setPending] = useState<{ t: number; p: number } | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>(() => {
    try { return JSON.parse(localStorage.getItem(`ax_draw_${symbol}_${timeframe}`) ?? '[]'); } catch { return []; }
  });
  const [legend, setLegend] = useState<Candle | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [inds, setInds] = useState<IndState>(loadInds);
  const [showIndMenu, setShowIndMenu] = useState(false);
  const [showPairInfo, setShowPairInfo] = useState(false);

  // Live real-time candle state
  const liveCandlesRef = useRef<Candle[]>([]);
  const activeCandleRef = useRef<Candle | null>(null);
  const targetPriceRef = useRef<number | null>(null);
  const currentPriceRef = useRef<number | null>(null);
  const velocityRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const lastTickDirRef = useRef<'up' | 'down' | null>(null);
  const lastTickTimeRef = useRef<number>(0);

  // Direct DOM refs for 120Hz+ hardware-accelerated overlay motion (zero React re-renders)
  const hLineRef = useRef<SVGLineElement>(null);
  const vLineRef = useRef<SVGLineElement>(null);
  const glowDotRef = useRef<SVGGElement>(null);
  const glowDotWaveRef = useRef<SVGCircleElement>(null);
  const glowDotCoreRef = useRef<SVGCircleElement>(null);
  const countdownBadgeRef = useRef<HTMLDivElement>(null);
  const countdownTextRef = useRef<HTMLSpanElement>(null);
  const pricePillRef = useRef<HTMLDivElement>(null);
  const pricePillInnerRef = useRef<HTMLDivElement>(null);
  const pricePillTextRef = useRef<HTMLSpanElement>(null);
  const openPriceTextRef = useRef<HTMLSpanElement>(null);

  const [candleSecondsLeft, setCandleSecondsLeft] = useState<number>(60);
  const [utcClock, setUtcClock] = useState<string>('');

  // Running fixed-time trades on this symbol → drawn as entry line + start/expiry markers
  const { data: openTrades } = useQuery({
    queryKey: ['options', 'open'],
    queryFn: () => get<OptionTrade[]>('/api/v1/options/open'),
    refetchInterval: 2500,
  });
  const symTrades = useMemo(() => (openTrades ?? []).filter((t) => t.symbol === symbol), [openTrades, symbol]);
  const [clock, setClock] = useState(Date.now());

  // Subscribe to market socket for real-time live price flow
  useEffect(() => {
    connectSocket();
    subscribeMarket([symbol]);
  }, [symbol]);

  // Historical candles query (loaded ONCE per symbol/timeframe, real-time ticks take over)
  const { data, isLoading } = useQuery({
    queryKey: ['candles', symbol, timeframe],
    queryFn: () => get<{ candles: Candle[] }>('/api/v1/market/candles', { symbol, timeframe, limit: 240 }),
    refetchInterval: false,
    staleTime: Infinity,
  });

  const candles = useMemo(() => normalizeCandles(data?.candles ?? []), [data]);

  // Immediate reset when symbol or timeframe changes to prevent cross-asset state contamination
  useEffect(() => {
    liveCandlesRef.current = [];
    activeCandleRef.current = null;
    currentPriceRef.current = null;
    targetPriceRef.current = null;
    velocityRef.current = 0;
    setLegend(null);
  }, [symbol, timeframe]);

  // Sync loaded candles into liveCandlesRef
  useEffect(() => {
    if (candles.length) {
      if (candles[0].symbol && candles[0].symbol !== symbol) return;
      liveCandlesRef.current = candles.map((c) => ({ ...c }));
      const last = candles[candles.length - 1];
      activeCandleRef.current = { ...last };
      currentPriceRef.current = last.close;
      targetPriceRef.current = last.close;
      velocityRef.current = 0;
      setLegend(last);
      bump();
    }
  }, [candles, symbol, bump]);

  useEffect(() => {
    try { setDrawings(JSON.parse(localStorage.getItem(`ax_draw_${symbol}_${timeframe}`) ?? '[]')); } catch { setDrawings([]); }
    setPending(null);
    setTool('select');
  }, [symbol, timeframe]);
  useEffect(() => {
    localStorage.setItem(`ax_draw_${symbol}_${timeframe}`, JSON.stringify(drawings));
  }, [drawings, symbol, timeframe]);
  useEffect(() => { localStorage.setItem('ax_inds', JSON.stringify(inds)); }, [inds]);

  // Create lightweight-charts instance once
  useEffect(() => {
    if (!elRef.current) return;
    const chart = createChart(elRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#121620' },
        textColor: TEXT,
        fontSize: 10,
        fontFamily: '"JetBrains Mono", monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.2)', style: LineStyle.Dashed, labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(255,255,255,0.2)', style: LineStyle.Dashed, labelBackgroundColor: '#007aff' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: true,
        barSpacing: 28,
        minBarSpacing: 10,
        rightOffset: 12,
      },
      autoSize: true,
    });
    chartRef.current = chart;
    chart.subscribeCrosshairMove((p) => {
      crossRef.current = p;
      setHoverT((p.time as number) ?? null);
    });
    const onRange = () => bump();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => { chart.remove(); chartRef.current = null; mainRef.current = null; volRef.current = null; indRefs.current = []; oscRefs.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build or rebuild chart series when candles or chart options change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;
    for (const { s } of indRefs.current) { try { chart.removeSeries(s); } catch { /* noop */ } }
    for (const s of oscRefs.current) { try { chart.removeSeries(s as never); } catch { /* noop */ } }
    indRefs.current = []; oscRefs.current = [];
    if (volRef.current) { try { chart.removeSeries(volRef.current); } catch { /* noop */ } volRef.current = null; }
    if (mainRef.current) { try { chart.removeSeries(mainRef.current as never); } catch { /* noop */ } mainRef.current = null; }

    const times = candles.map((c) => (c.openTime / 1000) as Time);
    const hasOsc = inds.osc !== 'none';
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: hasOsc ? 0.32 : inds.vol ? 0.14 : 0.08 } });

    // Quotex-style sub-pip resolution with strictly bounded minMove
    const pip = /JPY/.test(symbol) ? 0.001 : /BTC|ETH/.test(symbol) ? 0.01 : 0.00001;
    const priceFormatCustom: DeepPartial<PriceFormatCustom> = {
      type: 'custom',
      minMove: pip,
      formatter: (p: BarPrice) => fmtPrice(Number(p)),
    };

    if (chartType === 'candles') {
      const s = chart.addCandlestickSeries({
        upColor: UP,
        downColor: DN_FILL,
        wickUpColor: UP,
        wickDownColor: DOWN,
        borderVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: priceFormatCustom as never,
      });
      s.setData(candles.map((c, i) => ({ time: times[i], open: c.open, high: c.high, low: c.low, close: c.close })));
      mainRef.current = s as never;
    } else if (chartType === 'line') {
      const s = chart.addLineSeries({
        color: '#007aff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: priceFormatCustom as never,
      });
      s.setData(candles.map((c, i) => ({ time: times[i], value: c.close })));
      mainRef.current = s as never;
    } else {
      const s = chart.addAreaSeries({
        lineColor: UP,
        topColor: 'rgba(15,175,89,0.22)',
        bottomColor: 'rgba(15,175,89,0.01)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: priceFormatCustom as never,
      });
      s.setData(candles.map((c, i) => ({ time: times[i], value: c.close })));
      mainRef.current = s as never;
    }

    if (inds.vol) {
      const v = chart.addHistogramSeries({
        priceScaleId: 'vol',
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.90, bottom: 0 } });
      v.setData(candles.map((c, i) => ({ time: times[i], value: c.volume, color: c.close >= c.open ? 'rgba(0,192,118,0.25)' : 'rgba(255,84,71,0.25)' })));
      volRef.current = v;
    }

    const closes = candles.map((c) => c.close);
    const addOverlay = (vals: Array<number | null>, color: string, kind: string, width = 1, style: LineStyle = LineStyle.Solid) => {
      const s = chart.addLineSeries({ color, lineWidth: width as never, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const pts: Array<{ time: Time; value: number }> = [];
      vals.forEach((v, i) => { if (v !== null) pts.push({ time: times[i], value: v }); });
      s.setData(pts);
      indRefs.current.push({ s, kind });
    };
    if (inds.sma20) addOverlay(sma(closes, 20), '#00c076', 'sma20');
    if (inds.sma50) addOverlay(sma(closes, 50), '#eab308', 'sma50');
    if (inds.ema20) addOverlay(ema(closes, 20), '#38bdf8', 'ema20');
    if (inds.bb) {
      const bb = bollinger(closes);
      addOverlay(bb.map((b) => (b ? b.up : null)), '#64748b', 'bbUp', 1, LineStyle.Dashed);
      addOverlay(bb.map((b) => (b ? b.mid : null)), '#64748b', 'bbMid', 1, LineStyle.Dotted);
      addOverlay(bb.map((b) => (b ? b.lo : null)), '#64748b', 'bbLo', 1, LineStyle.Dashed);
    }

    // Oscillator pane
    if (hasOsc) {
      chart.priceScale('osc').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.14 } });
      if (inds.osc === 'rsi') {
        const vals = rsi(closes);
        const mk = (level: number) => {
          const s = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'osc', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          s.setData(times.map((t) => ({ time: t, value: level })));
          oscRefs.current.push(s);
        };
        mk(70); mk(50); mk(30);
        const s = chart.addLineSeries({ color: '#eab308', lineWidth: 1, priceScaleId: 'osc', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        const pts: Array<{ time: Time; value: number }> = [];
        vals.forEach((v, i) => { if (v !== null) pts.push({ time: times[i], value: v }); });
        s.setData(pts);
        oscRefs.current.push(s);
      } else {
        const vals = macd(closes);
        const h = chart.addHistogramSeries({ priceScaleId: 'osc', priceLineVisible: false, lastValueVisible: false });
        const hPts: Array<{ time: Time; value: number; color: string }> = [];
        vals.forEach((v, i) => { if (v !== null) hPts.push({ time: times[i], value: v.h, color: v.h >= 0 ? 'rgba(0,192,118,0.55)' : 'rgba(255,84,71,0.55)' }); });
        h.setData(hPts);
        const m = chart.addLineSeries({ color: '#00c076', lineWidth: 1, priceScaleId: 'osc', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        m.setData(vals.map((v, i) => (v ? { time: times[i], value: v.m } : null)).filter(Boolean) as Array<{ time: Time; value: number }>);
        const g = chart.addLineSeries({ color: '#ff5447', lineWidth: 1, priceScaleId: 'osc', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        g.setData(vals.map((v, i) => (v ? { time: times[i], value: v.s } : null)).filter(Boolean) as Array<{ time: Time; value: number }>);
        oscRefs.current.push(h as never, m, g);
      }
    }

    // Apply Quotex candle width and visible logical range (~22 candles visible)
    chart.timeScale().applyOptions({
      barSpacing: 26,
      minBarSpacing: 8,
      rightOffset: 12,
    });
    const totalBars = candles.length;
    if (totalBars > 0) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, totalBars - 22),
        to: totalBars + 8,
      });
    }
    chart.timeScale().scrollToRealTime();
    setLegend(candles[candles.length - 1]);
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, symbol, chartType, inds.vol, inds.sma20, inds.sma50, inds.ema20, inds.bb, inds.osc]);

  // Subscribe directly to terminal store ticks without causing PriceChart component re-renders
  useEffect(() => {
    // Read initial tick from store if available
    const initialTick = useTerminal.getState().ticks[symbol];
    if (initialTick?.mid && Number.isFinite(initialTick.mid) && initialTick.mid > 0) {
      targetPriceRef.current = initialTick.mid;
      if (currentPriceRef.current === null) currentPriceRef.current = initialTick.mid;
    }

    const unsub = useTerminal.subscribe((state) => {
      const t = state.ticks[symbol];
      if (t?.mid && Number.isFinite(t.mid) && t.mid > 0) {
        const prev = targetPriceRef.current;
        targetPriceRef.current = t.mid;
        if (prev !== null && prev !== t.mid) {
          lastTickDirRef.current = t.mid >= prev ? 'up' : 'down';
          lastTickTimeRef.current = performance.now();
        }
        if (
          currentPriceRef.current === null ||
          !Number.isFinite(currentPriceRef.current) ||
          currentPriceRef.current <= 0 ||
          Math.abs(t.mid - currentPriceRef.current) > currentPriceRef.current * 0.12
        ) {
          currentPriceRef.current = t.mid;
          velocityRef.current = 0;
        }
      }
    });

    return () => {
      unsub();
    };
  }, [symbol]);

  // High-performance 120Hz+ live loop with unconditionally stable exponential easing & micro-breathing
  useEffect(() => {
    let lastPerfTime = performance.now();
    let lastTimeUpdate = 0;
    const pip = /JPY/.test(symbol) ? 0.001 : /BTC|ETH/.test(symbol) ? 0.01 : 0.00001;

    const animate = (timestamp: number) => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Measure precise delta time (dt in seconds), bounded to prevent jumps
      const dt = Math.min(0.08, Math.max(0.001, (timestamp - lastPerfTime) / 1000));
      lastPerfTime = timestamp;

      const now = Date.now();
      const list = liveCandlesRef.current;
      const chart = chartRef.current;
      const main = mainRef.current;
      if (!list.length || !main || !chart) return;

      const lastCandle = list[list.length - 1];
      if (!lastCandle || !Number.isFinite(lastCandle.close) || lastCandle.close <= 0) return;

      if (currentPriceRef.current === null || !Number.isFinite(currentPriceRef.current) || currentPriceRef.current <= 0) {
        currentPriceRef.current = lastCandle.close;
      }
      if (targetPriceRef.current === null || !Number.isFinite(targetPriceRef.current) || targetPriceRef.current <= 0) {
        targetPriceRef.current = lastCandle.close;
      }

      const targetPrice = targetPriceRef.current;
      let currentPrice = currentPriceRef.current;

      // Protection against instrument switch or large discrepancies
      if (Math.abs(targetPrice - currentPrice) > currentPrice * 0.10) {
        currentPrice = targetPrice;
      } else {
        // High-precision exponential lerp: continuous silky-smooth easing that settles organically
        const blend = 1 - Math.exp(-22 * dt);
        currentPrice = currentPrice + (targetPrice - currentPrice) * blend;
        if (Math.abs(targetPrice - currentPrice) < pip * 0.02) {
          currentPrice = targetPrice;
        }
      }

      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        currentPrice = targetPrice > 0 ? targetPrice : lastCandle.close;
      }

      currentPriceRef.current = currentPrice;
      velocityRef.current = 0;

      // Quotex micro-breathing: subtle sub-pip organic oscillation so the candle head breathes realistically like an electronic matching engine
      const microTime = timestamp * 0.006;
      const microJitter = (Math.sin(microTime) * 0.6 + Math.sin(microTime * 2.3) * 0.4) * (pip * 0.08);
      let curPrice = Number((currentPrice + microJitter).toFixed(/JPY/.test(symbol) ? 3 : /BTC|ETH/.test(symbol) ? 2 : 5));

      // Hard sanity guard against numerical explosion or NaN
      if (!Number.isFinite(curPrice) || curPrice <= 0 || (lastCandle.close > 0 && Math.abs(curPrice - lastCandle.close) > lastCandle.close * 0.15)) {
        curPrice = targetPrice > 0 ? targetPrice : lastCandle.close;
        currentPriceRef.current = curPrice;
      }

      const tfMs = tfToMs(timeframe);
      const bucket = Math.floor(now / tfMs) * tfMs;

      if (bucket > lastCandle.openTime) {
        // Candle interval expired — roll cleanly to new candle with exact Quotex gap-free rule!
        // 1. Finalize last candle
        if (chartType === 'candles') {
          (main as ISeriesApi<'Candlestick'>).update({
            time: (lastCandle.openTime / 1000) as Time,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
          });
        } else {
          (main as unknown as ISeriesApi<'Line'>).update({
            time: (lastCandle.openTime / 1000) as Time,
            value: lastCandle.close,
          });
        }

        // 2. Bridge any skipped intervals (e.g. if tab was backgrounded)
        let t = lastCandle.openTime + tfMs;
        let guard = 0;
        while (t < bucket && guard++ < 30) {
          const flatCandle: Candle = {
            symbol,
            timeframe,
            open: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
            close: lastCandle.close,
            volume: 0,
            openTime: t,
            closeTime: t + tfMs,
          };
          list.push(flatCandle);
          if (chartType === 'candles') {
            (main as ISeriesApi<'Candlestick'>).update({
              time: (t / 1000) as Time,
              open: flatCandle.open,
              high: flatCandle.high,
              low: flatCandle.low,
              close: flatCandle.close,
            });
          }
          t += tfMs;
        }

        // 3. New candle: open == previous candle close (exact Quotex continuity, zero price gap)
        const openPrice = lastCandle.close;
        const newCandle: Candle = {
          open: openPrice,
          high: Math.max(openPrice, curPrice),
          low: Math.min(openPrice, curPrice),
          close: curPrice,
          volume: 1,
          openTime: bucket,
          closeTime: bucket + tfMs,
          symbol,
          timeframe,
        };
        list.push(newCandle);
        if (list.length > 500) list.shift();
        activeCandleRef.current = newCandle;

        if (chartType === 'candles') {
          (main as ISeriesApi<'Candlestick'>).update({
            time: (bucket / 1000) as Time,
            open: newCandle.open,
            high: newCandle.high,
            low: newCandle.low,
            close: newCandle.close,
          });
        } else {
          (main as unknown as ISeriesApi<'Line'>).update({
            time: (bucket / 1000) as Time,
            value: newCandle.close,
          });
        }
        chart.timeScale().scrollToRealTime();
        if (openPriceTextRef.current) {
          openPriceTextRef.current.textContent = fmtPrice(newCandle.open);
        }
      } else {
        // Active candle breathing: expand high/low wicks and update close smoothly
        lastCandle.high = Math.max(lastCandle.high, curPrice);
        lastCandle.low = Math.min(lastCandle.low, curPrice);
        lastCandle.close = curPrice;
        lastCandle.volume += 0.02;
        activeCandleRef.current = lastCandle;

        if (chartType === 'candles') {
          (main as ISeriesApi<'Candlestick'>).update({
            time: (lastCandle.openTime / 1000) as Time,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
          });
        } else {
          (main as unknown as ISeriesApi<'Line'>).update({
            time: (lastCandle.openTime / 1000) as Time,
            value: lastCandle.close,
          });
        }
      }

      // Update 120Hz GPU-accelerated Overlay DOM positions directly (zero React re-renders)
      try {
        const ts = chart.timeScale();
        const activeT = (activeCandleRef.current?.openTime ?? lastCandle.openTime) / 1000;
        const x = ts.timeToCoordinate(activeT as Time);
        const y = (main as unknown as ISeriesApi<'Line'>).priceToCoordinate(curPrice);

        if (y !== null && Number.isFinite(y)) {
          const W = elRef.current?.clientWidth ?? 800;
          const H = elRef.current?.clientHeight ?? 500;
          const activeX = x !== null ? x : W * 0.78;

          // Horizontal dashed price line from active candle tip to the right scale
          if (hLineRef.current) {
            hLineRef.current.setAttribute('x1', String(activeX));
            hLineRef.current.setAttribute('y1', String(y));
            hLineRef.current.setAttribute('x2', String(W - 56));
            hLineRef.current.setAttribute('y2', String(y));
          }

          // Vertical dashed candle line down to time axis
          if (vLineRef.current) {
            vLineRef.current.setAttribute('x1', String(activeX));
            vLineRef.current.setAttribute('y1', String(y));
            vLineRef.current.setAttribute('x2', String(activeX));
            vLineRef.current.setAttribute('y2', String(H));
          }

          // Live candle tip radar wave dot with bull/bear color accent
          if (glowDotRef.current) {
            glowDotRef.current.style.transform = `translate3d(${activeX}px, ${y}px, 0)`;
            const isBull = curPrice >= (activeCandleRef.current?.open ?? curPrice);
            const dotCol = isBull ? '#00c076' : '#ff5447';
            if (glowDotCoreRef.current) glowDotCoreRef.current.setAttribute('fill', dotCol);
            if (glowDotWaveRef.current) glowDotWaveRef.current.setAttribute('fill', dotCol);
          }

          // Active countdown timer pill attached to the horizontal line
          if (countdownBadgeRef.current) {
            const leftPx = Math.min(activeX + 16, W - 110);
            countdownBadgeRef.current.style.transform = `translate3d(${leftPx}px, ${y - 11}px, 0)`;
          }

          // Price pill on right scale: transform Y and update text
          if (pricePillRef.current) {
            pricePillRef.current.style.transform = `translate3d(0, ${y - 10}px, 0)`;
          }
          if (pricePillTextRef.current) {
            pricePillTextRef.current.textContent = fmtPrice(curPrice);
          }

          // Quotex-style tick flash on the right price pill (green on uptick, red on downtick)
          if (pricePillInnerRef.current) {
            const timeSinceTick = performance.now() - lastTickTimeRef.current;
            if (timeSinceTick < 280 && lastTickDirRef.current) {
              pricePillInnerRef.current.style.backgroundColor = lastTickDirRef.current === 'up' ? '#00c076' : '#ff5447';
            } else {
              pricePillInnerRef.current.style.backgroundColor = '#007aff';
            }
          }
        }
      } catch { /* noop */ }

      // Throttled time & countdown updates (every 500ms for crisp responsiveness)
      if (now - lastTimeUpdate >= 500) {
        lastTimeUpdate = now;
        setClock(now);
        const secLeft = Math.max(0, Math.ceil((bucket + tfMs - now) / 1000));
        if (countdownTextRef.current) {
          countdownTextRef.current.textContent = formatCountdown(secLeft);
          if (secLeft <= 5) {
            countdownTextRef.current.className = 'text-amber-400 font-black animate-pulse';
          } else {
            countdownTextRef.current.className = 'text-white font-bold';
          }
        }

        const d = new Date(now);
        const h = String(d.getUTCHours()).padStart(2, '0');
        const m = String(d.getUTCMinutes()).padStart(2, '0');
        const s = String(d.getUTCSeconds()).padStart(2, '0');
        const timeStr = `${h}:${m}:${s} UTC`;
        setUtcClock((prev) => (prev !== timeStr ? timeStr : prev));
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [symbol, timeframe, chartType]);

  // Crosshair hover update for OHLC legend
  useEffect(() => {
    if (hoverT === null || !liveCandlesRef.current.length) {
      if (activeCandleRef.current) {
        setLegend(activeCandleRef.current);
        if (openPriceTextRef.current) {
          openPriceTextRef.current.textContent = fmtPrice(activeCandleRef.current.open);
        }
      }
      return;
    }
    const found = liveCandlesRef.current.find((c) => c.openTime / 1000 === hoverT);
    if (found) {
      setLegend(found);
      if (openPriceTextRef.current) {
        openPriceTextRef.current.textContent = fmtPrice(found.open);
      }
    }
  }, [hoverT]);

  // Drawing overlay interactions
  const onOverlayClick = () => {
    if (tool === 'select') return;
    const p = crossRef.current;
    const main = mainRef.current;
    if (!p || !main || p.time === undefined) return;
    let price: number | null = null;
    try {
      const sp = p.seriesData?.get(main as never) as { close?: number; value?: number } | undefined;
      if (sp && typeof sp.close === 'number') price = sp.close;
      else if (sp && typeof sp.value === 'number') price = sp.value;
    } catch { price = null; }
    if (price === null || !Number.isFinite(price)) return;
    const t = p.time as number;
    if (tool === 'trend') {
      if (!pending) setPending({ t, p: price });
      else {
        setDrawings((d) => [...d, { id: `d${Date.now()}`, type: 'trend', t1: pending.t, p1: pending.p, t2: t, p2: price as number }]);
        setPending(null);
      }
    } else {
      setDrawings((d) => [...d, { id: `d${Date.now()}`, type: tool, t1: t, p1: price as number }]);
    }
    bump();
  };

  const geo = useMemo(() => {
    void rev;
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!chart || !main) return [];
    const out: Array<{ id: string; type: DrawType; x1: number; y1: number; x2: number; y2: number }> = [];
    const W = elRef.current?.clientWidth ?? 0;
    for (const d of drawings) {
      try {
        const y1 = (main as ISeriesApi<'Line'>).priceToCoordinate(d.p1);
        if (y1 === null) continue;
        if (d.type === 'trend' && d.t2 !== undefined && d.p2 !== undefined) {
          const x1 = chart.timeScale().timeToCoordinate(d.t1 as Time);
          const x2 = chart.timeScale().timeToCoordinate(d.t2 as Time);
          const y2 = (main as ISeriesApi<'Line'>).priceToCoordinate(d.p2);
          if (x1 === null || x2 === null || y2 === null) continue;
          out.push({ id: d.id, type: d.type, x1, y1, x2, y2 });
        } else {
          out.push({ id: d.id, type: d.type, x1: 0, y1, x2: W, y2: y1 });
        }
      } catch { /* skip */ }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, rev]);

  // Trade overlay geometry: beginning of trade line, end of trade line, entry line, countdown chip
  const tradeGeo = useMemo(() => {
    void rev; void clock;
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!chart || !main || !elRef.current) return [];
    const W = elRef.current.clientWidth;
    const H = elRef.current.clientHeight;
    const ts = chart.timeScale();
    const out: Array<{ id: string; x1: number; x2: number; y: number | null; t: OptionTrade; left: number; pv: string }> = [];
    const priceScaleW = 58;

    const list = liveCandlesRef.current;
    const lastT = list.length ? list[list.length - 1].openTime / 1000 : null;
    const lastX = lastT !== null ? ts.timeToCoordinate(lastT as Time) : null;
    const tfSec = tfToMs(timeframe) / 1000;
    const bw = lastX !== null && list.length >= 2 ? Math.max(3, (lastX - (ts.timeToCoordinate((list[list.length - 2].openTime / 1000) as Time) ?? lastX - 10))) : 10;
    const project = (sec: number): number | null => {
      if (lastX === null || lastT === null) return null;
      return lastX + ((sec - lastT) / tfSec) * bw;
    };

    for (const t of symTrades) {
      try {
        const bucket = (ms: number) => Math.floor(ms / 1000);
        const openSec = bucket(new Date(t.openedAt).getTime());
        const expireSec = bucket(new Date(t.expiresAt).getTime());
        const x1 = ts.timeToCoordinate(openSec as Time) ?? project(openSec);
        const x2 = ts.timeToCoordinate(expireSec as Time) ?? project(expireSec);
        const y = (main as ISeriesApi<'Line'>).priceToCoordinate(t.entryPrice);
        if (x1 === null || x2 === null) continue;
        out.push({
          id: t.id,
          x1: Math.min(Math.max(0, x1), W - priceScaleW),
          x2: Math.min(Math.max(0, x2), W - priceScaleW),
          y,
          t,
          left: secondsLeft(t.expiresAt, clock),
          pv: previewOutcome(t, currentPriceRef.current ?? undefined),
        });
      } catch { /* skip */ }
    }
    void H;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symTrades, timeframe, rev, clock]);

  // Projected trade window when no trade is open (Quotex displays projected Beginning & End of trade)
  const projectedTradeLines = useMemo(() => {
    if (symTrades.length > 0) return null;
    const chart = chartRef.current;
    if (!chart || !elRef.current) return null;
    const W = elRef.current.clientWidth;
    const ts = chart.timeScale();
    const list = liveCandlesRef.current;
    if (!list.length) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const durSec = Number(localStorage.getItem('ax_opt_dur') ?? 60);
    const endSec = nowSec + durSec;

    const lastT = list[list.length - 1].openTime / 1000;
    const lastX = ts.timeToCoordinate(lastT as Time);
    const tfSec = tfToMs(timeframe) / 1000;
    const bw = lastX !== null && list.length >= 2 ? Math.max(3, (lastX - (ts.timeToCoordinate((list[list.length - 2].openTime / 1000) as Time) ?? lastX - 10))) : 10;
    const project = (sec: number): number | null => {
      if (lastX === null) return null;
      return lastX + ((sec - lastT) / tfSec) * bw;
    };

    const x1 = ts.timeToCoordinate(nowSec as Time) ?? project(nowSec);
    const x2 = ts.timeToCoordinate(endSec as Time) ?? project(endSec);
    if (x1 === null || x2 === null) return null;
    const priceScaleW = 58;
    return {
      x1: Math.min(Math.max(0, x1), W - priceScaleW),
      x2: Math.min(Math.max(0, x2), W - priceScaleW),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symTrades.length, timeframe, rev, clock]);

  const drawColor = (type: DrawType) => (type === 'support' ? UP : type === 'resistance' ? DOWN : type === 'trend' ? ACC : '#7A8776');

  const [showTfMenu, setShowTfMenu] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  const zoom = (dir: 1 | -1) => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const range = ts.getVisibleLogicalRange();
    if (range) {
      const span = range.to - range.from;
      const delta = span * 0.18 * dir;
      ts.setVisibleLogicalRange({ from: range.from + delta, to: range.to - delta });
    }
  };

  const lowestWick = useMemo(() => {
    const list = liveCandlesRef.current;
    if (!list.length || !chartRef.current || !mainRef.current) return null;
    const slice = list.slice(-22);
    let minCandle: Candle | null = null;
    for (const c of slice) {
      if (Number.isFinite(c.low) && c.low > 0) {
        if (!minCandle || c.low < minCandle.low) minCandle = c;
      }
    }
    if (!minCandle) return null;
    try {
      const ts = chartRef.current.timeScale();
      const x = ts.timeToCoordinate((minCandle.openTime / 1000) as Time);
      const y = (mainRef.current as unknown as ISeriesApi<'Line'>).priceToCoordinate(minCandle.low);
      if (x === null || y === null || !Number.isFinite(y)) return null;
      return { price: minCandle.low, x, y };
    } catch {
      return null;
    }
  }, [rev]);

  const resetView = () => {
    const chart = chartRef.current;
    const ts = chart?.timeScale();
    if (!ts || !chart) return;
    try {
      chart.priceScale('right').applyOptions({ autoScale: true });
    } catch { /* noop */ }
    ts.applyOptions({ barSpacing: 28, rightOffset: 12 });
    const list = liveCandlesRef.current;
    if (list.length) {
      ts.setVisibleLogicalRange({
        from: Math.max(0, list.length - 22),
        to: list.length + 8,
      });
    }
    ts.scrollToRealTime();
  };

  const toggleFull = () => {
    if (!wrapRef.current) return;
    if (!document.fullscreenElement) {
      void wrapRef.current.requestFullscreen?.().then(() => setIsFull(true));
    } else {
      void document.exitFullscreen?.().then(() => setIsFull(false));
    }
  };

  const assetInfo = getAssetMeta(symbol);

  return (
    <div ref={wrapRef} className={clsx('relative h-full w-full bg-[#121620] overflow-hidden select-none', tool !== 'select' && 'draw-active', isFull && 'p-2')}>
      {/* Aurelix centered watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[120px] font-black tracking-[0.2em] text-white/[0.035] select-none">AURELIX</span>
      </div>

      {/* Lightweight-charts container */}
      <div ref={elRef} className="absolute inset-0 z-[1]" />

      {/* Quotex Top Subheader: Live UTC clock + PAIR INFORMATION */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-3 pointer-events-auto">
        <span className="text-[11px] font-mono font-bold text-slate-300 bg-base-900/80 px-2 py-0.5 rounded border border-white/10 backdrop-blur-sm">
          {utcClock || '00:00:00 UTC'}
        </span>
        <button
          onClick={() => setShowPairInfo(true)}
          className="flex items-center gap-1 text-[11px] font-bold text-[#007aff] hover:text-[#38bdf8] bg-[#007aff]/10 hover:bg-[#007aff]/20 px-2.5 py-0.5 rounded-full border border-[#007aff]/20 transition"
        >
          <span>ℹ</span>
          <span>PAIR INFORMATION</span>
        </button>
      </div>

      {/* Quotex Left Edge Sentiment Bar */}
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center bg-[#171c26]/90 border border-white/10 rounded-md py-1.5 px-1 shadow-lg pointer-events-none select-none">
        <span className="text-[9.5px] font-black text-[#00c076] leading-none mb-1">59%</span>
        <div className="w-1.5 h-28 rounded-full bg-base-800 flex flex-col overflow-hidden">
          <div className="w-full bg-[#00c076]" style={{ height: '59%' }} />
          <div className="w-full bg-[#ff5447]" style={{ height: '41%' }} />
        </div>
        <span className="text-[9.5px] font-black text-[#ff5447] leading-none mt-1">41%</span>
      </div>

      {/* Drawing Overlay */}
      <svg className="absolute inset-0 w-full h-full z-[5]" onClick={onOverlayClick} style={{ pointerEvents: tool === 'select' ? 'none' : 'auto' }}>
        {geo.map((g) => (
          <g key={g.id}>
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={drawColor(g.type)} strokeWidth={1.5} strokeDasharray={g.type === 'trend' ? undefined : '5 3'} />
            {g.type === 'trend' && (<><circle cx={g.x1} cy={g.y1} r={3} fill={drawColor(g.type)} /><circle cx={g.x2} cy={g.y2} r={3} fill={drawColor(g.type)} /></>)}
            {(g.type === 'support' || g.type === 'resistance') && (
              <text x={8} y={g.y1 - 5} fill={drawColor(g.type)} fontSize={10} fontWeight={700}>{g.type === 'support' ? 'S' : 'R'}</text>
            )}
          </g>
        ))}
      </svg>

      {/* Projected Trade Window (When no trade is currently open) */}
      {projectedTradeLines && (
        <svg className="absolute inset-0 w-full h-full z-[6] pointer-events-none">
          {(() => {
            const H = elRef.current?.clientHeight ?? 0;
            const { x1, x2 } = projectedTradeLines;
            return (
              <g>
                <rect x={Math.min(x1, x2)} y={0} width={Math.abs(x2 - x1)} height={H} fill="#ffffff" opacity={0.02} />
                {/* Beginning of trade line */}
                <line x1={x1} y1={0} x2={x1} y2={H} stroke="#ffffff" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                <text x={x1 - 4} y={48} textAnchor="end" fill="#cbd5e1" fontSize={9.5} fontFamily="Inter, system-ui" fontWeight={600} opacity={0.85}>
                  Beginning of trade ▸
                </text>
                {/* End of trade line */}
                <line x1={x2} y1={0} x2={x2} y2={H} stroke="#ffffff" strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
                <text x={x2 + 4} y={62} fill="#cbd5e1" fontSize={9.5} fontFamily="Inter, system-ui" fontWeight={600} opacity={0.85}>
                  ◂ End of trade
                </text>
              </g>
            );
          })()}
        </svg>
      )}

      {/* Active Fixed-Time Trades Overlay */}
      {tradeGeo.length > 0 && (
        <svg className="absolute inset-0 w-full h-full z-[6] pointer-events-none">
          {tradeGeo.map((g) => {
            const col = g.pv === 'WON' ? '#00c076' : g.pv === 'LOST' ? '#ff5447' : '#94a3b8';
            const dirCol = g.t.direction === 'UP' ? '#00c076' : '#ff5447';
            const H = elRef.current?.clientHeight ?? 0;
            return (
              <g key={g.id}>
                <rect x={Math.min(g.x1, g.x2)} y={0} width={Math.abs(g.x2 - g.x1)} height={H} fill={col} opacity={0.07} />
                {/* Beginning of trade marker */}
                <line x1={g.x1} y1={0} x2={g.x1} y2={H} stroke="#ffffff" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
                <text x={g.x1 - 4} y={48} textAnchor="end" fill="#e2e8f0" fontSize={9.5} fontFamily="Inter, system-ui" fontWeight={600}>
                  Beginning of trade ▸
                </text>
                {/* End of trade marker */}
                <line x1={g.x2} y1={0} x2={g.x2} y2={H} stroke="#ffffff" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
                <text x={g.x2 + 4} y={62} fill="#e2e8f0" fontSize={9.5} fontFamily="Inter, system-ui" fontWeight={600}>
                  ◂ End of trade
                </text>
                {/* Entry price line + direction chip */}
                {g.y !== null && (
                  <>
                    <line x1={g.x1} y1={g.y} x2={g.x2} y2={g.y} stroke={dirCol} strokeWidth={1.75} strokeDasharray="5 3" />
                    <circle cx={g.x1} cy={g.y} r={4} fill={dirCol} />
                    <g transform={`translate(${g.x1 + 6}, ${g.y - 10})`}>
                      <rect width={94} height={20} rx={4} fill="#121620" stroke={dirCol} strokeWidth={1.25} />
                      <text x={7} y={13.5} fill={dirCol} fontSize={10} fontWeight={800} fontFamily="JetBrains Mono, monospace">
                        {g.t.direction === 'UP' ? '▲' : '▼'} {fmtPrice(g.t.entryPrice)}
                      </text>
                    </g>
                  </>
                )}
                {/* Live trade countdown chip */}
                <g transform={`translate(${Math.min(Math.max(g.x2 - 32, 2), (elRef.current?.clientWidth ?? 0) - 58 - 66)}, ${(g.y !== null ? g.y : H * 0.45) + 14})`}>
                  <rect width={64} height={20} rx={10} fill={col} opacity={0.95} />
                  <text x={32} y={14} textAnchor="middle" fill="#ffffff" fontSize={10.5} fontWeight={800} fontFamily="JetBrains Mono, monospace">
                    {fmtHMS(g.left)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      )}

      {/* Quotex Active Price Line & Vertical Candle Line + Pulsing Glow Dot (120Hz Hardware Accelerated) */}
      <svg className="absolute inset-0 w-full h-full z-[7] pointer-events-none">
        {/* Horizontal Dashed Price Line from active candle to the right price scale */}
        <line
          ref={hLineRef}
          x1={0}
          y1={-100}
          x2={(elRef.current?.clientWidth ?? 800) - 56}
          y2={-100}
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Vertical Dashed Line through the active candle */}
        <line
          ref={vLineRef}
          x1={-100}
          y1={0}
          x2={-100}
          y2={elRef.current?.clientHeight ?? 500}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Pulsing Quotex Radar Beacon at the live candle tip */}
        <g ref={glowDotRef} style={{ transform: 'translate3d(-100px, -100px, 0)' }}>
          <circle ref={glowDotWaveRef} r={10} fill="#00c076" opacity={0.35} className="animate-ping" />
          <circle ref={glowDotCoreRef} r={4} fill="#00c076" opacity={0.9} />
          <circle r={2} fill="#ffffff" />
        </g>
      </svg>

      {/* Active Candle Countdown Badge (Quotex signature "00:29" attached to active candle on horizontal line) */}
      <div
        ref={countdownBadgeRef}
        className="absolute top-0 left-0 z-20 pointer-events-none will-change-transform"
        style={{ transform: 'translate3d(-500px, -500px, 0)' }}
      >
        <div className="bg-[#121620]/95 border border-white/20 text-white font-mono font-bold text-[10.5px] px-2 py-0.5 rounded shadow-lg flex items-center gap-1.5 backdrop-blur-md">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span ref={countdownTextRef}>{formatCountdown(candleSecondsLeft)}</span>
        </div>
      </div>

      {/* Floating Lowest-Wick Price Badge (matches screenshot lowest price tag 1.16114) */}
      {lowestWick && lowestWick.y > 15 && lowestWick.y < (elRef.current?.clientHeight ?? 400) - 20 && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            top: `${lowestWick.y + 4}px`,
            left: `${Math.max(10, Math.min(lowestWick.x - 24, (elRef.current?.clientWidth ?? 600) - 70))}px`,
          }}
        >
          <div className="bg-[#171c26]/90 border border-white/10 text-slate-400 font-mono text-[9.5px] px-1.5 py-0.5 rounded shadow">
            {fmtPrice(lowestWick.price)}
          </div>
        </div>
      )}

      {/* Blue Price Pill on the Right Scale (Quotex Signature Style with tick flash & alert bell) */}
      <div
        ref={pricePillRef}
        className="absolute top-0 right-0 z-20 pointer-events-auto flex items-center will-change-transform"
        style={{ transform: 'translate3d(0, -500px, 0)' }}
      >
        <div
          ref={pricePillInnerRef}
          className="flex items-center bg-[#007aff] hover:bg-[#0069db] text-white font-mono font-black text-[10.5px] pl-2 pr-1.5 py-0.5 rounded-l shadow-md cursor-pointer transition-colors duration-150"
        >
          <span ref={pricePillTextRef}>{fmtPrice(legend?.close ?? 0)}</span>
          <span className="ml-1 text-[11px] opacity-80 hover:opacity-100" title="Set Price Alert">🔔</span>
        </div>
      </div>

      {/* Floating Bottom-Left Toolbar (Quotex layout: Pencil, Timeframe, Chart Type, Open price) */}
      <div className="absolute left-4 bottom-3 z-20 flex items-center gap-1.5 bg-[#171c26]/95 backdrop-blur-md border border-white/10 rounded-lg p-1 shadow-panel select-none">
        {/* Drawing tools button */}
        <button
          onClick={() => { setTool(tool === 'select' ? 'trend' : 'select'); }}
          title="Drawing Tools"
          className={clsx('h-7 px-2 rounded flex items-center gap-1 text-xs font-semibold transition', tool !== 'select' ? 'bg-[#007aff] text-white' : 'text-slate-300 hover:text-white hover:bg-white/[0.08]')}
        >
          <span>✎</span>
          {tool !== 'select' && <span className="text-[10px]">{tool}</span>}
        </button>

        {/* Quick drawings dropdown options if active */}
        {tool !== 'select' && (
          <div className="flex items-center gap-0.5 border-l border-white/10 pl-1">
            {[
              ['trend', '╱', 'Trend'],
              ['hline', '―', 'H-Line'],
              ['support', 'S', 'Support'],
              ['resistance', 'R', 'Resistance'],
            ].map(([v, glyph, title]) => (
              <button
                key={v}
                title={title}
                onClick={() => { setTool(v as Tool); setPending(null); }}
                className={clsx('h-6 px-1.5 rounded text-[10px] font-bold transition', tool === v ? 'bg-[#007aff] text-white' : 'text-slate-400 hover:text-white')}
              >
                {glyph} {title}
              </button>
            ))}
            <button title="Clear all" onClick={() => { setDrawings([]); setTool('select'); }} className="h-6 px-1.5 rounded text-[10px] text-[#ea4d4d] hover:bg-[#ea4d4d]/10">⌫</button>
          </div>
        )}

        <div className="w-px h-4 bg-white/10" />

        {/* Timeframe selector (e.g. 1m) */}
        <div className="relative">
          <button
            onClick={() => { setShowTfMenu((v) => !v); setShowTypeMenu(false); setShowIndMenu(false); }}
            className="h-7 px-2 rounded flex items-center gap-1 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/[0.08] transition"
          >
            <span>{timeframe}</span>
          </button>
          {showTfMenu && (
            <div className="absolute left-0 bottom-9 w-28 bg-[#171c26] border border-white/15 rounded-lg shadow-2xl p-1 z-30 flex flex-col gap-0.5">
              {['5s', '15s', '30s', '1m', '2m', '5m', '15m', '1h'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => { setTimeframe(tf); setShowTfMenu(false); }}
                  className={clsx('h-6 px-2 text-left text-xs font-semibold rounded transition', timeframe === tf ? 'bg-[#007aff] text-white' : 'text-slate-300 hover:text-white hover:bg-white/[0.08]')}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/10" />

        {/* Chart type icon button */}
        <div className="relative">
          <button
            onClick={() => { setShowTypeMenu((v) => !v); setShowTfMenu(false); setShowIndMenu(false); }}
            title="Chart Type"
            className="w-7 h-7 rounded flex items-center justify-center text-xs text-slate-200 hover:text-white hover:bg-white/[0.08] transition"
          >
            <span>{chartType === 'candles' ? '🕯' : chartType === 'line' ? '📈' : '📉'}</span>
          </button>
          {showTypeMenu && (
            <div className="absolute left-0 bottom-9 w-28 bg-[#171c26] border border-white/15 rounded-lg shadow-2xl p-1 z-30 flex flex-col gap-0.5">
              {[
                ['candles', '🕯 Candles'],
                ['line', '📈 Line'],
                ['area', '📉 Area'],
              ].map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => { setChartType(t as 'candles' | 'line' | 'area'); setShowTypeMenu(false); }}
                  className={clsx('h-6 px-2 text-left text-xs font-semibold rounded transition', chartType === t ? 'bg-[#007aff] text-white' : 'text-slate-300 hover:text-white hover:bg-white/[0.08]')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/10" />

        {/* Indicators button */}
        <div className="relative">
          <button
            onClick={() => { setShowIndMenu((v) => !v); setShowTfMenu(false); setShowTypeMenu(false); }}
            className="h-7 px-2 rounded flex items-center gap-1 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/[0.08] transition"
            title="Indicators"
          >
            <span>🧭</span>
          </button>
          {showIndMenu && (
            <div className="absolute left-0 bottom-9 w-48 bg-[#171c26] border border-white/15 rounded-lg shadow-2xl p-2 z-30">
              <div className="text-[10px] uppercase font-bold text-slate-400 px-1 pb-1">Overlays</div>
              {[['vol', 'Volume'], ['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['ema20', 'EMA 20'], ['bb', 'Bollinger (20, 2)']].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 px-1.5 py-1 text-xs rounded hover:bg-white/[0.06] cursor-pointer text-slate-200">
                  <input type="checkbox" className="ax-check" checked={!!inds[k as keyof IndState]} onChange={() => setInds({ ...inds, [k]: !inds[k as keyof IndState] })} />
                  <span>{label}</span>
                </label>
              ))}
              <div className="text-[10px] uppercase font-bold text-slate-400 px-1 pt-2 pb-1">Oscillator</div>
              {([['none', 'None'], ['rsi', 'RSI (14)'], ['macd', 'MACD (12, 26, 9)']] as Array<[IndState['osc'], string]>).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 px-1.5 py-1 text-xs rounded hover:bg-white/[0.06] cursor-pointer text-slate-200">
                  <input type="radio" name="osc" className="ax-check" checked={inds.osc === k} onChange={() => setInds({ ...inds, osc: k })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Quotex Open Price display */}
        <div className="border-l border-white/10 pl-2 pr-1 flex items-center text-[11px] font-mono text-slate-400">
          <span>Open:&nbsp;</span>
          <span ref={openPriceTextRef} className="text-white font-semibold">{fmtPrice(legend?.open ?? activeCandleRef.current?.open ?? 0)}</span>
        </div>
      </div>

      {/* Bottom-center zoom controls */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 flex items-center gap-1 bg-[#171c26]/95 backdrop-blur-md border border-white/10 rounded-lg px-2 py-0.5 shadow-panel">
        <button onClick={() => zoom(-1)} title="Zoom Out" className="w-6 h-6 rounded text-slate-300 hover:text-white hover:bg-white/[0.08] font-bold text-base transition flex items-center justify-center">−</button>
        <span className="text-[10px] text-slate-400 font-mono px-1">ZOOM</span>
        <button onClick={() => zoom(1)} title="Zoom In" className="w-6 h-6 rounded text-slate-300 hover:text-white hover:bg-white/[0.08] font-bold text-base transition flex items-center justify-center">+</button>
      </div>

      {/* Top right utility rail */}
      <div className="absolute right-2 top-2 z-20 flex gap-1">
        <button onClick={resetView} title="Reset view" className="h-7 px-2.5 rounded bg-[#171c26]/90 border border-white/10 text-[11px] font-semibold text-slate-300 hover:text-white transition">Reset</button>
        <button onClick={toggleFull} title="Fullscreen" className="h-7 px-2.5 rounded bg-[#171c26]/90 border border-white/10 text-[11px] font-semibold text-slate-300 hover:text-white transition">{isFull ? 'Exit' : '⤢'}</button>
      </div>

      {tool !== 'select' && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 text-[11px] bg-[#171c26]/95 border border-white/15 text-slate-200 rounded px-3 py-1.5 whitespace-nowrap shadow-pop">
          {tool === 'trend' ? (pending ? 'Click second point · ' : 'Click first point · ') : `Click chart to place ${tool === 'support' ? 'support' : tool === 'resistance' ? 'resistance' : 'line'} · `}
          <button className="underline text-white font-bold ml-1" onClick={() => { setTool('select'); setPending(null); }}>done</button>
        </div>
      )}

      {/* Quotex Pair Information Modal */}
      {showPairInfo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPairInfo(false)}>
          <div className="bg-[#171c26] border border-white/15 rounded-2xl w-full max-w-md p-5 text-white shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{assetInfo.flag1}{assetInfo.flag2}</span>
                <div>
                  <h3 className="font-extrabold text-base">{symbol}</h3>
                  <div className="text-xs text-slate-400">{assetInfo.name}</div>
                </div>
              </div>
              <button onClick={() => setShowPairInfo(false)} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm font-bold">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-base-900/80 p-2.5 rounded-lg border border-white/5">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Payout Rate</div>
                <div className="text-[#eab308] font-black text-base mt-0.5">{assetInfo.defaultPayout}%</div>
              </div>
              <div className="bg-base-900/80 p-2.5 rounded-lg border border-white/5">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Category</div>
                <div className="text-white font-bold text-sm mt-0.5">{assetInfo.category}</div>
              </div>
              <div className="bg-base-900/80 p-2.5 rounded-lg border border-white/5">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Trading Schedule</div>
                <div className="text-white font-semibold mt-0.5">24/7 Continuous OTC</div>
              </div>
              <div className="bg-base-900/80 p-2.5 rounded-lg border border-white/5">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Expiration Window</div>
                <div className="text-white font-semibold mt-0.5">5s – 4h</div>
              </div>
            </div>
            <div className="text-xs text-slate-400 leading-relaxed bg-base-900/40 p-3 rounded-lg border border-white/5">
              High-liquidity currency pair with microsecond price discovery, continuous rolling candles, and instant binary execution.
            </div>
            <button onClick={() => setShowPairInfo(false)} className="w-full h-9 rounded-lg bg-[#007aff] hover:bg-[#0069db] text-white font-bold text-xs transition">
              Close
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#121620]/60 z-30">
          <div className="text-xs text-slate-300 flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-[#00c076] border-t-transparent animate-spin" />
            Loading market data…
          </div>
        </div>
      )}
    </div>
  );
}
