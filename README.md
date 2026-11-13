# CHASE LINE

A rooftop parkour chase. You run, or you hunt. Best of three, roles swap, and every match earns parkour you can take to the next phone you meet.

**Play:** https://theutkarshrawat-glitch.github.io/chase-line-game/

## How to play

- Turn the phone on its side.
- The runner auto-runs. Swipe up to jump, vault, or wall-run (if equipped). Swipe down to slide or roll a hard landing.
- The hunter uses the same movement, plus **Sprint**, **Grab**, and trap buttons: **GATE** slams a fence ahead, **COLLAPSE** drops a roof.
- Rounds last 60 seconds. Reach the finish, or survive the clock, to escape. A catch ends the chase.
- Skills unlock with XP and stay on this phone. When two players meet, each brings their own tree. New moves are risk and reward, not flat upgrades.

## Modes

- **Solo vs AI** — always playable, difficulty scales with your rank.
- **Create / Join Match** — a four-character room code over WebRTC (PeerJS). The host simulates; the guest sends inputs.
- **Pass and Play** — hand the phone over between rounds.
- **Daily Chase** — a date-seeded remix of the water towers.

## Run locally

```bash
python3 -m http.server 8767
```

Open http://127.0.0.1:8767/

```bash
python3 tools/test-mobile.py
python3 tools/shots.py
```

Barlow Condensed is included under the SIL Open Font License (`fonts/OFL.txt`). PeerJS is vendored.
