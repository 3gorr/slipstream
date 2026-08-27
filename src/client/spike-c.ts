/**
 * SPIKE C — ghost blob codec: size + interpolation.
 *
 * Throwaway probe, heavily instrumented for debugging. Phases are printed to the
 * HUD and console so it is obvious where it stops:
 *
 *   REC n/N        recording
 *   ENCODED …      encode() returned, with byte size
 *   DECODED …      decode() round-trip ok, with sample count
 *   PLAY spawned … ghost entity created, with its position
 *   ERROR …        an exception, with the message (never swallowed)
 *
 * REC_SECONDS is short for debugging — bump it back to RUN_SECONDS (75) for the
 * real size measurement.
 */
import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  ColliderLayer,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4 } from '@dcl/sdk/math'
import {
  RECORD_HZ,
  RUN_SECONDS,
  SAMPLE_BYTES,
  encodeGhost,
  decodeGhost,
  chunkSetBytes,
  type GhostSample,
  type GhostTrack
} from '../shared/codec'
import { hudState } from './spike-c-hud'

const REC_SECONDS = RUN_SECONDS // full 75 s run
const REC_SAMPLES = REC_SECONDS * RECORD_HZ

const TRACK_ORIGIN = Vector3.create(8, 0, 8)
const TWO_PI = Math.PI * 2

type Phase = 'recording' | 'done' | 'error'
let phase: Phase = 'recording'

const samples: GhostSample[] = []
let recAccu = 0
const STEP = 1 / RECORD_HZ

let ghost: Entity | undefined
let track: GhostTrack | undefined
let playT = 0

function setHud(line1: string, line2 = '', error = false) {
  hudState.line1 = line1
  hudState.line2 = line2
  hudState.error = error
}

// ---- setup ----------------------------------------------------------

function buildFloor() {
  const floor = engine.addEntity()
  Transform.create(floor, { position: Vector3.create(8, 0, 8), scale: Vector3.create(32, 0.2, 32) })
  MeshRenderer.setBox(floor)
  MeshCollider.setBox(floor, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(floor, { albedoColor: Color4.create(0.2, 0.2, 0.24, 1) })
}

// ---- record --------------------------------------------------------

function yawOf(qx: number, qy: number, qz: number, qw: number): number {
  return Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qz * qz))
}

function recordSystem(dt: number) {
  if (phase !== 'recording') return
  if (!Transform.has(engine.PlayerEntity)) {
    setHud('WAIT', 'no player transform yet')
    return
  }

  recAccu += dt
  while (recAccu >= STEP && samples.length < REC_SAMPLES) {
    recAccu -= STEP
    const t = Transform.get(engine.PlayerEntity)
    const p = t.position
    const r = t.rotation
    samples.push({
      x: (p.x - TRACK_ORIGIN.x) * 100,
      y: (p.y - TRACK_ORIGIN.y) * 100,
      z: (p.z - TRACK_ORIGIN.z) * 100,
      yaw: yawOf(r.x, r.y, r.z, r.w)
    })
  }

  setHud(`REC ${samples.length}/${REC_SAMPLES}`, `${(samples.length / RECORD_HZ).toFixed(1)}/${REC_SECONDS}s — walk & turn`)

  if (samples.length >= REC_SAMPLES) {
    try {
      finishRecording()
    } catch (e) {
      phase = 'error'
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
      console.log('[CLIENT] spike-c ERROR', msg)
      setHud('ERROR', msg.slice(0, 90), true)
    }
  }
}

function finishRecording() {
  // --- encode ---
  const rawBytes = samples.length * SAMPLE_BYTES
  const chunks = encodeGhost(samples)
  const b64Bytes = chunkSetBytes(chunks)
  const biggest = Math.max(...chunks.map((c) => c.b64.length))
  console.log(
    `[CLIENT] spike-c ENCODED: samples=${samples.length} raw=${rawBytes}B base64=${b64Bytes}B ` +
      `chunks=${chunks.length} biggest=${biggest}B ${b64Bytes < 13000 ? 'FITS' : 'OVER'}`
  )
  setHud(`ENCODED ${b64Bytes} B`, `raw ${rawBytes} B · ${chunks.length} chunk(s) · ${b64Bytes < 13000 ? 'FITS' : 'OVER'}`)

  // --- decode round-trip (explicit, so a QuickJS DataView failure is visible) ---
  const t = decodeGhost(chunks)
  if (t.count < 2) throw new Error(`decode returned ${t.count} samples`)
  // spot-check fidelity against the source
  let maxErr = 0
  for (let i = 0; i < t.count; i++) {
    maxErr = Math.max(maxErr, Math.abs(t.x[i] * 100 - samples[i].x), Math.abs(t.z[i] * 100 - samples[i].z))
  }
  track = t
  console.log(`[CLIENT] spike-c DECODED: ${t.count} samples @ ${t.hz}Hz  maxPosErr=${maxErr.toFixed(2)}cm`)
  setHud(`DECODED ${t.count} samples`, `@ ${t.hz} Hz · maxErr ${maxErr.toFixed(2)} cm`)

  // --- spawn ghost, unmissable, next to the player ---
  const pp = Transform.get(engine.PlayerEntity).position
  const spawnAt = Vector3.create(pp.x + 3, pp.y + 1, pp.z)
  ghost = engine.addEntity()
  Transform.create(ghost, { position: spawnAt, scale: Vector3.create(2, 2, 2) })
  MeshRenderer.setBox(ghost)
  Material.setPbrMaterial(ghost, {
    albedoColor: Color4.create(1, 0.2, 0.6, 1),
    emissiveColor: Color3.create(1, 0.15, 0.5),
    emissiveIntensity: 2
  })
  console.log(`[CLIENT] spike-c PLAY: ghost spawned at (${spawnAt.x.toFixed(1)}, ${spawnAt.y.toFixed(1)}, ${spawnAt.z.toFixed(1)})`)
  setHud('PLAY: ghost spawned', `at (${spawnAt.x.toFixed(1)}, ${spawnAt.y.toFixed(1)}, ${spawnAt.z.toFixed(1)}) · loops`)

  phase = 'done'
  playT = 0
}

// ---- playback (NO allocation in this function) -----------------------
// Catmull-Rom through the samples so the path is a smooth curve, not a polyline.
// If 8 Hz still steps, raise RECORD_HZ in src/shared/codec.ts and re-record.

/** uniform Catmull-Rom: value between p1 and p2 at t in [0,1]. Scalars only. */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

/** Catmull-Rom + soft clamp to the p1..p2 span (+15% slack) to curb overshoot. */
function catmullClamped(p0: number, p1: number, p2: number, p3: number, t: number): number {
  let v = catmull(p0, p1, p2, p3, t)
  const lo = p1 < p2 ? p1 : p2
  const hi = p1 < p2 ? p2 : p1
  const slack = (hi - lo) * 0.15 + 0.02
  if (v < lo - slack) v = lo - slack
  else if (v > hi + slack) v = hi + slack
  return v
}

/** bring an angle delta into (-PI, PI]. Few iterations at most. */
function wrapPi(d: number): number {
  while (d > Math.PI) d -= TWO_PI
  while (d < -Math.PI) d += TWO_PI
  return d
}

function playSystem(dt: number) {
  if (phase !== 'done' || track === undefined || ghost === undefined) return
  const n = track.count
  if (n < 2) return

  const dur = n / track.hz
  playT += dt
  if (playT >= dur) playT -= dur

  const fpos = playT * track.hz
  let s1 = fpos | 0
  if (s1 > n - 1) s1 = n - 1
  const f = fpos - s1
  const s0 = s1 > 0 ? s1 - 1 : 0
  const s2 = s1 < n - 1 ? s1 + 1 : n - 1
  const s3 = s2 < n - 1 ? s2 + 1 : n - 1

  const gx = catmullClamped(track.x[s0], track.x[s1], track.x[s2], track.x[s3], f)
  const gy = catmullClamped(track.y[s0], track.y[s1], track.y[s2], track.y[s3], f)
  const gz = catmullClamped(track.z[s0], track.z[s1], track.z[s2], track.z[s3], f)

  // yaw: unwrap around s1 onto a continuous line, smooth the same way, shortest path
  const b1 = track.yaw[s1]
  const b0 = b1 + wrapPi(track.yaw[s0] - b1)
  const b2 = b1 + wrapPi(track.yaw[s2] - b1)
  const b3 = b2 + wrapPi(track.yaw[s3] - b2)
  const half = catmullClamped(b0, b1, b2, b3, f) * 0.5

  const mt = Transform.getMutable(ghost)
  mt.position.x = TRACK_ORIGIN.x + gx
  mt.position.y = TRACK_ORIGIN.y + gy + 1
  mt.position.z = TRACK_ORIGIN.z + gz
  mt.rotation.x = 0
  mt.rotation.y = Math.sin(half)
  mt.rotation.z = 0
  mt.rotation.w = Math.cos(half)
}

export function startSpikeC() {
  buildFloor()
  engine.addSystem(recordSystem)
  engine.addSystem(playSystem)
  setHud('REC 0/' + REC_SAMPLES, `recording ${REC_SECONDS}s at ${RECORD_HZ} Hz — walk & turn`)
  console.log(`[CLIENT] spike-c START: recording ${REC_SECONDS}s at ${RECORD_HZ} Hz`)
}
