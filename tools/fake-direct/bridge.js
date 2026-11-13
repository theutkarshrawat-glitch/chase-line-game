// Stand-in for the PeerJS broker + WebRTC data channel (the box has no UDP). Routes fake-peer traffic between two browsers.
const { WebSocketServer } = require('ws') // npm i ws;
const wss = new WebSocketServer({ port: 18793 });
const reg = new Map();
wss.on('connection', (ws) => {
  ws.on('message', (buf) => {
    const m = JSON.parse(String(buf));
    if (m.kind === 'register') { ws.id = m.id; reg.set(m.id, ws); return; }
    if (m.kind === 'killall') { for (const s of reg.values()) s.send(JSON.stringify({ kind: 'killall' })); return; }
    const to = reg.get(m.to);
    if (!to) { if (m.kind === 'connect') ws.send(JSON.stringify({ kind: 'unavailable' })); return; }
    to.send(JSON.stringify(m));
  });
  ws.on('close', () => { if (ws.id) reg.delete(ws.id); });
});
console.log('bridge on 18793');
