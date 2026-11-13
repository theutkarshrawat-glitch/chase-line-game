/**
 * CHASE LINE 1v1 over WebRTC via PeerJS (vendored + public broker).
 * Host is authoritative; guest sends inputs and interpolates snapshots.
 */
(function (root) {
  const PREFIX = 'clg-';
  const Net = {
    peer: null,
    conn: null,
    role: null, // 'host' | 'guest'
    code: null,
    ready: false,
    lastError: null,
    remote: null,
    onProfile: null,
    onStart: null,
    onInput: null,
    onState: null,
    onClose: null,
    onStatus: null,
    inbox: [],
  };

  function status(s) { Net.lastStatus = s; if (Net.onStatus) Net.onStatus(s); }

  function alphabetCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function bindConn(conn) {
    Net.conn = conn;
    conn.on('data', (msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'profile') {
        Net.remote = msg.profile;
        if (Net.onProfile) Net.onProfile(msg.profile);
      } else if (msg.type === 'start') {
        if (Net.onStart) Net.onStart(msg);
      } else if (msg.type === 'input') {
        if (Net.onInput) Net.onInput(msg);
      } else if (msg.type === 'state') {
        if (Net.onState) Net.onState(msg);
      } else if (msg.type === 'event') {
        Net.inbox.push(msg);
      }
    });
    conn.on('open', () => {
      Net.ready = true;
      status('linked');
    });
    conn.on('close', () => {
      Net.ready = false;
      status('closed');
      if (Net.onClose) Net.onClose();
    });
    conn.on('error', (e) => {
      Net.lastError = String(e && e.message || e);
      status('error');
    });
  }

  function ensurePeer(id, cb) {
    if (typeof Peer === 'undefined') {
      Net.lastError = 'PeerJS not loaded';
      status('no-peerjs');
      cb && cb(new Error(Net.lastError));
      return;
    }
    destroy();
    const opts = { debug: 0 };
    Net.peer = id ? new Peer(id, opts) : new Peer(opts);
    Net.peer.on('open', (real) => { status('open'); cb && cb(null, real); });
    Net.peer.on('error', (e) => {
      Net.lastError = String(e && e.type || e);
      status('error:' + Net.lastError);
      cb && cb(e);
    });
    Net.peer.on('disconnected', () => status('disconnected'));
    Net.peer.on('connection', (conn) => {
      bindConn(conn);
      status('incoming');
    });
  }

  function create(cb) {
    const code = alphabetCode();
    Net.role = 'host';
    Net.code = code;
    ensurePeer(PREFIX + code, (err) => {
      if (err) return cb && cb(err);
      cb && cb(null, code);
    });
  }

  function join(code, cb) {
    const c = String(code || '').trim().toUpperCase();
    Net.role = 'guest';
    Net.code = c;
    ensurePeer(null, (err) => {
      if (err) return cb && cb(err);
      const conn = Net.peer.connect(PREFIX + c, { reliable: true });
      bindConn(conn);
      conn.on('open', () => cb && cb(null, c));
      setTimeout(() => {
        if (!Net.ready) cb && cb(new Error('connect-timeout'));
      }, 8000);
    });
  }

  function send(msg) {
    if (Net.conn && Net.ready) {
      try { Net.conn.send(msg); } catch (e) { /* */ }
    }
  }

  function sendProfile(profile) { send({ type: 'profile', profile }); }
  function sendStart(payload) { send(Object.assign({ type: 'start' }, payload)); }
  function sendInput(input, seq, t) { send({ type: 'input', input, seq, t }); }
  function sendState(state, t) { send({ type: 'state', state, t }); }

  function destroy() {
    try { if (Net.conn) Net.conn.close(); } catch (e) { /* */ }
    try { if (Net.peer) Net.peer.destroy(); } catch (e) { /* */ }
    Net.peer = null; Net.conn = null; Net.ready = false; Net.remote = null;
  }

  const api = { Net, create, join, send, sendProfile, sendStart, sendInput, sendState, destroy, status };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChaseNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
