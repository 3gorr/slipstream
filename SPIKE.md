# Spikes — day 1 (Aug 26)

Three questions that can each kill the project. Rough one-off probes, not game code.

**Status: all three spikes closed. Recon done.**

- **A — ride feel:** avatar locomotion rejected (jerky hop on slopes). → gyrosphere.
- **B — gyrosphere:** force-driven movement is smooth. → ride the gyrosphere.
- **C — ghost blob:** 8 Hz / ~5.6 KB / 1 chunk / Catmull-Rom, no judder. → locked.

Spike code (`src/client/spike-*.ts`, `spike-*-hud.tsx`, plus the probe wiring in
`src/index.ts`) is kept in history, then removed before the real build starts.

---

## Spike A — does speed feel good?

**What we measured.** Greybox chute (two inclined box segments, ~150 m, seam at
Z=78), avatar accelerated via `AvatarLocomotionSettings` (runSpeed/jogSpeed up to
60), optional extra downward force via Physics API, jump disabled via
`InputModifier`. Live tuning from on-screen buttons. Tested on **desktop client 2.0**.

**Numbers.**
- FPS: **~33 while standing still** on the greybox (High profile). Well under budget.
- Ride feel: avatar on the slope does a **jerky hop — "hopping on one leg"**,
  worst on the steeper segment. Not fixable by speed or by extra gravity —
  a limitation of the avatar walk/locomotion model on inclines (possibly also the
  character controller's ground-snapping, not only the walk animation).
- Wall stick / seam behaviour: not fully characterised — the hop made the ride
  unusable before those mattered.

**Verdict: does NOT work.** Avatar-with-locomotion is out.

**Decision A: rolling sphere (gyrosphere), avatar locked inside — NOT an avatar
with locomotion.** The player is moved by **forces (Physics API)**, not by a
moving platform and not by `movePlayerTo`. The server / codec / ghost architecture
is untouched; only the thing the player controls changes. `AvatarLocomotionSettings`,
Physics-API gravity and the jump `InputModifier` are removed. See CLAUDE.md §3.

**Spike A code** (`src/client/spike-a.ts`, `spike-a-hud.tsx`) is kept in history
as the failed probe, then removed.

---

## Spike B — avatar locked in a rolling gyrosphere

**Redefined after Decision A.** Old framing ("board under the avatar's feet") is
dead. New question: can we move the player by forces down the slope smoothly?

**What we tested.** Code-generated greybox chute, two segments **9.96° then
14.40°**, joints meeting exactly (no step, concave crease at Z=78). Player frozen
(`InputModifier`, explicit `disableWalk/Jog/Run/Jump/DoubleJump/Gliding` — NOT
`disableAll`, which also swallows the action keys). A continuous `Physics` force
(magnitude 120) pushes the player along a heading; A/D rotate the heading. A
translucent emissive sphere mesh (R=1, no collider) is drawn on the player and
rolled visually by distance (`roll += ds/R`). Run-out floor + end/back walls keep
the player in bounds so respawn (`movePlayerTo`, F/E key) always has an in-bounds
player. Tested on **desktop client 2.0**, `HIDE_AVATAR=true` (bare sphere), and a
**fixed side observer camera** (`FOLLOW_CAM=false`) that does not track the player.

**Result.** From the fixed observer camera, the sphere rides down the 9.96° /
14.40° slope **smoothly**. **No ground-snapping hop in the movement itself.** The
judder seen earlier was **camera jitter** from per-frame repositioning of the
follow camera in `driveSystem`, not the motion.

**Verdict: works.** Force-driven gyrosphere movement is smooth.

**Decision B: ride the gyrosphere.** Confirmed — proceed on this basis.

**Open tails (cosmetic, NOT blockers):**

1. **Follow-camera jitter.** The back-and-above camera repositioned every frame in
   `driveSystem` visibly jitters. Fix with smoothing / update-order (run the
   camera system after physics) / parenting the camera rig to the player. Movement
   underneath is fine.
2. **Avatar pose in the sphere.** Not yet validated with the avatar visible
   (`HIDE_AVATAR=false`). Need to check whether the sitting emote holds under
   force-driven motion and freeze the pose if not. Three options already scoped:
   (a) hide the real avatar + parent a static seated mesh to `engine.PlayerEntity`;
   (b) `triggerSceneEmote({ src, loop: true })` with a custom one-frame
   `*_emote.glb`; (c) real avatar + re-trigger on `AvatarEmoteCommand`
   `ES_INTERRUPTED`.

**SDK surprises (spike B):**
- `InputModifier` `disableAll: true` also blocks the **action keys** (F/E =
  `IA_SECONDARY`/`IA_PRIMARY`). Use explicit per-mode flags to keep them live.
- `movePlayerTo` silently no-ops when the **player is out of scene bounds** (not
  just the target). A gyrosphere that escapes the track makes respawn dead — must
  physically contain the player.
- `VirtualCamera.create(cam, {})` with **no `lookAtEntity`** uses the entity's
  own `Transform` (position + rotation) and stays put — the way to do a fixed
  observer cam.

---

## Spike C — does the ghost blob fit in one message?

**Codec.** `src/shared/codec.ts`. 7-byte sample (x/y/z `int16` cm from track
start, LE; `yaw` `uint8` = 1/256 turn). `encodeGhost` → `GhostChunk[]` with
`{ v, seq, total, hz, n, b64 }` headers from day one; `decodeGhost` reassembles
by `seq` into a flat `GhostTrack` (`Float32Array` per axis, metres). Hand-rolled
base64 (QuickJS has no `Buffer` / reliable `atob`). Playback system in
`src/client/spike-c.ts` does **zero allocation per frame** — reads the typed
arrays, lerps position + shortest-path yaw, writes straight into the mutable
`Transform` fields (pure-yaw quaternion built from `Math.sin/cos`).

**Size — measured** (600 samples = 8 Hz × 75 s):

| | bytes |
|---|---|
| raw payload | **4200** |
| base64 | **5600** |
| full message JSON (`{v,seq,total,hz,n,b64}`) | **5649** |
| chunks | **1** |
| 13 KB message limit | **FITS**, ~2.3× headroom |

Round-trip error: position ≤ 0.50 cm (the 1 cm quantisation), yaw ≤ 0.70°
(360/512). Negligible.

Higher sample rates, if 8 Hz interpolation judders — all still a single chunk,
all under 13 KB:

| rate | samples | base64 |
|---|---|---|
| 10 Hz | 750 | 7000 B |
| 12 Hz | 900 | 8400 B |
| 16 Hz | 1200 | 11200 B |

**8 Hz interpolation judder:** **none.** The ghost box appears, loops the recorded
run beside the player, and slides smoothly. Playback uses **Catmull-Rom** through
the samples (position per axis + shortest-path unwrapped yaw), with a soft clamp
to the p1..p2 span (+15%) to curb overshoot on sharp turns. Zero allocation per
frame — the interp helpers are module-level scalar functions, the system only
reads the typed arrays and writes mutable `Transform` fields.

**Decision C: 8 Hz, ~5.6 KB base64, 1 chunk, Catmull-Rom playback interpolation.**
No judder, huge headroom under the 13 KB message limit. Chunk plumbing
(`seq`/`total`) is in place for the day it's needed; nothing to revisit.

**SDK surprises (spike C):**
- QuickJS runtime: no `Buffer`, no dependable `atob`/`btoa` → base64 is
  hand-rolled over `Uint8Array`.
- `DataView` over `new Uint8Array(n).buffer` for LE int16 packing — needs a
  runtime confirm on the desktop client (build + types are fine).

---

## SDK surprises (hand to the team)

- `sdk-commands init` **overwrites `CLAUDE.md` and `.gitignore`** with template
  copies, and dumps `.cursor/`, `.github/`, `dclcontext/`, `images/`. Restore with
  `git checkout` after init.
- **auth-server SDK branch = 7.26.1**, below the 7.27 CLAUDE.md §5 wants for
  desktop/mobile UI scale parity. Watch on the mobile pass.
- Composite component `core-schema::Name` is **undefined in the auth-server
  build's composite provider** → build error. `main.composite` left empty; spike
  geometry is code-generated (deliberate for spikes; the real game must solve
  this before following §4's composite-first rule).
- Composite `box` mesh needs `"box": { "uvs": [] }`; empty `{}` crashes the build.
- `registerMessages()` takes a flat `{ name: Schema }` map, not `{ request, response }`.
- **`AvatarLocomotionSettings` has no gravity field** — walkSpeed / jogSpeed /
  runSpeed / jumpHeight / runJumpHeight / doubleJumpHeight / glidingSpeed /
  glidingFallingSpeed / hardLandingCooldown only. Player "gravity" can only be
  faked with a continuous Physics force.
- `InputModifier` **has no effect in the web browser explorer** — desktop 2.0 and
  the mobile app only.
- Touch-controls component is **`TouchScreenControls`** (confirmed — not
  `ScreenControlsComponent`), SDK 7.26.0+, set on `engine.RootEntity`.
- `AvatarAttach` "position anchor" `AAPT_POSITION` is **deprecated**; protocol
  recommends parenting to `engine.PlayerEntity` instead. Relevant to spike B.
- Opening the project in Creator Hub rewrites `scene.json` (adds `nearbyVoiceChat`,
  `landscapeTerrain`, `source`, `skyboxConfig`) and fills `main.composite` with
  `inspector::*` metadata. Expected — don't revert.
