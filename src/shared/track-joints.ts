/**
 * Rolling-surface joints as plain [x, y, z] tuples — the single source of truth
 * for the track shape. Imported by:
 *   - src/shared/track.ts   (builds Vector3 JOINTS, segments, checkpoints)
 *   - scripts/gen-track-glb.mjs   (generates assets/track.glb, the seamless floor)
 *
 * No imports here on purpose, so the plain Node generator script can read it.
 * After editing this, re-run `npm run gen-track`.
 */
// Length pass (Sept 2026): extended past the original seg-3 peak (15.9°) with
// four easing/weave segments instead of a second steep S-bend — keeps every
// turn joint within the already-validated ≤15.9° pitch range (spike B) and
// stays in the same "convex, seamless" regime as the old transition joints
// (SEAM_Z only lists indices 1-3, unaffected by joints appended after them).
// Total track: 158 m -> 380 m (+140%). Needs a live playtest / accelForce
// retune pass — see CLAUDE.md §1 (run duration relaxed to 90-120s for this).
//
// Kicker pass, round 3 (Sept 2026): rounds 1-2 kept easing the tail down to a
// near-flat coast (0.2°/0.2°) before one final kicker — "felt like there's one
// flat section". Redesigned the whole post-peak tail (joints 4-7) for genuine
// variation, no near-flat segment anywhere: 2.0° → 3.6° → 1.2° → 4.5°. Two of
// those STEEPEN going in (2.0°→3.6° into joint5, 1.2°→4.5° into joint7) — same
// kind of transition as the three turn joints (CONCAVE: the shallower slab's
// forward extension rides proud of the next, steeper slab — a soft step-down
// that needs grip). Added joints 5 and 7 to SEAM_Z in track.ts so they get the
// same seamPin treatment, instead of leaving a new concave joint unprotected.
// The other two (15.9°→2.0° into joint4, 3.6°→1.2° into joint6) still EASE —
// CONVEX/seamless, same as before, no pinning needed. All four segments keep
// their existing Z spacing (still 64 m legs) and X weave — only Y changed, so
// CHECKPOINTS_Z / RUNOUT_START_Z / RUNOUT_END_Z / OBSTACLES are untouched.
// Budget: joint3 (peak, Y 12.5, untouched) down to joint7 lands RUNOUT_Y at
// exactly 0 — updated together with RUNOUT_END below and RUNOUT_Y in track.ts
// (these three must be edited as a set).
export const JOINT_TUPLES: ReadonlyArray<readonly [number, number, number]> = [
  [8, 34, 4], // seg 0   7.9°
  [11, 29, 40], // seg 1  10.3°
  [5, 22, 78], // seg 2  13.9°
  [11, 12.5, 116], // seg 3  15.9°  (steep — unchanged peak)
  [5, 10.3, 180], // seg 4   2.0°  (eases — convex)
  [11, 6.3, 244], // seg 5   3.6°  (steepens — CONCAVE, in SEAM_Z)
  [5, 5.0, 308], // seg 6   1.2°  (eases — convex)
  [8, 0, 372] // seg 7   4.5°  (steepens — CONCAVE, in SEAM_Z; kicker -> flat run-out)
]

/** Half the clear lane width, metres. */
export const LANE_HALF = 4
/** Floor slab depth (downward from the rolling surface), metres. */
export const FLOOR_DEPTH = 2
/**
 * The GLB floor ribbon continues flat to here past the last joint.
 * GLB-only (imported solely by scripts/gen-track-glb.mjs) — gameplay uses the
 * separate RUNOUT_END_Z in track.ts. Z stops at 379, a margin inside the
 * scene's new Z=384 outer edge (24 parcels): a mesh whose bbox touches the
 * parcel border is dropped whole by the client (same bug the run-out slab hit
 * at the old Z=160 edge).
 */
export const RUNOUT_END = [8, 0, 379] as const
