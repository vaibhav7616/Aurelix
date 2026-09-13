import { io, Socket } from 'socket.io-client';
import { useTerminal, type Tick } from '../stores/terminalStore';

let socket: Socket | null = null;
const subscribed = new Set<string>();

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket) return socket;

  const url = window.location.origin;
  socket = io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    // Re-subscribe if any
    if (subscribed.size > 0) {
      socket?.emit('market:subscribe', Array.from(subscribed));
    }
  });

  socket.on('market:tick', (tick: Tick) => {
    if (tick && tick.symbol) {
      useTerminal.getState().applyTick(tick);
    }
  });

  socket.on('disconnect', () => {
    // disconnected
  });

  return socket;
}

export function subscribeMarket(symbols: string[] | string): void {
  const syms = Array.isArray(symbols) ? symbols : [symbols];
  for (const s of syms) {
    if (s) subscribed.add(s);
  }

  const s = connectSocket();
  if (s.connected) {
    s.emit('market:subscribe', syms);
  }
}
