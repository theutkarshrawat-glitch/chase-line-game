/**
 * CHASE LINE 1v1 networking, v3.
 *
 * Two transports run side by side and every message is de-duplicated, so the
 * match survives whichever one the phones' networks allow:
 *   DIRECT  PeerJS / WebRTC data channel (public PeerJS broker for signalling,
 *           Google + Cloudflare STUN, PeerJS's own TURN). Fast, but fails
 *           behind carrier-grade NAT on mobile data.
 *   RELAY   MQTT over secure WebSocket to free public brokers (shiftr.io on
 *           443, EMQX, HiveMQ, all at once). No WebRTC at all, so it works on any network that
 *           can open a web page.
 * The host's room code is announced on both. The guest says hello on both;
 * whichever answers first links the phones. If the direct data channel is not
 * open within DIRECT_WAIT ms, play runs over the relay. A late direct channel
 * upgrades the link, and if it drops, play falls back to the relay.
 *
 * Host is authoritative: the guest sends inputs, the host sends snapshots.
 * URL flags for testing: ?net=relay (relay only), ?net=direct (direct only).
 */
(function (root) {
  const NS = 'chaseline-v3-r7q2';               // namespace + salt for ids and topics
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // all three at once (port 443 first: some networks only allow 443); messages are de-duplicated
  const BROKERS = [
    { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
    { url: 'wss://broker.emqx.io:8084/mqtt' },
    { url: 'wss://broker.hivemq.com:8884/mqtt' },
  ];
  const DIRECT_WAIT = 7000;
  const JOIN_GIVE_UP = 45000;
  const ICE = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:eu-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
    { urls: 'turn:us-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
  ];

  const Net = {
    role: null, code: null, sid: null, peerSid: null,
    ready: false, transport: null,           // 'direct' | 'relay' | null
    lastError: null, lastStatus: '', remote: null,
    onProfile: null, onStart: null, onInput: null, onState: null, onEvent: null,
    onClose: null, onStatus: null, onTransport: null,
    inbox: [],
    stats: { sent: 0, recv: 0, sentRelay: 0, sentDirect: 0, recvRelay: 0, recvDirect: 0, dupes: 0 },
  };

  let peer = null, conn = null, directOpen = false;
  let mqttClients = [], relayLinked = false;
  let seq = 0, seen = new Map(), lastStateN = -1;
  let timers = [], session = 0;
  let pendingInput = null, lastInputFlush = 0, lastStateSent = 0, lastHeard = 0;

  function flag() {
    try { return new URLSearchParams(location.search).get('net') || ''; } catch (e) { return ''; }
  }
  function mode() { return Net.forceMode || flag(); }        // '', 'relay', 'direct'
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function later(fn, ms) { const s = session; const t = setTimeout(() => { if (s === session) fn(); }, ms); timers.push(t); return t; }
  function status(s) { Net.lastStatus = s; if (Net.onStatus) Net.onStatus(s); }
  function topic(code, leaf) { return NS + '/' + code + '/' + leaf; }

  function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  }
  function validCode(c) {
    return c.length === 4 && [...c].every((ch) => ALPHABET.indexOf(ch) >= 0);
  }
  function newCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  function setTransport() {
    const t = directOpen ? 'direct' : (relayLinked ? 'relay' : null);
    const was = Net.transport;
    Net.transport = t;
    Net.ready = !!t;
    if (t !== was && Net.onTransport) Net.onTransport(t);
  }

  // ------------------------------------------------------------ inbound
  function receive(msg, via) {
    if (!msg || !msg.type) return;
    if (Net.peerSid === 'direct' && via === 'direct' && msg.s) Net.peerSid = msg.s;
    if (msg.s && Net.peerSid && msg.s !== Net.peerSid && msg.type !== 'hello') return;
    if (msg.n != null && msg.s) {
      const key = msg.s + ':' + msg.n;
      if (seen.has(key)) { Net.stats.dupes++; return; }
      seen.set(key, 1);
      if (seen.size > 600) seen.delete(seen.keys().next().value);
    }
    Net.stats.recv++;
    lastHeard = Date.now();
    if (via === 'relay') Net.stats.recvRelay++; else Net.stats.recvDirect++;
    switch (msg.type) {
      case 'profile': Net.remote = msg.profile; if (Net.onProfile) Net.onProfile(msg.profile); break;
      case 'start': if (Net.onStart) Net.onStart(msg); break;
      case 'input': if (Net.onInput) Net.onInput(msg); break;
      case 'state':
        if (msg.n != null && msg.n < lastStateN) return; // stale snapshot via the slower path
        lastStateN = msg.n;
        if (Net.onState) Net.onState(msg);
        break;
      case 'event': Net.inbox.push(msg); if (Net.onEvent) Net.onEvent(msg); break;
      case 'bye':
        Net.peerSid = null; relayLinked = false; directOpen = false; setTransport();
        status('The other phone left.');
        if (Net.onClose) Net.onClose();
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------ outbound
  function wire(msg) {
    // compact JSON: 1-decimal numbers, no fields the other side never reads
    return JSON.stringify(msg, (k, v) => {
      if (k === 'loadout' || k === 'ragdoll' || k === 'debris') return undefined;
      if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 10) / 10;
      return v;
    });
  }

  function rawSend(msg) {
    if (directOpen && conn) {
      try { conn.send(msg); Net.stats.sentDirect++; Net.stats.sent++; return; } catch (e) { directOpen = false; setTransport(); }
    }
    if (relayLinked) relayPublish(Net.role === 'host' ? 'g' : 'h', wire(msg));
  }

  function send(msg) {
    if (!Net.ready) return;
    msg.s = Net.sid; msg.n = ++seq;
    rawSend(msg);
  }
  // control messages: on the relay they are repeated (same n, so the far side keeps one copy)
  function sendCritical(msg) {
    if (!Net.ready) return;
    msg.s = Net.sid; msg.n = ++seq;
    rawSend(msg);
    if (Net.transport === 'relay') { later(() => rawSend(msg), 250); later(() => rawSend(msg), 900); }
  }

  function sendProfile(profile) { sendCritical({ type: 'profile', profile }); }
  function sendStart(payload) { sendCritical(Object.assign({ type: 'start' }, payload)); }
  function sendEvent(kind, data) { sendCritical(Object.assign({ type: 'event', kind }, data || {})); }

  const ONE_SHOT = ['jump', 'slide', 'vault', 'roll', 'grab', 'dive', 'gate', 'collapse', 'trapGate', 'trapCollapse', 'tap', 'swipe'];
  function sendInput(input, s, t) {
    if (!Net.ready) return;
    // merge every step; flush on any action at once, otherwise ~12 Hz
    pendingInput = pendingInput || {};
    let action = false;
    for (const k in input) {
      const v = input[k];
      if (v === true) { pendingInput[k] = true; if (k !== 'sprint' && k !== 'hold') action = true; }
      else if (pendingInput[k] !== true) pendingInput[k] = v;
    }
    pendingInput.sprint = !!input.sprint; pendingInput.hold = !!input.hold;
    const now = Date.now();
    const gap = Net.transport === 'direct' ? 16 : (action ? 40 : 80);
    if (now - lastInputFlush < gap) return;
    lastInputFlush = now;
    const out = pendingInput; pendingInput = null;
    send({ type: 'input', input: out, seq: s, t });
  }
  function sendState(state, t) {
    const now = Date.now();
    const gap = Net.transport === 'direct' ? 45 : 62; // ~22 Hz direct, ~16 Hz relay
    if (now - lastStateSent < gap) return;
    lastStateSent = now;
    send({ type: 'state', state, t });
  }

  // ------------------------------------------------------------ relay (MQTT over WSS)
  function mqttLib() { const m = root.mqtt; return m && (m.connect ? m : m.default); }

  function relayStart(onMsg) {
    const lib = mqttLib();
    if (!lib) { Net.lastError = 'relay library missing'; return; }
    BROKERS.forEach((bk) => {
      let c;
      const url = bk.url;
      try {
        c = lib.connect(url, Object.assign({
          clientId: 'cl_' + rid(), clean: true, keepalive: 30, reconnectPeriod: 2000, connectTimeout: 8000,
          protocolVersion: 4,
        }, bk.username ? { username: bk.username, password: bk.password } : {}));
      } catch (e) { return; }
      c._url = url;
      c.on('connect', () => { c._up = true; onMsg('__connect', null, c); });
      c.on('close', () => { c._up = false; });
      c.on('offline', () => { c._up = false; });
      c.on('error', (e) => { Net.lastError = 'relay: ' + (e && e.message || e); });
      c.on('message', (t, payload) => {
        let msg = null;
        const txt = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
        if (!txt) { onMsg(t, null, c); return; }
        try { msg = JSON.parse(txt); } catch (e) { return; }
        onMsg(t, msg, c);
      });
      mqttClients.push(c);
    });
  }
  function relayUp() { return mqttClients.some((c) => c._up); }
  function relayPublish(leaf, text, opts) {
    let ok = false;
    mqttClients.forEach((c) => {
      if (!c._up) return;
      try { c.publish(topic(Net.code, leaf), text, Object.assign({ qos: 0 }, opts || {})); ok = true; } catch (e) { /* */ }
    });
    if (ok) { Net.stats.sentRelay++; Net.stats.sent++; }
    return ok;
  }

  // ------------------------------------------------------------ direct (PeerJS)
  function bindConn(c, onOpen) {
    c.on('open', () => {
      if (conn && conn !== c) { try { conn.close(); } catch (e) { /* */ } }
      conn = c; directOpen = true; setTransport();
      if (onOpen && onOpen() === false) { conn = null; directOpen = false; setTransport(); }
    });
    c.on('data', (msg) => receive(msg, 'direct'));
    c.on('close', () => {
      if (conn === c) { conn = null; directOpen = false; setTransport(); }
      if (!Net.ready && Net.onClose) Net.onClose();
    });
    c.on('error', (e) => { Net.lastError = 'direct: ' + (e && e.type || e); });
  }

  function newPeer(id) {
    if (typeof root.Peer === 'undefined') return null;
    const p = id ? new root.Peer(id, { debug: 0, config: { iceServers: ICE } }) : new root.Peer({ debug: 0, config: { iceServers: ICE } });
    p.on('disconnected', () => {
      // broker socket dropped (phone slept, network change): keep our id
      later(() => { try { if (!p.destroyed && p.disconnected) p.reconnect(); } catch (e) { /* */ } }, 1200);
    });
    return p;
  }

  // ------------------------------------------------------------ host
  function create(cb, attempt) {
    destroy(true);
    const my = ++session;
    attempt = attempt || 0;
    const code = newCode();
    Net.role = 'host'; Net.code = code; Net.sid = 'h' + rid(); Net.peerSid = null;
    let announced = false, done = false;
    const finish = (err) => { if (done) return; done = true; cb && cb(err, code); };
    const retry = () => { if (my !== session) return; if (attempt < 4) create(cb, attempt + 1); else finish(new Error('code-collision')); };

    const linkGuest = (gsid, via) => {
      // one guest per room; a guest that went silent for 15 s can be replaced (e.g. it retried with a fresh session)
      if (Net.peerSid && Net.peerSid !== gsid && Date.now() - lastHeard < 15000) return false;
      if (Net.peerSid !== gsid) { lastHeard = Date.now(); seen = new Map(); }
      Net.peerSid = gsid;
      if (via === 'relay' && !relayLinked) { relayLinked = true; setTransport(); status('linked'); }
      return true;
    };

    if (mode() !== 'direct') {
      relayStart((t, msg, client) => {
        if (my !== session) return;
        if (t === '__connect') {
          client.subscribe([topic(code, 'h'), topic(code, 'room')], { qos: 0 }, () => {
            // a fresh retained room from someone else means the code is taken
            later(() => {
              if (my !== session) return;
              client.publish(topic(code, 'room'), JSON.stringify({ sid: Net.sid, t: Date.now() }), { qos: 1, retain: true });
              if (!announced) { announced = true; finish(null); }
            }, announced ? 0 : 900);
          });
          return;
        }
        if (t === topic(code, 'room')) {
          if (msg && msg.sid && msg.sid !== Net.sid && Date.now() - msg.t < 30 * 60e3 && !announced) retry();
          return;
        }
        if (!msg) return;
        if (msg.type === 'hello') {
          if (!linkGuest(msg.s, 'relay')) {
            relayPublish('g', JSON.stringify({ type: 'busy', to: msg.s }));
            return;
          }
          relayPublish('g', JSON.stringify({ type: 'welcome', s: Net.sid, to: msg.s }));
          return;
        }
        if (msg.s === Net.peerSid && !relayLinked) { relayLinked = true; setTransport(); }
        receive(msg, 'relay');
      });
      // refresh the room so a long wait stays discoverable
      const beat = () => { if (my !== session) return; if (!Net.peerSid) relayPublish('room', JSON.stringify({ sid: Net.sid, t: Date.now() }), { qos: 1, retain: true }); later(beat, 20000); };
      later(beat, 20000);
    }

    if (mode() !== 'relay') {
      peer = newPeer(NS + '-' + code);
      if (peer) {
        peer.on('open', () => { if (mode() === 'direct') finish(null); });
        peer.on('error', (e) => {
          const type = e && e.type;
          Net.lastError = 'direct: ' + type;
          if (type === 'unavailable-id') { retry(); return; }
          if (mode() === 'direct') finish(e);
        });
        peer.on('connection', (c) => {
          const gsid = c.metadata && c.metadata.sid;
          // lock the room only once the data channel really opens
          bindConn(c, () => {
            if (!linkGuest(gsid || 'direct', 'direct')) { try { c.close(); } catch (e) { /* */ } return false; }
            status('linked');
          });
        });
      }
    }

    // if the relay never comes up and direct is off, say so
    later(() => { if (!announced && mode() !== 'direct') { if (peer && peer.open) { announced = true; finish(null); } else if (!relayUp()) finish(new Error('no-network')); } }, 9000);
  }

  // ------------------------------------------------------------ guest
  function join(rawCode, cb) {
    destroy(true);
    const my = ++session;
    const code = normalizeCode(rawCode);
    if (!validCode(code)) { cb && cb(new Error('bad-code'), code); return; }
    Net.role = 'guest'; Net.code = code; Net.sid = 'g' + rid(); Net.peerSid = null;
    const t0 = Date.now();
    let done = false, roomSeen = false, peerMissing = 0, relayUpSeen = false, directSignalled = false;
    const finish = (err) => { if (done) return; done = true; cb && cb(err, code); };

    const linked = () => {
      if (done) return;
      // give the direct channel up to DIRECT_WAIT to open; otherwise go with the relay
      if (directOpen || mode() === 'relay') return finish(null);
      const wait = Math.max(0, DIRECT_WAIT - (Date.now() - t0));
      status(wait ? 'Host found. Opening a direct line…' : 'Host found.');
      later(() => { if (Net.ready) finish(null); }, wait);
    };

    if (mode() !== 'direct') {
      relayStart((t, msg, client) => {
        if (my !== session) return;
        if (t === '__connect') {
          relayUpSeen = true;
          client.subscribe([topic(code, 'g'), topic(code, 'room')], { qos: 0 });
          return;
        }
        if (t === topic(code, 'room')) { if (msg && msg.sid) roomSeen = true; return; }
        if (!msg) return;
        if (msg.type === 'welcome' && msg.to === Net.sid) {
          Net.peerSid = msg.s;
          if (!relayLinked) { relayLinked = true; setTransport(); linked(); }
          return;
        }
        if (msg.type === 'busy' && msg.to === Net.sid) { finish(new Error('room-busy')); return; }
        if (msg.s && msg.s === Net.peerSid) receive(msg, 'relay');
      });
      const hello = () => {
        if (my !== session || relayLinked) return;
        relayPublish('h', JSON.stringify({ type: 'hello', s: Net.sid }));
        later(hello, 1000);
      };
      later(hello, 300);
    }

    if (mode() !== 'relay') {
      peer = newPeer(null);
      const dial = () => {
        if (my !== session || directOpen || !peer || peer.destroyed) return;
        if (!peer.open) { later(dial, 800); return; }
        const missBefore = peerMissing;
        const c = peer.connect(NS + '-' + code, { reliable: true, serialization: 'json', metadata: { sid: Net.sid } });
        later(() => { if (peerMissing === missBefore) directSignalled = true; }, 3500);
        bindConn(c, () => { if (!Net.peerSid) Net.peerSid = 'direct'; linked(); });
      };
      if (peer) {
        peer.on('open', () => dial());
        peer.on('error', (e) => {
          const type = e && e.type;
          Net.lastError = 'direct: ' + type;
          if (type === 'peer-unavailable') { peerMissing++; later(dial, 3000); }
        });
      }
    }

    // progress + honest failure messages
    const tick = () => {
      if (my !== session || done) return;
      const el = Date.now() - t0;
      if (el > JOIN_GIVE_UP) {
        if (directSignalled && !relayUpSeen) finish(new Error('direct-blocked'));
        else if (roomSeen || directSignalled) finish(new Error('host-asleep'));
        else if (!relayUpSeen && !(peer && peer.open)) finish(new Error('no-network'));
        else finish(new Error('not-found'));
        return;
      }
      if (el > 6000) {
        if (directSignalled && !relayLinked) status('Reaching the host… The host must keep the game open on screen.');
        else if (roomSeen) status('Host found but not answering. Keep the game open on the host phone…');
        else if (!relayUpSeen && !(peer && peer.open)) status('No connection to the game servers yet. Check mobile data or Wi-Fi…');
        else status('Host not found yet. Is the host still on the Create screen with code ' + code + '?');
      }
      later(tick, 1000);
    };
    later(tick, 1000);
  }

  function explain(err) {
    const m = String(err && err.message || err || '');
    if (m === 'bad-code') return 'Codes are 4 characters (never O, 0, I or 1). Check the code.';
    if (m === 'not-found') return 'Host not found. Is the host still on the Create screen? Ask them to create a new room and try again.';
    if (m === 'host-asleep') return 'The host’s room exists but their phone is not answering. The host must keep the game open on screen.';
    if (m === 'no-network') return 'Could not reach the game servers. Check mobile data or Wi-Fi.';
    if (m === 'direct-blocked') return 'The phones found each other, but this network blocks direct connections and the relay is unreachable. Switch one phone between Wi-Fi and mobile data and try again.';
    if (m === 'room-busy') return 'That room already has a second player.';
    if (m === 'code-collision') return 'Could not reserve a room code. Try again.';
    return 'Could not connect (' + m + '). Try again, or play solo.';
  }

  // the host phone may sleep while the code is being shared: wake both links when it returns
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      try { if (peer && !peer.destroyed && peer.disconnected) peer.reconnect(); } catch (e) { /* */ }
      mqttClients.forEach((c) => { try { if (!c.connected && !c.reconnecting) c.reconnect(); } catch (e) { /* */ } });
    });
  }

  function destroy(quiet) {
    session++;
    timers.forEach(clearTimeout); timers = [];
    if (!quiet && Net.ready) { try { rawSend({ type: 'bye', s: Net.sid, n: ++seq }); } catch (e) { /* */ } }
    if (Net.role === 'host' && Net.code && mqttClients.length) {
      // clear the retained room announcement
      mqttClients.forEach((c) => { try { if (c._up) c.publish(topic(Net.code, 'room'), '', { qos: 1, retain: true }); } catch (e) { /* */ } });
    }
    const old = mqttClients; mqttClients = [];
    setTimeout(() => old.forEach((c) => { try { c.end(true); } catch (e) { /* */ } }), 300);
    try { if (conn) conn.close(); } catch (e) { /* */ }
    try { if (peer) peer.destroy(); } catch (e) { /* */ }
    peer = null; conn = null; directOpen = false; relayLinked = false;
    Net.ready = false; Net.transport = null; Net.remote = null; Net.peerSid = null;
    seen = new Map(); lastStateN = -1; pendingInput = null;
  }

  const api = { Net, create, join, send, sendProfile, sendStart, sendInput, sendState, sendEvent, destroy, status, explain, normalizeCode, validCode, NS, BROKERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChaseNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
