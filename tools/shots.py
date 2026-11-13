#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/workspace/game/chaseline/shots")
OUT.mkdir(parents=True, exist_ok=True)
URL = "http://127.0.0.1:8767/"

def ready(page):
    page.wait_for_function("() => window.__CHASELINE__ && window.__CHASELINE__.ready")
    page.wait_for_timeout(400)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", args=["--no-sandbox", "--disable-dev-shm-usage"], headless=True)
    context = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.goto(URL, wait_until="networkidle")
    ready(page)
    page.evaluate("""() => {
      try { localStorage.clear(); } catch (e) {}
    }""")
    page.reload(wait_until="networkidle")
    ready(page)
    page.evaluate("() => window.__CHASELINE__.Prof.create('RAVI')")
    page.evaluate("() => window.__CHASELINE__.show('title')")
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "01-title.png"))
    print("01-title")

    page.evaluate("() => window.__CHASELINE__.show('track')")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "02-track-select.png"))
    print("02-track-select")

    page.evaluate("() => window.__CHASELINE__.grantXp(250)")
    page.evaluate("() => window.__CHASELINE__.show('skills')")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "03-skill-tree.png"))
    print("03-skill-tree")

    page.evaluate("() => { window.__CHASELINE__.startTrack('water-towers', 'runner'); window.__CHASELINE__.skipCountdown(); }")
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / "04-gameplay-runner.png"))
    print("04-gameplay-runner")

    page.evaluate("""() => {
      const P = window.__CHASELINE__.Prof;
      P.unlock('gate'); P.unlock('dive');
      P.update(p => { if (p.loadoutChaser.indexOf('gate')<0) p.loadoutChaser.push('gate'); });
      window.__CHASELINE__.startTrack('crane-row', 'hunter');
      window.__CHASELINE__.skipCountdown();
    }""")
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / "05-hunter-traps.png"))
    print("05-hunter-traps")

    page.evaluate("() => { window.__CHASELINE__.startTrack('water-towers', 'runner'); window.__CHASELINE__.skipCountdown(); window.__CHASELINE__.forceNearMiss(); }")
    page.wait_for_timeout(250)
    page.screenshot(path=str(OUT / "06-near-miss.png"))
    print("06-near-miss")

    page.evaluate("() => window.__CHASELINE__.finish('escape')")
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / "07-results-xp.png"))
    print("07-results-xp")

    browser.close()
print("shots written", OUT)
