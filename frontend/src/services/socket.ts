import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../lib/constants';
import { getAccessToken } from '../lib/api';
import { useTerminal, type Tick, type LiveCandle } from '../stores/terminalStore';
import { queryClient } from '../lib/queryClient';
import { useUI } from '../stores/uiStore';

let socket: Socket | null = null;
let subscribed: string[] = [];

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket?.removeAllListeners();
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

  socket.on('connect', () => {
    if (subscribed.length) socket?.emit('market:subscribe', subscribed);
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
  socket.on('option:settled', (o: { symbol: string; status: 'WON' | 'LOST' | 'TIE'; profit: number | null; direction: 'UP' | 'DOWN' }) => {
    queryClient.invalidateQueries({ queryKey: ['options'] });
    queryClient.invalidateQueries({ queryKey: ['option-stats'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    const p = Number(o.profit ?? 0);
    const text = o.status === 'WON' ? `Won ${o.symbol} ${o.direction === 'UP' ? '▲' : '▼'}  +$${p.toFixed(2)}` : o.status === 'TIE' ? `Tie ${o.symbol} — stake returned` : `Lost ${o.symbol} ${o.direction === 'UP' ? '▲' : '▼'}  −$${Math.abs(p).toFixed(2)}`;
    useUI.getState().push(o.status === 'WON' ? 'ok' : o.status === 'TIE' ? 'info' : 'err', text);
  });
  socket.on('balance:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
  });
  socket.on('notification:new', (n: { title: string }) => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
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
