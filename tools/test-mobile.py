#!/usr/bin/env python3
"""Landscape 844x390 touch smoke tests for CHASE LINE."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8768/"
logs, errors, failed = [], [], 0

def attach(page):
    page.on("console", lambda m: logs.append({"type": m.type, "text": m.text}))
    page.on("pageerror", lambda e: errors.append(str(e)))

def ready(page):
    page.wait_for_function("() => window.__CHASELINE__ && window.__CHASELINE__.ready")
    page.wait_for_timeout(200)

def check(name, cond):
    global failed
    print(("OK  " if cond else "FAIL"), name)
    if not cond:
        failed += 1

def main():
    global failed
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--no-sandbox", "--disable-dev-shm-usage"], headless=True)
        context = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = context.new_page()
        attach(page)
        page.goto(URL, wait_until="networkidle")
        ready(page)

        vp = page.viewport_size
        check("viewport 844x390", vp == {"width": 844, "height": 390})
        check("has touch", page.evaluate("() => navigator.maxTouchPoints > 0"))
        check("title visible", page.locator("#titleScreen").is_visible())
        check("title text", "CHASE LINE" in (page.locator(".brand").first.inner_text() or ""))

        page.evaluate("""() => {
          try { localStorage.clear(); } catch (e) {}
        }""")
        page.reload(wait_until="networkidle")
        ready(page)

        page.locator("#btnPlay").tap()
        page.wait_for_timeout(200)
        check("name or mode", page.evaluate("() => window.__CHASELINE__.screen()") in ("name", "mode"))
        if page.evaluate("() => window.__CHASELINE__.screen()") == "name":
            page.locator("#nameInput").fill("RAVI")
            page.locator("#nameForm button").tap()
            page.wait_for_timeout(200)
        check("mode screen", page.evaluate("() => window.__CHASELINE__.screen()") == "mode")

        page.evaluate("() => window.__CHASELINE__.show('skills')")
        page.wait_for_timeout(200)
        check("skill tree", page.locator("#skillScreen").is_visible())
        check("locked tiers shown", "LOCKED" in page.locator("#skillScreen").inner_text())
        check("wall-run listed", "WALL-RUN" in page.locator("#skillScreen").inner_text().upper())

        page.evaluate("() => window.__CHASELINE__.show('track')")
        page.wait_for_timeout(200)
        check("track select", page.locator("#trackScreen").is_visible())
        txt = page.locator("#trackScreen").inner_text()
        check("rooftops tracks", "WATER TOWERS" in txt.upper() and "CRANE ROW" in txt.upper())
        check("locked districts", "NIGHT MARKET" in txt.upper() and "LOCKED" in txt.upper())
        check("monsoon playable", "MONSOON" in txt.upper())

        page.evaluate("() => window.__CHASELINE__.startTrack('water-towers', 'runner')")
        page.wait_for_timeout(200)
        page.evaluate("() => window.__CHASELINE__.skipCountdown()")
        page.wait_for_timeout(300)
        check("play screen", page.evaluate("() => window.__CHASELINE__.screen()") == "play")
        check("world running", page.evaluate("() => !!(window.__CHASELINE__.world())"))

        # swipe up to jump
        box = page.locator("#view").bounding_box()
        check("canvas", box is not None)
        if box:
            page.evaluate(
                """([x1,y1,x2,y2]) => {
                  const el = document.getElementById('view');
                  el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:x1, clientY:y1, pointerId:1, pointerType:'touch'}));
                  window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:x2, clientY:y2, pointerId:1, pointerType:'touch'}));
                }""",
                [box["x"] + 200, box["y"] + 250, box["x"] + 200, box["y"] + 80],
            )
            page.wait_for_timeout(200)
        # also fire API jump to be sure
        page.evaluate("() => window.__CHASELINE__.input({jump:true, vault:true})")
        page.wait_for_timeout(180)
        st = page.evaluate("() => window.__CHASELINE__.world() && window.__CHASELINE__.world().runner.state")
        vx = page.evaluate("() => window.__CHASELINE__.world() && window.__CHASELINE__.world().runner.vx")
        check("runner gained speed", (vx or 0) > 20)
        print("  state", st, "vx", vx)

        page.evaluate("() => window.__CHASELINE__.forceNearMiss()")
        page.wait_for_timeout(100)
        check("near-miss slow-mo", page.evaluate("() => window.__CHASELINE__.world().scale < 0.9"))

        page.evaluate("() => window.__CHASELINE__.finish('escape')")
        page.wait_for_timeout(800)
        check("results", page.evaluate("() => window.__CHASELINE__.screen()") == "result")
        check("xp teaser", len(page.locator("#teaser").inner_text()) > 8)

        # hunter traps visible
        page.evaluate("() => { window.__CHASELINE__.startTrack('crane-row', 'hunter'); window.__CHASELINE__.skipCountdown(); }")
        page.wait_for_timeout(250)
        check("hunter traps", page.locator("#traps").evaluate("el => el.classList.contains('is-on')"))

        # v2: camera frames the LOCAL character in both roles
        SX = """() => { const C = window.__CHASELINE__; const w = C.world(); const L = C.Game.youAre === 'runner' ? w.runner : w.hunter;
                         const c = C.cam(); const sx = (L.x + L.w / 2 - c.x) * c.z + innerWidth / 2; const sy = (L.y + L.h / 2 - c.y) * c.z + innerHeight / 2;
                         return [sx / innerWidth, sy / innerHeight, C.Game.youAre]; }"""
        for role, track in (("runner", "water-towers"), ("hunter", "crane-row")):
            page.evaluate(f"() => {{ const C = window.__CHASELINE__; C.startTrack('{track}', '{role}'); C.skipCountdown(); C.autopilot('normal'); }}")
            worst = 0
            for i in range(12):
                page.wait_for_timeout(500)
                fx, fy, who = page.evaluate(SX)
                if not (0.12 < fx < 0.62 and 0.15 < fy < 0.88) or who != role: worst += 1
            check(f"camera follows local {role} (6s sampled)", worst == 0)

        # v2: the hunter AI catches a passive runner, with a takedown beat before results
        page.evaluate("() => { const C = window.__CHASELINE__; C.startTrack('water-towers', 'runner'); C.skipCountdown(); C.autopilot(null); }")
        caught = page.evaluate("""() => new Promise(r => { const C = window.__CHASELINE__; const t0 = performance.now();
            const go = () => { const w = C.world(); if (w.result === 'catch') return r(true); if (performance.now() - t0 > 15000) return r(false); requestAnimationFrame(go); }; go(); })""")
        check("hunter catches passive runner", caught)
        page.wait_for_timeout(2500)
        scr = page.evaluate("() => [window.__CHASELINE__.screen(), window.__CHASELINE__.world()._overT]")
        print("  after catch", scr)
        check("catch -> results", scr[0] == "result")

        # two-phone networking lives in tools/test-multiplayer.py
        browser.close()

    Path("/tmp/chaseline-test-logs.json").write_text(json.dumps({"logs": logs, "errors": errors}, indent=2))
    for e in errors:
        print("PAGEERROR", e)
        failed += 1
    if failed:
        print("FAILED", failed)
        sys.exit(1)
    print("All mobile tests passed.")

if __name__ == "__main__":
    main()
