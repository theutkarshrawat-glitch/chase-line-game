# Vector reference measurements (v4)

Source: `videos/video2.mp4` (2342×1080, ~120 fps VFR, 83.7 s; gameplay 9 s → 72 s).
Method: frames extracted at 60 fps (1171×540), runner tracked with a dark-silhouette mask,
foreground scroll from phase correlation of blurred Canny edges (runner box masked out),
cross-checked by hand against a wall edge (~400 px/s). Move timings were read off frame
montages at 0.05 s resolution, so treat them as ±0.05 s.

"bh" = body height = standing silhouette height, head to ground (~105 px of 540 ≈ 19.5 % of screen height).

## Vector

| What | Measured |
|---|---|
| Run speed | mode 400–440 px/s ≈ **3.8 bh/s** (≈ 6.8 m/s at 1.8 m) |
| Stride | cycle ≈ 2.3 bh (two steps), **cadence ≈ 1.6–1.7 Hz** per full cycle |
| Camera framing | runner screen-x median **0.42** (IQR 0.41–0.44); feet screen-y median **0.57** (0.52–0.61) |
| Camera vertical | median 8 px/s, p90 212 px/s — it barely moves except on real height changes |
| Standard jump | **0.40–0.55 s** air (12.00→12.52; 17.35→17.75 with tuck) |
| Landing absorb | 0.10–0.15 s, no stop in horizontal speed |
| Long jump | ≈ 0.8 s (15.2→16.0) |
| Kong / dive vault | take-off → legs through ≈ 0.45 s, ≈ 0.65 s total (13.95–14.6); dive vault 25.6→26.3 |
| Step / side vault | ≈ 0.45 s (54.75→55.20) |
| Wall climb (~1.5 bh) | ≈ 0.65 s wall contact → standing (20.05→20.70): foot plant, hands on top 20.15, pull 20.20–20.30, knees up 20.35–20.60 |
| Drop + roll | ≈ 0.35 s roll + 0.25 s get-up |
| Dive + roll | ≈ 1.1 s total: air 0.3, roll 0.35, get-up 0.25 (18.55→19.65) |
| Slide | ≈ 0.6–0.8 s (22.10→22.8) |
| Level end | runs into an interior doorway; the scene cuts after the runner is inside (≈ 71–74 s) |

Feel notes: every move hands its horizontal speed straight to the next one (no stop at
the end of a vault or climb); poses never snap — limbs blend over ~0.1–0.2 s; the camera
holds the runner almost fixed on screen and only drifts vertically on real height changes.

## Chase Line, before → after v4

Measured with `node tools/measure.js <body px>` (perfect autopilot over all tracks).

| What | v3 (before) | v4 (after) | Vector |
|---|---|---|---|
| Drawn body height | 52 px (1.0× collision box) | **65 px** (1.25×) | — |
| Run speed | 5.12 bh/s | **4.09 bh/s** | 3.8 |
| Stride cycle / cadence | 2.46 bh / 2.08 Hz | **2.31 bh / 1.77 Hz** | 2.3 bh / 1.65 Hz |
| Camera runner x / feet y | 0.34 / 0.62 | **0.40 / 0.58**, base zoom H/345 (was H/372) | 0.42 / 0.57 |
| Jump air | 0.68 s | 0.68 s (unchanged, see below) | 0.40–0.55 s |
| Landing | 0.13 s | 0.13 s | 0.10–0.15 s |
| Kong | 0.58 s | 0.52–0.60 s | ≈ 0.65 s |
| Step vault | 0.50 s | 0.48–0.52 s, keeps 90 % speed | ≈ 0.45 s |
| Ledge / climb | 0.55 s, exit 0.55× speed | **0.44–0.55 s**, exit 0.82–0.95× speed | ≈ 0.65 s |
| Roll | 0.43 s | 0.43 s | 0.35 + 0.25 s |
| Slide | 0.58 s | 0.58 s | 0.6–0.8 s |
| Exit door | ran off the end | **0.63–0.67 s ease-out into the doorway + 0.35 s door close** | similar |

Other feel changes in v4:
- Render interpolation: physics stays at a fixed 60 Hz step, positions/phase/move progress
  are interpolated between the last two steps for every displayed frame (60/90/120 Hz screens).
- Pose crossfade 0.11 → 0.16 s with smoothstep easing on every state change.
- Camera ground reference is now smoothed (time-constant ≈ 1/15 s) instead of snapping on landing.
- Input buffering: an "up" swipe made just before a vault/kong/climb/gap zone is held and
  fires the move as soon as the zone becomes active (up 0.42 s, down 0.32 s, roll 0.5 s).
- Moves exit at running speed (vault 0.9×, mantle 0.95×, climb 0.88×) so they chain.

Known difference left: our jump arc is longer (0.68 s vs ≈ 0.5 s). Raising gravity to 580
brought it to 0.62 s but made the AI runner miss more gap plans on some tracks, so it was
reverted; it needs a re-tune of the gap layout to go further.
