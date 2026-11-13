#!/usr/bin/env python3
"""v4 captures + checks. Serve the repo on :8768 first (python3 -m http.server 8768).
Writes shots/v4-*.png (ours), and shots/v4-gameplay.webm. Also asserts the trap HUD
charge states and the exit-door sequence in a real browser."""
import shutil, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shots"
OUT.mkdir(parents=True, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8768/"
VIEW = {"width": 844, "height": 390}
FAIL = []

WAIT = """(cond) => new Promise(r => {
  const C = window.__CHASELINE__;
  const f = new Function('L','w','R','H','z', 'return (' + cond + ')');
  const t0 = performance.now();
  const go = () => {
    const w = C.world(); const L = C.Game.youAre === 'runner' ? w.runner : w.hunter;
    if (f(L, w, w.runner, w.hunter, C.cam().z)) { C.freeze(true); return setTimeout(() => r(true), 150); }
    if (performance.now() - t0 > 60000) return r(false);
    requestAnimationFrame(go);
  };
  go();
})"""

def boot(page):
    page.goto(URL, wait_until="networkidle")
    page.wait_for_function("() => window.__CHASELINE__ && window.__CHASELINE__.ready")
    page.evaluate("() => { localStorage.clear(); window.__CHASELINE__.Prof.create('RAVI'); window.__CHASELINE__.grantXp(900); window.__CHASELINE__.Prof.update((p) => { p.loadoutChaser = ['gate', 'collapse', 'sprint']; }); }")

def start(page, track, role, ap):
    page.evaluate(f"() => {{ const C = window.__CHASELINE__; C.freeze(false); C.startTrack('{track}', '{role}'); C.skipCountdown(); C.autopilot({ap!r}); }}".replace("None", "null"))

def snap(page, name, cond, save=True):
    ok = page.evaluate(WAIT, cond)
    if save:
        page.screenshot(path=str(OUT / f"v4-{name}.png"))
    print(name, "ok" if ok else "TIMEOUT")
    if not ok: FAIL.append(name)
    return ok

def resume(page):
    page.evaluate("() => window.__CHASELINE__.freeze(false)")

BTN = """(id) => { const b = document.getElementById(id); return { cls: b.className, charge: getComputedStyle(b).getPropertyValue('--charge').trim(), dis: b.disabled }; }"""

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", args=["--no-sandbox", "--disable-dev-shm-usage"], headless=True)
    ctx = browser.new_context(viewport=VIEW, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    boot(page)

    # --- ours, for the Vector side-by-sides
    start(page, "water-towers", "runner", "perfect")
    snap(page, "ours-run", "w.elapsed > 2.2 && L.onGround && L.state === 'run' && L.vx > 220 && Math.abs(Math.sin(L.phase)) > 0.9"); resume(page)
    snap(page, "ours-jump", "!L.onGround && L.state !== 'move' && L.vy > -40 && L.vy < 40"); resume(page)
    snap(page, "ours-vault", "L.move && /vault|kong/.test(L.move.type) && L.move.u > 0.38 && L.move.u < 0.55"); resume(page)
    start(page, "water-towers", "runner", "perfect")
    snap(page, "ours-climb", "L.move && /climb|mantle|ledge/.test(L.move.type) && L.move.u > 0.4 && L.move.u < 0.6"); resume(page)
    snap(page, "ours-roll", "L.state === 'roll' && L.stateT > 0.12"); resume(page)
    start(page, "monsoon-alley", "runner", "perfect")
    snap(page, "ours-slide", "L.state === 'slide' && L.stateT > 0.15"); resume(page)

    # --- exit door sequence on every track, plus the daily remix
    tracks = ["water-towers", "crane-row", "the-ledger", "monsoon-alley", "daily"]
    for i, tr in enumerate(tracks):
        start(page, tr, "runner", "perfect")
        # park the AI hunter far behind so every track reaches the door (the hunter-stops-at-door case is in tools/exit-check.js)
        page.evaluate("() => { const C = window.__CHASELINE__; const w0 = C.world(); const park = () => { const w = C.world(); if (w !== w0 || w.over) return; w.hunter.x = Math.min(w.hunter.x, w.runner.x - 900); requestAnimationFrame(park); }; park(); }")
        if not snap(page, f"exit-enter-{tr}", "R.move && R.move.type === 'exit' && R.move.u > 0.55", save=(i == 0)):
            continue
        resume(page)
        ok = snap(page, f"exit-closed-{tr}", "w.exitT > 0.32", save=(i == 0))
        info = page.evaluate("() => { const w = window.__CHASELINE__.world(), E = w.geo.exit; return { result: w.result, inside: w.runner.inside, rx: w.runner.x + w.runner.w, door: E.doorX + E.doorW, hx: w.hunter.x + w.hunter.w, doorX: E.doorX }; }")
        print("  ", tr, json.dumps(info))
        if not (info["inside"] and info["result"] == "escape" and info["rx"] <= info["door"] + 30):
            FAIL.append("exit-geom-" + tr)
        resume(page)
        page.wait_for_timeout(1800)
        scr = page.evaluate("() => window.__CHASELINE__.Game.screen")
        print("   screen after:", scr)
        if i == 0:
            page.screenshot(path=str(OUT / "v4-exit-results.png"))

    # --- trap HUD charge-up as the hunter
    start(page, "water-towers", "hunter", None)
    snap(page, "trap-charging", "w.traps && w.traps.gate.charge > 0.35 && !w.traps.gate.ready")
    s1 = page.evaluate(BTN, "btnGate"); print("   charging:", s1)
    if "is-ready" in s1["cls"] or float(s1["charge"] or 0) < 0.3: FAIL.append("hud-charging")
    resume(page)
    snap(page, "trap-ready", "w.traps.gate.ready && !w.traps.gate.peak")
    s2 = page.evaluate(BTN, "btnGate"); print("   ready:", s2)
    if "is-ready" not in s2["cls"]: FAIL.append("hud-ready")
    resume(page)
    snap(page, "trap-peak", "w.traps.gate.peak")
    s3 = page.evaluate(BTN, "btnGate"); print("   peak:", s3)
    if "is-peak" not in s3["cls"]: FAIL.append("hud-peak")
    resume(page)
    snap(page, "trap-missed", "w.traps.gate.missedT > 0.4", save=False)
    s4 = page.evaluate(BTN, "btnGate"); print("   passed:", s4)
    if "is-ready" in s4["cls"]: FAIL.append("hud-fade")
    resume(page)
    # firing in the window
    start(page, "water-towers", "hunter", None)
    snap(page, "x", "w.traps.gate.peak", save=False); resume(page)
    page.evaluate("() => document.getElementById('btnGate').click()")
    page.wait_for_timeout(400)
    fired = page.evaluate("() => window.__CHASELINE__.world().gates.length")
    print("   gates after tap at peak:", fired)
    page.screenshot(path=str(OUT / "v4-trap-fired.png"))
    if not fired: FAIL.append("trap-fire")
    start(page, "crane-row", "hunter", None)
    snap(page, "trap-collapse", "w.traps.collapse.ready"); resume(page)
    ctx.close()

    # --- gameplay video
    vctx = browser.new_context(viewport=VIEW, device_scale_factor=1, is_mobile=True, has_touch=True,
                               record_video_dir=str(OUT / "_vid"), record_video_size=VIEW)
    vp = vctx.new_page()
    vp.on("pageerror", lambda e: errs.append(str(e)))
    boot(vp)
    start(vp, "water-towers", "runner", "perfect"); vp.wait_for_timeout(47000)
    start(vp, "crane-row", "hunter", "hard"); vp.wait_for_timeout(16000)
    video = vp.video
    vctx.close()
    dest = OUT / "v4-gameplay.webm"
    shutil.move(video.path(), dest)
    shutil.rmtree(OUT / "_vid", ignore_errors=True)
    print("video", dest)
    browser.close()
    print("page errors:", errs)
    print("FAILURES:", FAIL)
    sys.exit(1 if FAIL or errs else 0)
