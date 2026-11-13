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
python3 -m http.server 8768
```

Open http://127.0.0.1:8768/

```bash
node tools/matchups.js      # physics/AI: zero penetration, no stuck >2s, catch/escape matchups
node tools/sim.js
python3 tools/test-mobile.py
python3 tools/test-multiplayer.py            # two browsers, real PeerJS + MQTT relay; see header for modes
python3 tools/shots.py
```

Barlow Condensed is included under the SIL Open Font License (`fonts/OFL.txt`). PeerJS is vendored.

## v2 movement model

- Real scale: 29 px = 1 m (runner 1.8 m), top run speed 9 m/s, heavy gravity.
- Kinematic swept-AABB collision (X then Y), so nobody tunnels through buildings.
- Interaction zones (gap, vault, kong, climb, duck, wall-run) trigger canned, collision-checked
  moves with IK hand/foot plants. Missing a swipe means a bump, a stumble and lost speed.
- Articulated silhouette rig (`js/rig.js`) with a distance-driven run cycle and cloth on the jacket and tie.
- The camera follows whoever you play, sits on the left third, and zooms with the obstacle ahead
  and with the distance to the rival. When the rival is off screen, an arrow shows where.

## Two-phone play (v3 networking)

Host taps Create and keeps that screen open; guest taps Join and types the 4-character code (any case).
Two transports run at once: DIRECT (PeerJS/WebRTC) and RELAY (MQTT over secure WebSocket via free
public brokers: shiftr.io on 443, EMQX, HiveMQ). If the direct line doesn't open within ~7 s (typical on
mobile data behind carrier NAT), the match runs over the relay. The HUD shows which one is in use.
The host is authoritative; snapshots are ~16 Hz on the relay.

## v4: feel, trap timing, exit door

- **Movement tuned against Vector** (numbers in `docs/vector-measurements.md`): rig drawn 1.25× larger,
  stride cadence 1.77 Hz, Vector-style camera framing, render interpolation between fixed 60 Hz physics
  steps, eased 0.16 s pose crossfades, smoothed camera ground, buffered swipes, moves that keep their speed.
- **Hunter traps charge up**: GATE and COLLAPSE each have a fill ring that charges as the runner nears that
  trap's site, glows when ready, pulses at the best moment (with a haptic tick + sound), and fades once the
  runner is past. A matching marker shows on the trap site in the world (or a badge at the screen edge when
  it is ahead off-screen). The AI hunter uses the same windows.
- **Exit door**: every route ends in a building with an EXIT doorway. The runner runs in, the door slides
  shut, then the results card. Nobody can run past it; the hunter pulls up short of the door.

Checks: `node tools/matchups.js`, `node tools/exit-check.js`, `node tools/measure.js`,
`python3 tools/test-mobile.py`, `python3 tools/test-multiplayer.py`, `python3 tools/shots-v4.py`.
