#!/usr/bin/env python3
"""Two-phone multiplayer end to end: two separate Chrome processes (host + guest) at 844x390 touch,
through the REAL public services (PeerJS broker, MQTT relays).

  python3 tools/test-multiplayer.py [base_url] [relay|direct|'']      # '' = auto (direct, falls back to relay)
  env HOST_OFFLINE=1   host loses its connection while the guest is joining
  env FAKE_DIRECT=1    swap WebRTC for a local stand-in (node tools/fake-direct/bridge.js) to exercise the
                       direct path where UDP is blocked; KILL_DIRECT=1 also drops it mid-match
"""
import sys, time, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8768/"
NET = sys.argv[2] if len(sys.argv) > 2 else ""
import os
FAKE = os.environ.get("FAKE_DIRECT") == "1"; KILL = os.environ.get("KILL_DIRECT") == "1"
URL = BASE + ("?net=" + NET if NET else "")
res = {}; fails = []
def check(name, ok, extra=""):
    print(("OK  " if ok else "FAIL"), name, extra); res[name] = ok
    if not ok: fails.append(name)
SX = """() => { const C = window.__CHASELINE__; const w = C.world(); const L = C.Game.youAre === 'runner' ? w.runner : w.hunter;
  const c = C.cam(); return [((L.x + L.w/2 - c.x) * c.z + innerWidth/2) / innerWidth, ((L.y + L.h/2 - c.y) * c.z + innerHeight/2) / innerHeight, C.Game.youAre]; }"""
def boot(pw, name):
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = b.new_context(viewport={"width": 844, "height": 390}, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_function("() => window.__CHASELINE__ && window.__CHASELINE__.ready")
    if FAKE: pg.evaluate(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fake-direct', 'fakepeer.js')).read())
    pg.evaluate(f"() => {{ localStorage.clear(); window.__CHASELINE__.Prof.create('{name}'); window.__CHASELINE__.show('mode'); }}")
    return b, pg, errs
with sync_playwright() as pw:
    hb, host, herr = boot(pw, "ASHA")     # two separate browser processes
    gb, guest, gerr = boot(pw, "KIRA")
    t0 = time.time()
    host.locator("#btnCreate").tap()
    host.wait_for_function("() => /^[A-Z0-9]{4}$/.test(document.getElementById('roomCode').textContent)", timeout=20000)
    code = host.locator("#roomCode").inner_text(); print("code", code, "after %.1fs" % (time.time()-t0))
    if os.environ.get("HOST_OFFLINE") == "1":
        host.context.set_offline(True); print("  host offline (simulating the host phone switching apps / losing signal)")
    guest.locator("#btnJoin").tap()
    guest.locator("#joinInput").fill(" " + code.lower() + " ")   # lowercase + spaces: must normalise
    t1 = time.time()
    guest.locator("#joinForm button").tap()
    if os.environ.get("HOST_OFFLINE") == "1":
        guest.wait_for_timeout(9000); print("  guest status while host offline:", guest.locator("#roomStatus").inner_text())
        host.context.set_offline(False); print("  host back online")
    try:
        guest.wait_for_function("() => /Linked/.test(document.getElementById('roomStatus').textContent)", timeout=50000)
        linked = True
    except Exception: linked = False
    print("  guest status:", guest.locator("#roomStatus").inner_text())
    check("guest links to host", linked, "%.1fs" % (time.time()-t1))
    if linked:
        tr = guest.evaluate("() => window.ChaseNet.Net.transport"); print("  transport", tr, "host", host.evaluate("() => window.ChaseNet.Net.transport"))
        res["transport"] = tr
        ok = True
        try: host.wait_for_function("() => window.__CHASELINE__.screen() === 'track'", timeout=10000)
        except Exception: ok = False
        check("host gets guest profile -> track select", ok, host.locator("#roomStatus").inner_text())
        check("guest got host profile", "ASHA" in guest.locator("#roomStatus").inner_text(), guest.locator("#roomStatus").inner_text())
        host.locator("#trackGrid .card:not(.is-locked)").first.tap()
        host.wait_for_timeout(400)
        host.locator("#btnGo").tap()
        both = True
        try:
            host.wait_for_function("() => window.__CHASELINE__.screen() === 'play'", timeout=8000)
            guest.wait_for_function("() => window.__CHASELINE__.screen() === 'play'", timeout=8000)
        except Exception: both = False
        check("match starts on both phones", both, str([host.evaluate("() => window.__CHASELINE__.screen()"), guest.evaluate("() => window.__CHASELINE__.screen()")]))
        check("roles: host runner, guest hunter", host.evaluate("() => window.__CHASELINE__.Game.youAre") == "runner" and guest.evaluate("() => window.__CHASELINE__.Game.youAre") == "hunter")
        check("same track", host.evaluate("() => window.__CHASELINE__.Game.trackId") == guest.evaluate("() => window.__CHASELINE__.Game.trackId"))
        print("  HUD tags:", host.locator("#netTag").inner_text(), "/", guest.locator("#netTag").inner_text())
        # guest (hunter) holds sprint; host must see it
        guest.evaluate("() => { window.__gi = setInterval(() => window.__CHASELINE__.input({ sprint: true }), 50); }")
        host.wait_for_timeout(1500)
        spr = host.evaluate("() => window.__CHASELINE__.world().hunter.sprinting")
        check("guest input reaches host (hunter sprinting on host)", bool(spr))
        if KILL:
            host.evaluate("() => window.__killDirect()")
            host.wait_for_timeout(1500)
            tt = [host.evaluate("() => window.ChaseNet.Net.transport"), guest.evaluate("() => window.ChaseNet.Net.transport")]
            check("direct drop mid-match -> both fall back to relay", tt == ["relay", "relay"], str(tt))
            print("  HUD tags after drop:", host.locator("#netTag").inner_text(), "/", guest.locator("#netTag").inner_text())
        cam_bad = []
        for i in range(6):
            host.wait_for_timeout(400)
            for nm, pg, role in (("host", host, "runner"), ("guest", guest, "hunter")):
                fx, fy, who = pg.evaluate(SX)
                if not (0.08 < fx < 0.66 and 0.12 < fy < 0.9) or who != role: cam_bad.append((nm, round(fx,2), round(fy,2), who))
        check("each camera follows its own character", not cam_bad, str(cam_bad[:3]))
        hx = host.evaluate("() => window.__CHASELINE__.world().hunter.x"); gx = guest.evaluate("() => window.__CHASELINE__.world().hunter.x")
        check("guest world tracks host snapshots (hunter x within 60px)", abs(hx - gx) < 60, "%d vs %d" % (hx, gx))
        # guest grabs repeatedly until the hunter catches the (passive) runner
        guest.evaluate("() => { window.__gg = setInterval(() => window.__CHASELINE__.input({ sprint: true, grab: true, dive: true }), 120); }")
        done = True
        try:
            host.wait_for_function("() => window.__CHASELINE__.screen() === 'result'", timeout=60000)
            guest.wait_for_function("() => window.__CHASELINE__.screen() === 'result'", timeout=10000)
        except Exception: done = False
        hr = host.locator("#resTitle").inner_text(); gr = guest.locator("#resTitle").inner_text()
        hs = host.locator("#seriesLine").inner_text(); gs = guest.locator("#seriesLine").inner_text()
        print("  results host:", hr, hs, "| guest:", gr, gs)
        check("results reached on both", done)
        check("results agree", hr == gr and hr in ("CAUGHT", "ESCAPE"))
        hsr = host.evaluate("() => window.__CHASELINE__.Game.series"); gsr = guest.evaluate("() => window.__CHASELINE__.Game.series")
        check("series mirrored", hsr["you"] == gsr["them"] and hsr["them"] == gsr["you"], f"{hsr} / {gsr}")
        # next round: host starts, roles swap on both
        host.locator("#btnRematch").tap()
        ok = True
        try:
            host.wait_for_function("() => window.__CHASELINE__.screen() === 'play'", timeout=8000)
            guest.wait_for_function("() => window.__CHASELINE__.screen() === 'play'", timeout=8000)
        except Exception: ok = False
        check("round 2 starts on both with swapped roles", ok and host.evaluate("() => window.__CHASELINE__.Game.youAre") == "hunter" and guest.evaluate("() => window.__CHASELINE__.Game.youAre") == "runner")
        guest.wait_for_timeout(1500)
        fx, fy, who = guest.evaluate(SX)
        check("round 2: guest camera on its runner", who == "runner" and 0.08 < fx < 0.66, f"{fx:.2f},{fy:.2f}")
        print("  stats host", host.evaluate("() => window.ChaseNet.Net.stats"), "\n  stats guest", guest.evaluate("() => window.ChaseNet.Net.stats"))
    check("no page errors", not herr and not gerr, str((herr + gerr)[:3]))
    hb.close(); gb.close()
print("SUMMARY", json.dumps({"net": NET or "auto", "failed": fails, "transport": res.get("transport")}))
sys.exit(1 if fails else 0)
