/**
 * Best-run ghost. One export: startGhost().
 *
 *   - while the race is running: record the player transform at RECORD_HZ (8 Hz)
 *     through the shared codec, exactly as spike C did
 *   - on a finish that beat the session best: encode → decode the recording and
 *     keep it as the ghost track
 *   - on the next run: a translucent golden sphere replays that track, starting
 *     in sync with the player, Catmull-Rom interpolated (spike C playback)
 *   - first run (no best yet): no ghost
 *   - F / respawn: the ghost restarts from zero with the player
 *
 * Server-shared ghosts (six of them, from the leaderboard) come later; this is
 * the local self-ghost.
 */
import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  VisibilityComponent,
  MaterialTransparencyMode,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4 } from '@dcl/sdk/math'
import {
  RECORD_HZ,
  MAX_SAMPLES,
  encodeGhost,
  decodeGhost,
  chunkSetBytes,
  type GhostSample,
  type GhostTrack
} from '../shared/codec'
import { TRACK_ORIGIN } from '../shared/track'
import { raceHud } from './race-hud'
import { vehicleState } from './vehicle'

const STEP = 1 / RECORD_HZ
const SPHERE_R = 1.0
const TWO_PI = Math.PI * 2

let ghost: Entity | undefined
let bestTrack: GhostTrack | undefined
let bestMs = Infinity

const recording: GhostSample[] = []
// Both clocks below are "seconds since the launched frame" — identical reference
// for record and playback, so a matched run stays nose-to-nose.
let elapsed = 0
let nextSampleT = 0
let ghostRoll = 0
let ghostPrevX = 0
let ghostPrevZ = 0
let ghostHasPrev = false
let prevLaunched = false
let prevPhase: 'idle' | 'running' | 'finished' = 'idle'
let promotedThisRun = false

// ---- helpers (scalar only — no allocation in playback) --------------

function yawOf(qx: number, qy: number, qz: number, qw: number): number {
  return Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qz * qz))
}
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
function catmullClamped(p0: number, p1: number, p2: number, p3: number, t: number): number {
  let v = catmull(p0, p1, p2, p3, t)
  const lo = p1 < p2 ? p1 : p2
  const hi = p1 < p2 ? p2 : p1
  const slack = (hi - lo) * 0.15 + 0.02
  if (v < lo - slack) v = lo - slack
  else if (v > hi + slack) v = hi + slack
  return v
}
function wrapPi(d: number): number {
  while (d > Math.PI) d -= TWO_PI
  while (d < -Math.PI) d += TWO_PI
  return d
}

// ---- setup ---------------------------------------------------------

function buildGhost() {
  ghost = engine.addEntity()
  Transform.create(ghost, {
    position: Vector3.create(TRACK_ORIGIN.x, -50, TRACK_ORIGIN.z),
    scale: Vector3.create(SPHERE_R * 2, SPHERE_R * 2, SPHERE_R * 2)
  })
  MeshRenderer.setSphere(ghost)
  Material.setPbrMaterial(ghost, {
    albedoColor: Color4.create(1, 0.82, 0.25, 0.16),
    emissiveColor: Color3.create(1, 0.7, 0.15),
    emissiveIntensity: 0.7,
    metallic: 0,
    roughness: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  })
  VisibilityComponent.create(ghost, { visible: false })
}

function setVisible(v: boolean) {
  if (ghost) VisibilityComponent.getMutable(ghost).visible = v
}

function promoteGhost(ms: number) {
  const chunks = encodeGhost(recording)
  bestTrack = decodeGhost(chunks)
  bestMs = ms
  console.log(
    `[CLIENT] ghost: new best ${ms.toFixed(3)}s -> ${bestTrack.count} samples, ${chunkSetBytes(chunks)} B base64`
  )
}

// ---- playback (NO allocation) -------------------------------------

function playAt(t: number) {
  const tr = bestTrack
  if (!tr || !ghost || tr.count < 2) return
  const n = tr.count
  const dur = n / tr.hz
  let pt = t
  if (pt > dur) pt = dur

  const fpos = pt * tr.hz
  let s1 = fpos | 0
  if (s1 > n - 1) s1 = n - 1
  const f = fpos - s1
  const s0 = s1 > 0 ? s1 - 1 : 0
  const s2 = s1 < n - 1 ? s1 + 1 : n - 1
  const s3 = s2 < n - 1 ? s2 + 1 : n - 1

  const gx = TRACK_ORIGIN.x + catmullClamped(tr.x[s0], tr.x[s1], tr.x[s2], tr.x[s3], f)
  const gy = TRACK_ORIGIN.y + catmullClamped(tr.y[s0], tr.y[s1], tr.y[s2], tr.y[s3], f)
  const gz = TRACK_ORIGIN.z + catmullClamped(tr.z[s0], tr.z[s1], tr.z[s2], tr.z[s3], f)

  // yaw — shortest-path unwrapped, same smoothing
  const b1 = tr.yaw[s1]
  const b0 = b1 + wrapPi(tr.yaw[s0] - b1)
  const b2 = b1 + wrapPi(tr.yaw[s2] - b1)
  const b3 = b2 + wrapPi(tr.yaw[s3] - b2)
  const yaw = catmullClamped(b0, b1, b2, b3, f)

  // roll accumulated from ground distance travelled
  if (ghostHasPrev) {
    const dx = gx - ghostPrevX
    const dz = gz - ghostPrevZ
    ghostRoll += Math.sqrt(dx * dx + dz * dz) / SPHERE_R
  }
  ghostPrevX = gx
  ghostPrevZ = gz
  ghostHasPrev = true

  // rotation = yaw(Y) * roll(local X), written inline (no Quaternion objects)
  const sy = Math.sin(yaw * 0.5)
  const cy = Math.cos(yaw * 0.5)
  const sr = Math.sin(ghostRoll * 0.5)
  const cr = Math.cos(ghostRoll * 0.5)

  const mt = Transform.getMutable(ghost)
  mt.position.x = gx
  mt.position.y = gy + SPHERE_R
  mt.position.z = gz
  mt.rotation.x = cy * sr
  mt.rotation.y = sy * cr
  mt.rotation.z = -sy * sr
  mt.rotation.w = cy * cr
}

// ---- system ------------------------------------------------------

function pushSample() {
  const t = Transform.get(engine.PlayerEntity)
  recording.push({
    x: (t.position.x - TRACK_ORIGIN.x) * 100,
    y: (t.position.y - TRACK_ORIGIN.y) * 100,
    z: (t.position.z - TRACK_ORIGIN.z) * 100,
    yaw: yawOf(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
  })
}

function ghostSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return
  const launched = vehicleState.launched
  const phase = raceHud.phase

  // FINISH: crossed the line — freeze, and keep this run if it beat the best.
  if (phase === 'finished' && prevPhase !== 'finished') {
    setVisible(false)
    if (!promotedThisRun && raceHud.last > 0 && raceHud.last <= raceHud.best && recording.length > RECORD_HZ) {
      promoteGhost(raceHud.last)
      promotedThisRun = true
    }
  }
  prevPhase = phase

  // START: the exact frame the post-spawn grace ends (driveSystem set `launched`
  // and applied the first drive force earlier THIS frame). elapsed = 0 here for
  // BOTH the recording and the playback; sample 0 and playAt(0) both happen now.
  if (launched && !prevLaunched) {
    prevLaunched = true
    recording.length = 0
    elapsed = 0
    nextSampleT = STEP
    ghostRoll = 0
    ghostHasPrev = false
    promotedThisRun = false
    setVisible(bestTrack !== undefined)
    pushSample() // sample 0, player at rest at the start line
    if (bestTrack) playAt(0)
    return
  }
  if (!launched && prevLaunched) {
    prevLaunched = false
    setVisible(false)
    return
  }
  if (!launched || phase === 'finished') return

  // advance the shared clock, then record + play against it
  elapsed += dt

  while (elapsed >= nextSampleT && recording.length < MAX_SAMPLES) {
    pushSample()
    nextSampleT += STEP
  }

  if (bestTrack) playAt(elapsed)
}

export function startGhost() {
  buildGhost()
  engine.addSystem(ghostSystem)
  console.log('[CLIENT] ghost ready')
}
