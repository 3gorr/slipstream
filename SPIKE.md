# Spikes — day 1 (Aug 26)

Three questions that can each kill the project. Rough one-off probes, not game code.

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
dead. New question: can we move the player by forces down the slope smoothly, and
attach the avatar to the rolling sphere frozen in a sitting pose — or do we drop
the avatar entirely and ride a bare sphere?

**Order of checks (day 2):**

1. **First and most important:** is force-driven movement down the slope smooth,
   with no residual hop from the avatar character controller? The spike-A hop may
   have come from the controller's ground-snapping, not only the walk animation.
   If forces down the slope still judder — **say so plainly, that is the key
   finding** and it threatens the whole approach.
2. Attach the avatar the current way: `AAPT_POSITION` is deprecated — **parent to
   `engine.PlayerEntity`** as the protocol recommends, not `AvatarAttach` with a
   position anchor.
3. Fallback ready: if the avatar in the sphere judders, **hide it via
   `AvatarModifierArea`** and ride a bare sphere.

_Status: not started (day 2)._

- Decision B: __
- Force-driven slope movement smooth? (check 1): __
- Avatar attach method + pose freeze: __
- SDK surprises: __

---

## Spike C — does the ghost blob fit in one message?

_Status: not started (day 1, after docs)._

- Full 75 s blob size in bytes (base64): __
- 8 Hz interpolation judder: __
- Decision C — sample rate + final blob size: __

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
