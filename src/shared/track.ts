/**
 * Track layout — pure data, imported by both the client (to build meshes) and,
 * later, the server (checkpoint planes for timing). No engine components here.
 *
 * The chute is defined by points on its ROLLING SURFACE (the top face of the
 * floor). Consecutive joints share an exact point, so segments meet with no step
 * and no gap — only a crease where the pitch changes. Validated in spike B:
 * a force-driven gyrosphere rides this smoothly.
 */
import { Vector3 } from '@dcl/sdk/math'

/** Ghost samples are stored in centimetres from this point. */
export const TRACK_ORIGIN = Vector3.create(8, 0, 4)

export const CHUTE_CENTER_X = 8
/** clear width between the walls, metres */
export const CHUTE_INNER_WIDTH = 8
export const WALL_HEIGHT = 3
export const FLOOR_THICKNESS = 0.5

/** Rolling-surface joints, top → bottom. Segment 0 ≈ 9.96°, segment 1 ≈ 14.40°. */
export const JOINTS: Vector3[] = [
  Vector3.create(8, 34, 4),
  Vector3.create(8, 21, 78),
  Vector3.create(8, 2, 152)
]

/** Flat run-out past the last joint keeps a fast sphere inside parcel bounds. */
export const RUNOUT_END_Z = 160
export const RUNOUT_Y = 2

/** Height of the rolling surface at a given world Z (linear between joints). */
export function surfaceYAt(z: number): number {
  if (z <= JOINTS[0].z) return JOINTS[0].y
  for (let i = 0; i < JOINTS.length - 1; i++) {
    const a = JOINTS[i]
    const b = JOINTS[i + 1]
    if (z <= b.z) return a.y + ((b.y - a.y) * (z - a.z)) / (b.z - a.z)
  }
  return RUNOUT_Y
}

/**
 * Player start — derived from the surface so it can never drift off the track.
 * Sits SPAWN_LIFT metres above the segment-0 floor at SPAWN_Z. Keep
 * scene.json spawnPoints[0] in sync (it cannot import this): currently
 * position (8, 34.1, 8), cameraTarget (8, 26.7, 40).
 */
export const SPAWN_Z = 8
export const SPAWN_LIFT = 0.8
export const SPAWN = Vector3.create(CHUTE_CENTER_X, surfaceYAt(SPAWN_Z) + SPAWN_LIFT, SPAWN_Z)
export const SPAWN_LOOK = Vector3.create(CHUTE_CENTER_X, surfaceYAt(40) - 1, 40)

/** Seconds after a (re)spawn during which the vehicle holds its drive force off
 * so the player settles onto the floor first (see spike B). */
export const SPAWN_GRACE = 0.6

/**
 * Checkpoint plane Z positions for server-side timing (not wired yet).
 * First = start line, last = finish line.
 */
export const CHECKPOINTS_Z = [8, 45, 78, 115, 150]
