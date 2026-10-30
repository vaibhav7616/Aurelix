import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../lib/constants';
import { getAccessToken } from '../lib/api';
import { useTerminal, type Tick, type LiveCandle } from '../stores/terminalStore';
import { queryClient } from '../lib/queryClient';
import { useUI } from '../stores/uiStore';
import { soundService } from '../lib/sound';
import { useSettlementStore } from '../stores/settlementStore';

let socket: Socket | null = null;
let subscribed: string[] = [];

export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io(WS_URL || undefined, {
    auth: { token: getAccessToken() },
    // start with long-polling (works through any proxy) and upgrade to websocket when possible —
    // the quote stream must never depend on a proxy allowing WS upgrades
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 8000,
  });
  startQuoteWatchdog();

  let wasConnected = false;
  socket.on('disconnect', () => useTerminal.getState().setSocketConnected(false));
  socket.on('connect', () => {
    useTerminal.getState().setSocketConnected(true);
    if (subscribed.length) socket?.emit('market:subscribe', subscribed);
    // reconnect: candles formed while offline are on the server — reload history instead of bridging flat bars
    if (wasConnected) void queryClient.invalidateQueries({ queryKey: ['candles'] });
    wasConnected = true;
  });
  socket.on('market:tick', (t: Tick) => {
    useTerminal.getState().applyTick(t);
  });
  // server closed a candle / opened the next one — the chart rolls its live bar on this exact event
  socket.on('market:candle', (c: LiveCandle) => {
    if (c && (c.event === 'open' || c.event === 'close')) useTerminal.getState().applyCandleEvent(c);
  });
  socket.on('position:updated', () => queryClient.invalidateQueries({ queryKey: ['positions'] }));
  socket.on('position:opened', () => {
    queryClient.invalidateQueries({ queryKey: ['positions'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  });
  socket.on('position:closed', (p: { realizedPnl: number; reason: string }) => {
    queryClient.invalidateQueries({ queryKey: ['positions'] });
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    useUI.getState().push(p.realizedPnl >= 0 ? 'ok' : 'info', `Position closed (${p.reason}) ${p.realizedPnl >= 0 ? '+' : ''}${Number(p.realizedPnl).toFixed(2)}`);
  });
  socket.on('option:opened', () => {
    queryClient.invalidateQueries({ queryKey: ['options'] });
    queryClient.invalidateQueries({ queryKey: ['option-stats'] });
  });
  socket.on('option:settled', (o: {
    id?: string;
    symbol: string;
    status: 'WON' | 'LOST' | 'TIE';
    profit: number | null;
    direction: 'UP' | 'DOWN';
    stake?: number;
    payoutPct?: number;
    entryPrice?: number;
    closePrice?: number;
    durationSec?: number;
  }) => {
    queryClient.invalidateQueries({ queryKey: ['options'] });
    queryClient.invalidateQueries({ queryKey: ['option-stats'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });

    const p = Number(o.profit ?? 0);

    useSettlementStore.getState().pushSettlement({
      id: o.id,
      symbol: o.symbol ?? 'Asset',
      direction: o.direction ?? 'UP',
      status: o.status,
      stake: Number(o.stake ?? 0),
      profit: p,
      payoutPct: Number(o.payoutPct ?? 80),
      entryPrice: Number(o.entryPrice ?? 0),
      closePrice: Number(o.closePrice ?? 0),
      durationSec: o.durationSec,
    });
  });
  socket.on('pending:updated', (p: { status: string; symbol: string; direction: string; reason: string | null }) => {
    queryClient.invalidateQueries({ queryKey: ['pending'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    if (p.status === 'EXECUTED') {
      queryClient.invalidateQueries({ queryKey: ['options'] });
      useUI.getState().push('ok', `Pending trade opened: ${p.direction} ${p.symbol}`);
    } else if (p.status === 'FAILED' || p.status === 'EXPIRED') {
      useUI.getState().push('info', `Pending trade ${p.status.toLowerCase()}: ${p.symbol}${p.reason ? ` — ${p.reason}` : ''}`);
    }
  });
  socket.on('balance:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
  });
  socket.on('notification:new', (n: { title: string }) => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (n.title.startsWith('Trade won') || n.title.startsWith('Trade lost') || n.title.startsWith('Trade tied')) {
      return;
    }
    useUI.getState().push('info', n.title);
  });
  socket.on('connect_error', () => { /* silent — auto retry */ });
  return socket;
}

/**
 * Quote watchdog: if no tick has arrived for 2.5 s (socket blocked / sleeping tab), pull quotes
 * over plain HTTP so the live candle keeps moving; goes quiet again as soon as the socket delivers.
 */
let watchdog: ReturnType<typeof setInterval> | null = null;
let pulling = false;
function startQuoteWatchdog() {
  if (watchdog) return;
  watchdog = setInterval(async () => {
    const st = useTerminal.getState();
    if (!subscribed.length || pulling) return;
    if (Date.now() - st.lastQuoteAt < 2500) return;
    pulling = true;
    try {
      const res = await fetch(`/api/v1/market/ticks?symbols=${encodeURIComponent(subscribed.join(','))}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` } });
      if (res.ok) {
        const body = await res.json() as { data?: { ticks?: Tick[] } };
        for (const t of body.data?.ticks ?? []) st.applyTick(t);
      }
    } catch { /* offline */ } finally { pulling = false; }
  }, 1000);
}

export function subscribeMarket(symbols: string[]): void {
  const next = [...new Set(symbols)].slice(0, 30);
  const prev = subscribed;
  subscribed = next;
  if (!socket?.connected) return;
  const add = next.filter((s) => !prev.includes(s));
  const del = prev.filter((s) => !next.includes(s));
  if (add.length) socket.emit('market:subscribe', add);
  if (del.length) socket.emit('market:unsubscribe', del);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  subscribed = [];
}

export function onCandleEvent(cb: (payload: { candle: any; event: 'open' | 'close' | 'update' }) => void): () => void {
  const s = connectSocket();
  s.on('market:candle', cb);
  return () => {
    s.off('market:candle', cb);
  };
}
