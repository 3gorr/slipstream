/**
 * Rolling-surface joints as plain [x, y, z] tuples — the single source of truth
 * for the track shape. Imported by:
 *   - src/shared/track.ts   (builds Vector3 JOINTS, segments, checkpoints)
 *   - scripts/gen-track-glb.mjs   (generates assets/track.glb, the seamless floor)
 *
 * No imports here on purpose, so the plain Node generator script can read it.
 * After editing this, re-run `npm run gen-track`.
 */
export const JOINT_TUPLES: ReadonlyArray<readonly [number, number, number]> = [
  [8, 34, 4], // seg 0   7.9°
  [11, 29, 40], // seg 1  10.3°
  [5, 22, 78], // seg 2  13.9°
  [11, 12.5, 116], // seg 3  15.9°  (steep)
  [8, 5.6, 140], // seg 4   7.5°  (transition)
  [8, 3.9, 153] // → flat run-out
]

/** Half the clear lane width, metres. */
export const LANE_HALF = 4
/** Floor slab depth (downward from the rolling surface), metres. */
export const FLOOR_DEPTH = 2
/** The GLB floor ribbon continues flat to here past the last joint. */
export const RUNOUT_END = [8, 3.9, 160] as const
