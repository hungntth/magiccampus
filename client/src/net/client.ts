// WebSocket RPC client: call(method, ...args) -> Promise, on(callbackName, handler) for server pushes.

import type { ClientMessage, RpcError, ServerMessage } from '@mc/shared';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; method: string };
type CallbackHandler = (...args: unknown[]) => void;

export class RpcClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly method: string,
  ) {
    super(message);
  }
}

export class GameClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, Set<CallbackHandler>>();
  private closeListeners: ((code: number, reason: string) => void)[] = [];

  constructor(private readonly url: string) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('websocket error'));
      ws.onmessage = (ev) => this.onMessage(String(ev.data));
      ws.onclose = (ev) => {
        for (const p of this.pending.values()) p.reject(new RpcClientError('CLOSED', 'connection closed', p.method));
        this.pending.clear();
        for (const l of this.closeListeners) l(ev.code, ev.reason);
      };
    });
  }

  onClose(listener: (code: number, reason: string) => void): void {
    this.closeListeners.push(listener);
  }

  call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new RpcClientError('CLOSED', 'not connected', method));
    }
    const id = this.nextId++;
    const msg: ClientMessage = { t: 'call', id, m: method, a: args };
    this.ws.send(JSON.stringify(msg));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, method });
    });
  }

  on(callback: string, handler: CallbackHandler): () => void {
    if (!this.handlers.has(callback)) this.handlers.set(callback, new Set());
    this.handlers.get(callback)!.add(handler);
    return () => this.handlers.get(callback)?.delete(handler);
  }

  private onMessage(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (msg.t === 'res') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.r);
      else p.reject(new RpcClientError((msg.e as RpcError).code, (msg.e as RpcError).msg, p.method));
      return;
    }
    if (msg.t === 'cb') {
      for (const h of this.handlers.get(msg.m) ?? []) {
        try {
          h(...msg.a);
        } catch (err) {
          console.error(`callback ${msg.m} failed`, err);
        }
      }
    }
  }
}

export function defaultWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
