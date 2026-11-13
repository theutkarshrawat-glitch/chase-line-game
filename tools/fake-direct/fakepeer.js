(() => {
  const ws = new WebSocket('ws://127.0.0.1:18793');
  const q = []; ws.onopen = () => { while (q.length) ws.send(q.shift()); };
  const out = (m) => { const s = JSON.stringify(m); if (ws.readyState === 1) ws.send(s); else q.push(s); };
  let self = null;
  window.__fakeDirect = { killed: false };
  class Em { constructor() { this.h = {}; } on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; } emit(e, a) { (this.h[e] || []).forEach((f) => f(a)); } }
  class Conn extends Em {
    constructor(peer, cid, metadata) { super(); this.peer = peer; this.cid = cid; this.metadata = metadata; this.open = false; }
    send(m) { if (!this.open) throw new Error('closed'); out({ kind: 'data', cid: this.cid, to: this.peer, data: m }); }
    close() { if (!this.open) return; this.open = false; out({ kind: 'close', cid: this.cid, to: this.peer }); this.emit('close'); }
  }
  class FakePeer extends Em {
    constructor(id) {
      super(); if (typeof id !== 'string') id = 'p' + Math.random().toString(36).slice(2);
      this.id = id; this.conns = {}; this.open = false; this.destroyed = false; this.disconnected = false; self = this;
      setTimeout(() => { out({ kind: 'register', id }); this.open = true; this.emit('open', id); }, 60);
    }
    connect(to, opts) {
      const cid = 'c' + Math.random().toString(36).slice(2);
      const c = new Conn(to, cid, opts && opts.metadata); this.conns[cid] = c;
      out({ kind: 'connect', cid, to, from: this.id, metadata: c.metadata }); return c;
    }
    reconnect() {} destroy() { this.destroyed = true; Object.values(this.conns).forEach((c) => c.close()); }
  }
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data); const P = self; if (!P) return;
    if (m.kind === 'connect') {
      const c = new Conn(m.from, m.cid, m.metadata); P.conns[m.cid] = c; P.emit('connection', c);
      setTimeout(() => { c.open = true; c.emit('open'); out({ kind: 'open', cid: m.cid, to: m.from }); }, 120);
    } else if (m.kind === 'open') { const c = P.conns[m.cid]; if (c) { c.open = true; c.emit('open'); } }
    else if (m.kind === 'data') { const c = P.conns[m.cid]; if (c && c.open) c.emit('data', m.data); }
    else if (m.kind === 'close') { const c = P.conns[m.cid]; if (c && c.open) { c.open = false; c.emit('close'); } }
    else if (m.kind === 'unavailable') P.emit('error', { type: 'peer-unavailable' });
    else if (m.kind === 'killall') { window.__fakeDirect.killed = true; Object.values(P.conns).forEach((c) => { if (c.open) { c.open = false; c.emit('close'); } }); }
  };
  window.Peer = FakePeer;
  window.__killDirect = () => out({ kind: 'killall' });
})();
