#!/usr/bin/env python3
"""v2 screenshot + gameplay video capture. Serve the repo on :8768 first
(python3 -m http.server 8768). Writes shots/v2-*.png and shots/v2-gameplay.webm."""
import shutil, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shots"
OUT.mkdir(parents=True, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8768/"
VIEW = {"width": 844, "height": 390}

WAIT = """(cond) => new Promise(r => {
  const C = window.__CHASELINE__;
  const f = new Function('L','w','R','H','z', 'return (' + cond + ')');
  const t0 = performance.now();
  const go = () => {
    const w = C.world(); const L = C.Game.youAre === 'runner' ? w.runner : w.hunter;
    if (f(L, w, w.runner, w.hunter, C.cam().z)) { C.freeze(true); return setTimeout(() => r(true), 150); }
    if (performance.now() - t0 > 50000) return r(false);
    requestAnimationFrame(go);
  };
  go();
})"""

def boot(page):
    page.goto(URL, wait_until="networkidle")
    page.wait_for_function("() => window.__CHASELINE__ && window.__CHASELINE__.ready")
    page.evaluate("() => { localStorage.clear(); window.__CHASELINE__.Prof.create('RAVI'); window.__CHASELINE__.grantXp(900); }")

def start(page, track, role, ap):
    page.evaluate(f"() => {{ const C = window.__CHASELINE__; C.freeze(false); C.startTrack('{track}', '{role}'); C.skipCountdown(); C.autopilot({ap!r}); }}".replace("None", "null"))

def snap(page, name, cond):
    ok = page.evaluate(WAIT, cond)
    page.screenshot(path=str(OUT / f"v2-{name}.png"))
    print(name, "ok" if ok else "TIMEOUT (captured anyway)")
    page.evaluate("() => window.__CHASELINE__.freeze(false)")
    return ok

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", args=["--no-sandbox", "--disable-dev-shm-usage"], headless=True)
    ctx = browser.new_context(viewport=VIEW, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    boot(page)
    page.evaluate("() => window.__CHASELINE__.show('title')")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / "v2-title.png")); print("title")

    start(page, "water-towers", "runner", "perfect")
    snap(page, "run", "w.elapsed > 2.2 && L.onGround && L.state === 'run' && L.vx > 220 && Math.abs(Math.sin(L.phase)) > 0.9")
    snap(page, "vault", "L.move && /vault|kong/.test(L.move.type) && L.move.u > 0.38 && L.move.u < 0.55")
    start(page, "water-towers", "runner", "perfect")
    snap(page, "climb", "L.move && /climb|mantle|ledge/.test(L.move.type) && L.move.u > 0.45 && L.move.u < 0.62")
    start(page, "crane-row", "runner", "perfect")
    snap(page, "zoom-gap", "w.elapsed > 3 && !L.onGround && L.state !== 'move' && z < " + "0.85 * (390 / 372)")
    start(page, "crane-row", "hunter", "hard")
    snap(page, "hunter-camera", "w.elapsed > 6.5 && L.onGround")
    start(page, "water-towers", "runner", None)
    snap(page, "takedown", "H.state === 'takedown' && H.stateT > 0.35")
    ctx.close()

    # gameplay video: runner with perfect autopilot, then a round as the hunter
    vctx = browser.new_context(viewport=VIEW, device_scale_factor=1, is_mobile=True, has_touch=True,
                               record_video_dir=str(OUT / "_vid"), record_video_size=VIEW)
    vp = vctx.new_page()
    vp.on("pageerror", lambda e: errs.append(str(e)))
    boot(vp)
    vp.evaluate("() => window.__CHASELINE__.show('title')"); vp.wait_for_timeout(2500)
    start(vp, "water-towers", "runner", "perfect"); vp.wait_for_timeout(22000)
    start(vp, "crane-row", "hunter", "hard"); vp.wait_for_timeout(14000)
    video = vp.video
    vctx.close()
    dest = OUT / "v2-gameplay.webm"
    shutil.move(video.path(), dest)
    shutil.rmtree(OUT / "_vid", ignore_errors=True)
    print("video", dest)
    browser.close()
    print("page errors:", errs)
