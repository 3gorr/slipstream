/**
 * Track layout — pure data, imported by the client (to build meshes + wall
 * braking) and later the server (checkpoint planes). No engine components here.
 *
 * The chute is an S-bend: it weaves across the width of the scene (X changes,
 * not only Y) while descending, so steering matters. Each segment is a flat
 * ribbon between two points on the ROLLING SURFACE; consecutive segments share a
 * joint exactly and overlap slightly (SEGMENT_EXTEND) so the mitre corners have
 * no gap. Validated approach: a force-driven gyrosphere rides this smoothly at a
 * moderate steer rate (sharp steering shakes — the track is built for wide,
 * flowing turns).
 */
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { JOINT_TUPLES, LANE_HALF } from './track-joints'

export const CHUTE_CENTER_X = 8
export const HALF_LANE = LANE_HALF
/** clear width between the walls, metres */
export const CHUTE_INNER_WIDTH = LANE_HALF * 2
export const WALL_HEIGHT = 3
export const WALL_THICKNESS = 0.4
/**
 * How far each wall box runs PAST its segment's end, so neighbouring walls
 * overlap instead of leaving a gap. One value can't serve both sides of a turn:
 * on the OUTSIDE the wall ends diverge (gap — need a long tail), on the INSIDE
 * they converge (a long tail just pokes into the lane — the sphere jams on it).
 * So the tail is chosen per wall END by whether that side is inside or outside
 * the turn at that end (see buildSegment in client/track.ts).
 *
 *  - OUTER 1.3: outside of a turn. Covers the widest mitre gap — the sharpest
 *    turn (joint 2, ~18°) separates the wall ends by ~1.3 m; 1.3+1.3 overlaps it.
 *  - INNER 0.4: inside of a turn. The two walls already meet at the shared
 *    joint; 0.4 only kills a hairline corner gap. (Was 2.5 → 1.2 uniform, which
 *    still poked ~0.6 m in at the joint-3 break; 0.4 drops that to ~0.15 m.)
 *  - STRAIGHT 1.0: no turn at that end — in practice only segment 0's back and
 *    the last segment's front (both meet a cap wall / the run-out, plenty).
 */
export const WALL_EXTEND_OUTER = 1.3
export const WALL_EXTEND_INNER = 0.4
export const WALL_EXTEND_STRAIGHT = 1.0

// --- floor (box primitives) ---
// The DCL asset pipeline would not load a generated GLB floor (3 attempts), so
// the floor is box slabs again. assets/track.glb + its generator stay in the
// repo for the art pass.
//
// Thick, so the character controller can't tunnel through a thin rotated slab on
// the first frame after a spawn. Top face still lands on the a-b line (sunk by
// half the thickness along the surface normal).
export const FLOOR_THICKNESS = 2.0
// Extend each slab FORWARD only (never backward past its start joint). At a
// concave joint the shallower slab then rides slightly proud past the joint and
// the sphere steps DOWN onto the next slab (soft, seam-pinned); backward
// extension would instead poke UP into a lip the sphere slams into. Convex
// (transition) joints come out seamless this way. Kept just long enough to also
// close the mitre gap in the FLOOR at the yaw turns (~1.2 m at the wall).
export const FLOOR_FWD_EXTEND = 1.3

/** Ghost samples are stored in centimetres from this point. */
export const TRACK_ORIGIN = Vector3.create(8, 0, 4)

/**
 * Rolling-surface joints, top → bottom. Weaves X 5..11 (so the extended outer
 * walls at the turns stay inside the 16 m-wide parcel column).
 *
 * Segment pitches, joint 0 → joint 7: 7.9° · 10.3° · 13.9° · 2.0° · 3.6° · 1.2°
 * · 4.5°, then the flat run-out. The first three steepen (turn joints, concave);
 * the tail (redesigned in the kicker pass) weaves — every segment has real
 * slope, none near-flat, on purpose: "some more, some less".
 *
 * A JOINT is concave (needs grip — the shallower slab's forward extension rides
 * proud of the next, steeper slab, a soft step-down) iff its outgoing segment is
 * steeper than its incoming one. Checked joint by joint: concave at 1, 2, 4
 * (2.0°→3.6°), 6 (1.2°→4.5°); convex (easing, seamless) at 3 (13.9°→2.0°, the
 * hard length-pass break), 5 (3.6°→1.2°), 7 (4.5°→flat). SEAM_Z below is exactly
 * [1, 2, 4, 6]. (The kicker pass first wrote [1,2,3,5,7] here off a mislabelled
 * pitch table — corrected in the seam-fix pass.)
 *
 * Kicker pass history (Sept 2026): the tail originally eased 15.9°→4.0°→2.2°→
 * 1.1°→0.4°, nearly flat for the last ~190 m — felt like crawling. Round 1
 * reshuffled the fixed joint4→joint7(=RUNOUT_Y, then 3.9) budget into one
 * kicker (~3.1°, budget-capped). Round 2 lowered RUNOUT_Y to 1.5 for a bigger
 * budget (~5.4° kicker), but left joints 5-6 an almost-flat coast — "one
 * section has no tilt". Round 3 (current) redesigned the whole tail for
 * continuous variation instead of a flat coast + single kicker; RUNOUT_Y is
 * now 0. RUNOUT_Y here, joint7 and RUNOUT_END in track-joints.ts are one
 * edited set — keep all three equal.
 *
 * Δyaw at the three turn joints ≈ −14° / +18° / −14°. Edit the shape in
 * src/shared/track-joints.ts, then re-run `npm run gen-track`.
 */
export const JOINTS: Vector3[] = JOINT_TUPLES.map((t) => Vector3.create(t[0], t[1], t[2]))

/** Z where the last easing segment ends and the flat run-out begins. */
export const RUNOUT_START_Z = 372
/** End of the flat run-out. Kept a few metres inside the scene's Z=384 edge
 * (24 parcels) — an entity whose bounding box crosses the parcel boundary is
 * dropped entirely (this was the end-of-track fall-through at the old Z=160
 * edge, now scaled up with the longer track). */
export const RUNOUT_END_Z = 380
/** Y of the flat run-out surface (matches the last joint — see the pitch-profile
 * note above; landed at 0 by the kicker-pass budget, not a special-cased value). */
export const RUNOUT_Y = 0

const WORLD_UP = Vector3.create(0, 1, 0)

export interface TrackSegment {
  a: Vector3
  b: Vector3
  center: Vector3
  /** forward along the segment, normalised */
  dir: Vector3
  /** horizontal, to the right of travel, normalised */
  right: Vector3
  /** surface up, normalised */
  normal: Vector3
  rotation: Quaternion
  len: number
  zLo: number
  zHi: number
}

function makeSegment(a: Vector3, b: Vector3): TrackSegment {
  const delta = Vector3.subtract(b, a)
  const len = Vector3.length(delta)
  const dir = Vector3.normalize(delta)
  const right = Vector3.normalize(Vector3.cross(WORLD_UP, dir)) // horizontal
  const normal = Vector3.normalize(Vector3.cross(dir, right)) // up-ish
  return {
    a,
    b,
    center: Vector3.scale(Vector3.add(a, b), 0.5),
    dir,
    right,
    normal,
    rotation: Quaternion.lookRotation(dir, normal),
    len,
    zLo: Math.min(a.z, b.z),
    zHi: Math.max(a.z, b.z)
  }
}

export const SEGMENTS: TrackSegment[] = (() => {
  const out: TrackSegment[] = []
  for (let i = 0; i < JOINTS.length - 1; i++) out.push(makeSegment(JOINTS[i], JOINTS[i + 1]))
  return out
})()

/**
 * Z of the CONCAVE joints — where the track STEEPENS across the joint, so the
 * forward-extended shallower slab rides proud and leaves a small step-down. The
 * vehicle pins the sphere harder within ±SEAM_ZONE of these. Convex (easing)
 * joints are seamless and not listed.
 *
 * Concave joints, checked against the actual segment pitches
 * (7.9,10.3,13.9,2.0,3.6,1.2,4.5) — a joint is concave iff its outgoing segment
 * is steeper than its incoming one:
 *   joint 1  7.9→10.3   steepens  ✓
 *   joint 2 10.3→13.9   steepens  ✓
 *   joint 3 13.9→2.0    EASES  — convex (was concave in the old tail; the length
 *                                pass flattened it. Removed here: its downward
 *                                pin was pressing the sphere onto the wall
 *                                corner at the break — the seam-fix.)
 *   joint 4  2.0→3.6    steepens  ✓  (added — the kicker pass mislabelled this
 *                                     and put 5/7 here instead; corrected.)
 *   joint 5  3.6→1.2    eases — convex
 *   joint 6  1.2→4.5    steepens  ✓  (added — same correction.)
 *   joint 7  4.5→0.0    eases — convex (flat run-out follows)
 */
export const SEAM_Z: number[] = [1, 2, 4, 6].map((i) => JOINTS[i].z)
export const SEAM_ZONE = 3.5

/** the segment whose Z range contains z (clamped to the ends) */
export function segmentAtZ(z: number): TrackSegment {
  for (const s of SEGMENTS) if (z <= s.zHi) return s
  return SEGMENTS[SEGMENTS.length - 1]
}

/** centreline point (x, y, z) of the rolling surface at world Z */
export function surfacePointAt(z: number): Vector3 {
  const s = segmentAtZ(z)
  let t = (z - s.a.z) / (s.b.z - s.a.z)
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Vector3.add(s.a, Vector3.scale(Vector3.subtract(s.b, s.a), t))
}

/** signed horizontal offset of a position from the centreline (+ = right of travel) */
export function laneOffsetAt(pos: Vector3): number {
  const s = segmentAtZ(pos.z)
  return Vector3.dot(Vector3.subtract(pos, s.a), s.right)
}

/**
 * Centreline point + surface Y, valid on the winding segments AND the straight
 * run-out. Use this (not surfacePointAt) for escape checks that run all the way
 * to the finish.
 */
export function trackCentreAt(z: number): Vector3 {
  if (z >= RUNOUT_START_Z) {
    return Vector3.create(CHUTE_CENTER_X, RUNOUT_Y, z < RUNOUT_END_Z ? z : RUNOUT_END_Z)
  }
  return surfacePointAt(z)
}

/** signed horizontal offset from the centreline, handling the straight run-out */
export function trackOffsetAt(pos: Vector3): number {
  if (pos.z >= RUNOUT_START_Z) return pos.x - CHUTE_CENTER_X
  return laneOffsetAt(pos)
}

// ---- spawn ---------------------------------------------------------

export const SPAWN_ALONG = 6 // metres down segment 0, on the centreline
export const SPAWN_LIFT = 1.2 // metres above the surface, along the surface normal
export const SPAWN_GRACE = 0.6 // seconds of no drive force after a (re)spawn

// SPAWN is on the centreline of segment 0's floor (never near an edge), lifted
// along the surface normal. scene.json spawnPoints[0] must be kept in sync by
// hand (it cannot import this): position (8.51, 34.37, 10.09),
// cameraTarget (10.33, 29.11, 32).
export const SPAWN: Vector3 = Vector3.add(
  Vector3.add(SEGMENTS[0].a, Vector3.scale(SEGMENTS[0].dir, SPAWN_ALONG)),
  Vector3.scale(SEGMENTS[0].normal, SPAWN_LIFT)
)
export const SPAWN_LOOK: Vector3 = Vector3.add(surfacePointAt(SEGMENTS[0].a.z + 28), Vector3.create(0, -1, 0))

/**
 * Static obstacles — vertical pillars the player must steer around, not through.
 * `offset` is signed lateral distance from the centreline (+ = right of travel,
 * same convention as laneOffsetAt/trackOffsetAt). Kept away from SEAM_Z (the
 * concave floor seams already need special pinning) so a dodge never stacks on
 * top of a seam-transition frame — the SEAM_Z Z values are [40, 78, 180, 308]
 * after the seam-fix pass; every Z below clears ±SEAM_ZONE(3.5) of all four
 * (185 and 300 are the tightest, ~1.5 m and ~4.5 m clear). Also kept clear of
 * the spawn/grace area
 * (nothing before Z 50) and the final approach (nothing past Z 350, ahead of
 * the last kicker + flat run-out) so the finish stays a clean sprint. Doubled
 * from 6 to 12 for the full-length track — the original 6 are unchanged, 6 new
 * ones fill the gaps between them. Client builds the mesh + collider in
 * client/track.ts; this is pure placement data.
 */
export interface Obstacle {
  z: number
  offset: number
}
export const OBSTACLES: Obstacle[] = [
  { z: 50, offset: -1.5 },
  { z: 60, offset: 1.2 },
  { z: 100, offset: -2.0 },
  { z: 130, offset: 1.6 },
  { z: 160, offset: 2.0 },
  { z: 185, offset: -1.9 },
  { z: 210, offset: -1.3 },
  { z: 225, offset: 1.7 },
  { z: 270, offset: 1.8 },
  { z: 300, offset: -1.1 },
  { z: 330, offset: -2.1 },
  { z: 350, offset: 1.5 }
]

/**
 * Checkpoint plane Z positions. First = start line, last = finish line (on the
 * flat run-out, ~2 m before the end wall). One per joint (turn + easing), so
 * the longer track keeps the same timing/anti-cheat granularity per metre as
 * before. Used by the client race timer now, server-side timing later.
 */
export const CHECKPOINTS_Z = [8, 40, 78, 116, 180, 244, 308, 378]
