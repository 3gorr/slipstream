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
// four easing/weave segments instead of a second steep S-bend — every joint
// stays within the already-validated ≤15.9° pitch range (spike B).
// Total track: 158 m -> 380 m (+140%). Needs a live playtest / accelForce
// retune pass — see CLAUDE.md §1 (run duration relaxed to 90-120s for this).
//
// Kicker pass, round 3 (Sept 2026): rounds 1-2 eased the tail down to a
// near-flat coast (0.2°/0.2°) before one final kicker — "felt like there's one
// flat section". Redesigned the whole post-peak tail (segments 3-6) for genuine
// variation, no near-flat segment anywhere: 2.0° · 3.6° · 1.2° · 4.5°. The
// steepening joints in this tail (concave, need seamPin) are joint 4 (2.0→3.6)
// and joint 6 (1.2→4.5); joints 3, 5, 7 ease and stay convex. See the joint-by-
// joint check and SEAM_Z in track.ts. All segments keep their existing Z
// spacing (64 m legs) and X weave — only Y changed, so CHECKPOINTS_Z /
// RUNOUT_START_Z / RUNOUT_END_Z / OBSTACLES are untouched. Budget: joint 3
// (Y 12.5, untouched) down to joint 7 lands RUNOUT_Y at exactly 0 — edited as a
// set with RUNOUT_END below and RUNOUT_Y in track.ts.
//
// Seam-fix pass (Sept 2026): rounds above wrote SEAM_Z as [1,2,3,5,7] off a
// mislabelled pitch table — joint 3 kept (now convex, the pin pressed the
// sphere onto a wall corner at the break) and joints 5/7 added instead of the
// real concave 4/6. Corrected to [1,2,4,6]. Also dropped WALL_EXTEND 2.5 -> 1.2
// (track.ts) so segment 2's wall tail stops poking into the lane at joint 3.
// The comment on each row is the pitch of the segment that LEAVES that joint
// (joint N -> joint N+1). "concave" marks a joint whose leaving segment is
// steeper than its arriving one — the ones in SEAM_Z (track.ts).
export const JOINT_TUPLES: ReadonlyArray<readonly [number, number, number]> = [
  [8, 34, 4], //     seg 0  7.9°
  [11, 29, 40], //   seg 1 10.3°   joint 1 concave  (7.9 -> 10.3)
  [5, 22, 78], //    seg 2 13.9°   joint 2 concave  (10.3 -> 13.9)
  [11, 12.5, 116], // seg 3  2.0°   joint 3 CONVEX   (13.9 -> 2.0, the hard length-pass break; X/Y/Z here = the old 15.9° peak point, unchanged)
  [5, 10.3, 180], // seg 4  3.6°   joint 4 concave  (2.0 -> 3.6)
  [11, 6.3, 244], //  seg 5  1.2°   joint 5 convex   (3.6 -> 1.2)
  [5, 5.0, 308], //  seg 6  4.5°   joint 6 concave  (1.2 -> 4.5, the kicker)
  [8, 0, 372] //      (last joint) joint 7 convex   (4.5 -> flat run-out)
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
