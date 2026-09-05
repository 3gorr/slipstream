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
export const JOINT_TUPLES: ReadonlyArray<readonly [number, number, number]> = [
  [8, 34, 4], // seg 0   7.9°
  [11, 29, 40], // seg 1  10.3°
  [5, 22, 78], // seg 2  13.9°
  [11, 12.5, 116], // seg 3  15.9°  (steep — unchanged peak)
  [5, 8.0, 180], // seg 4   4.0°  (easing begins)
  [11, 5.5, 244], // seg 5   2.2°
  [5, 4.3, 308], // seg 6   1.1°
  [8, 3.9, 372] // seg 7   0.4°  -> flat run-out
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
export const RUNOUT_END = [8, 3.9, 379] as const
