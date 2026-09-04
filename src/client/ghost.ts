/**
 * Ghosts. One export: startGhost().
 *
 *   - SELF ghost: the player's own best run this session. Recorded live at
 *     RECORD_HZ, encoded→decoded through the shared codec on a finish that beat
 *     the session best, then replayed as a translucent GOLD sphere. Not shown
 *     until a best exists.
 *   - RIVAL ghosts: BAKED_GHOSTS (src/shared/bakedGhosts.ts), decoded once at
 *     start, replayed as translucent BLUE spheres. A COLD-SERVER STAND-IN only:
 *     shown while no live ghost has arrived, hidden from the next run on once one
 *     has (`hasLiveGhosts`). Lane offset is baked into the samples — playback
 *     adds NOTHING, it plays the track as-is.
 *   - LIVE ghosts (B2): up to LIVE_N translucent GREEN spheres, the server's
 *     top-N real runs ranked by time. Slots fill from `liveGhost` messages; an
 *     unfilled slot stays hidden. Once any arrive they REPLACE the baked rivals
 *     (1..3 live, no baked top-up). Names come straight from the message.
 *
 * All ghosts share one clock: `elapsed` seconds since the `launched` frame (grace
 * over, player released). Every ghost starts playback at elapsed 0, so a matched
 * run stays nose-to-nose. F / respawn restarts them all with the player.
 *
 * Playback (playAt) does ZERO allocation per frame — all scalar (§6). Next art
 * step: one shared low-poly silhouette mesh + name billboards instead of spheres.
 */
import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  TextShape,
  Billboard,
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
  type GhostTrack,
  type GhostChunk
} from '../shared/codec'
import { TRACK_ORIGIN } from '../shared/track'
import { BAKED_GHOSTS } from '../shared/bakedGhosts'
import { raceHud } from './race-hud'
import { vehicleState } from './vehicle'
import { room } from '../shared/messages'
import { racerName } from './net'

const STEP = 1 / RECORD_HZ
const SPHERE_R = 1.0
const TWO_PI = Math.PI * 2
const LABEL_Y = 1.8 // metres above the sphere centre — clears the sphere, stays off the track

interface GhostPlayer {
  entity: Entity
  /** which pool this ghost belongs to — decides the baked-vs-live visibility rule */
  kind: GhostKind
  /** floating name tag above the sphere (TextShape + Billboard), positioned by hand each frame */
  label: Entity
  /** display name — "" for the self ghost (no tag), the rival's name otherwise.
   *  Read straight from this field; the server will fill it with real player names. */
  name: string
  /** decoded track, or undefined for the self ghost until a best run exists */
  track: GhostTrack | undefined
  roll: number
  prevX: number
  prevZ: number
  hasPrev: boolean
  visible: boolean
}

/** as many live-ghost slots as baked rivals — the server's top-N by run time */
const LIVE_N = 3

/** ghosts[]: [0] self ghost, then the baked rivals, then LIVE_N green live-ghost
 *  slots. A live slot has no track until a liveGhost message fills it. */
const ghosts: GhostPlayer[] = []
let selfGhost: GhostPlayer
const liveGhosts: GhostPlayer[] = []
/** how many live slots the last server batch actually filled (0..LIVE_N) */
let liveCount = 0
/** sticky for the session: true once at least one real live ghost has arrived.
 *  While false the baked rivals stand in (cold / empty / silent server); once
 *  true the baked rivals are hidden and only the live ghosts race. */
let hasLiveGhosts = false

let bestMs = Infinity

const recording: GhostSample[] = []
// "seconds since the launched frame" — one clock for record + every playback.
let elapsed = 0
let nextSampleT = 0
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

// self = gold (your own best), rival = blue (baked), live = green (a real run
// that just came back from the server — green so it is obvious in testing).
type GhostKind = 'self' | 'rival' | 'live'
const GHOST_MATERIAL: Record<GhostKind, Parameters<typeof Material.setPbrMaterial>[1]> = {
  self: {
    albedoColor: Color4.create(1, 0.82, 0.25, 0.16),
    emissiveColor: Color3.create(1, 0.7, 0.15),
    emissiveIntensity: 0.7,
    metallic: 0,
    roughness: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  },
  rival: {
    albedoColor: Color4.create(0.3, 0.55, 1, 0.16),
    emissiveColor: Color3.create(0.25, 0.5, 1),
    emissiveIntensity: 0.6,
    metallic: 0,
    roughness: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  },
  live: {
    albedoColor: Color4.create(0.3, 1, 0.45, 0.16),
    emissiveColor: Color3.create(0.2, 1, 0.4),
    emissiveIntensity: 0.7,
    metallic: 0,
    roughness: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  }
}

function buildGhostSphere(kind: GhostKind): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(TRACK_ORIGIN.x, -50, TRACK_ORIGIN.z),
    scale: Vector3.create(SPHERE_R * 2, SPHERE_R * 2, SPHERE_R * 2)
  })
  MeshRenderer.setSphere(e)
  Material.setPbrMaterial(e, GHOST_MATERIAL[kind])
  VisibilityComponent.create(e, { visible: false })
  return e
}

/** floating name tag — its own entity (NOT parented: the sphere rolls, which would
 *  swing a child around). Position is set by hand in ghostSystem. Billboard keeps
 *  it facing the player from any angle. */
function buildGhostLabel(name: string): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(TRACK_ORIGIN.x, -50, TRACK_ORIGIN.z) })
  TextShape.create(e, {
    text: name,
    fontSize: 4,
    textColor: Color4.create(0.82, 0.9, 1, 1), // light blue — reads against the night track
    outlineColor: Color4.create(0, 0, 0, 1),
    outlineWidth: 0.18
  })
  Billboard.create(e, {}) // default BM_ALL — always square to the camera
  VisibilityComponent.create(e, { visible: false })
  return e
}

function setGhostVisible(gp: GhostPlayer, v: boolean) {
  gp.visible = v
  VisibilityComponent.getMutable(gp.entity).visible = v
  // self ghost has name "" — never show a tag for it
  VisibilityComponent.getMutable(gp.label).visible = v && gp.name.length > 0
}

/** keep the name tag hovering above the sphere. Called from ghostSystem (never
 *  from playAt) — scalar writes only, no allocation. */
function updateLabel(gp: GhostPlayer) {
  if (gp.name.length === 0) return
  const sp = Transform.get(gp.entity).position
  const lt = Transform.getMutable(gp.label)
  lt.position.x = sp.x
  lt.position.y = sp.y + LABEL_Y
  lt.position.z = sp.z
}

function resetGhostAccum(gp: GhostPlayer) {
  gp.roll = 0
  gp.hasPrev = false
}

/** rename a ghost after creation (B1 live ghost — name arrives with the blob) */
function setGhostName(gp: GhostPlayer, name: string) {
  gp.name = name
  TextShape.getMutable(gp.label).text = name
}

function promoteGhost(ms: number) {
  const chunks = encodeGhost(recording)
  selfGhost.track = decodeGhost(chunks)
  bestMs = ms
  console.log(
    `[CLIENT] ghost: new best ${ms.toFixed(3)}s -> ${selfGhost.track.count} samples, ${chunkSetBytes(chunks)} B base64`
  )
}

// ---- B1 network: one live run round-tripped through the server ----

/** ask the server for whatever run it currently holds */
function requestGhosts() {
  if (room.isReady()) void room.send('requestGhosts', { t: Date.now() })
}

/** post the just-finished run to the server. `raceHud.last` is THIS run's time
 *  (race.ts sets it on the finish frame, before this edge fires), not the
 *  session best — the server ranks the board by it. */
function submitCurrentRun() {
  if (recording.length <= RECORD_HZ) return
  if (!room.isReady()) return
  const timeMs = Math.round(raceHud.last * 1000)
  if (timeMs <= 0) return
  const chunks = encodeGhost(recording)
  void room.send('submitRun', { name: racerName(), chunks, timeMs })
  console.log(`[CLIENT] submitRun sent — ${timeMs}ms, ${chunks.length} chunk(s), ${chunkSetBytes(chunks)} B`)
}

/** a live ghost came back from the server. The server streams the top-N one
 *  message per ghost; `idx` is the slot (rank), `total` how many it is sending.
 *  Slots past `total` are cleared. Filled slots show at the next run-start edge
 *  (mid-run arrivals wait one run). */
function onLiveGhost(data: { name: string; chunks: GhostChunk[]; idx: number; total: number }) {
  const { idx } = data
  if (idx < 0 || idx >= LIVE_N || !data.chunks || data.chunks.length === 0) return
  const gp = liveGhosts[idx]
  gp.track = decodeGhost(data.chunks)
  setGhostName(gp, data.name || 'Racer')
  hasLiveGhosts = true // sticky — baked rivals step aside from the next run on
  liveCount = Math.max(1, Math.min(data.total, LIVE_N))
  for (let j = liveCount; j < LIVE_N; j++) {
    liveGhosts[j].track = undefined
    setGhostVisible(liveGhosts[j], false)
  }
  console.log(`[CLIENT] liveGhost ${idx + 1}/${data.total} — "${gp.name}", ${gp.track.count} samples`)
}

// ---- playback (NO allocation) -------------------------------------

function playAt(gp: GhostPlayer, t: number) {
  const tr = gp.track
  if (!tr || tr.count < 2) return
  const n = tr.count
  const dur = n / tr.hz
  let pt = t
  if (pt > dur) pt = dur // past the end → freeze at the last sample

  const fpos = pt * tr.hz
  let s1 = fpos | 0
  if (s1 > n - 1) s1 = n - 1
  const f = fpos - s1
  const s0 = s1 > 0 ? s1 - 1 : 0
  const s2 = s1 < n - 1 ? s1 + 1 : n - 1
  const s3 = s2 < n - 1 ? s2 + 1 : n - 1

  // track x/y/z are metres from TRACK_ORIGIN and ALREADY include this ghost's
  // lane offset (baked into the samples) — add nothing here.
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
  if (gp.hasPrev) {
    const dx = gx - gp.prevX
    const dz = gz - gp.prevZ
    gp.roll += Math.sqrt(dx * dx + dz * dz) / SPHERE_R
  }
  gp.prevX = gx
  gp.prevZ = gz
  gp.hasPrev = true

  // rotation = yaw(Y) * roll(local X), written inline (no Quaternion objects)
  const sy = Math.sin(yaw * 0.5)
  const cy = Math.cos(yaw * 0.5)
  const sr = Math.sin(gp.roll * 0.5)
  const cr = Math.cos(gp.roll * 0.5)

  const mt = Transform.getMutable(gp.entity)
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

function hideAll() {
  for (let i = 0; i < ghosts.length; i++) setGhostVisible(ghosts[i], false)
}

/** whether a ghost should race this run. Baked rivals are the cold-server
 *  stand-in: they show only while no live ghost has arrived. Self and live
 *  ghosts show whenever they have a track. Decided once per run at the
 *  launched edge so the field never changes mid-run. */
function shouldShow(gp: GhostPlayer): boolean {
  if (!gp.track) return false
  if (gp.kind === 'rival') return !hasLiveGhosts
  return true
}

function ghostSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return
  const launched = vehicleState.launched
  const phase = raceHud.phase

  // FINISH: keep the run if it beat the best; hide everyone at the line.
  if (phase === 'finished' && prevPhase !== 'finished') {
    hideAll()
    if (!promotedThisRun && raceHud.last > 0 && raceHud.last <= raceHud.best && recording.length > RECORD_HZ) {
      promoteGhost(raceHud.last)
      promotedThisRun = true
    }
    // B1: hand this run to the server, then ask for whatever it now holds so
    // the green live ghost is ready by the time the player taps RESTART.
    submitCurrentRun()
    requestGhosts()
  }
  prevPhase = phase

  // not in a run (grace, or respawned) — everything parked
  if (!launched) {
    if (prevLaunched) {
      prevLaunched = false
      hideAll()
    }
    return
  }

  // first frame of the run (grace just ended): reset the shared clock + every
  // ghost, drop sample 0, place every ghost at t=0.
  if (!prevLaunched) {
    prevLaunched = true
    recording.length = 0
    elapsed = 0
    nextSampleT = STEP
    promotedThisRun = false
    requestGhosts() // B1: pick up a run the server may already hold from before

    for (let i = 0; i < ghosts.length; i++) {
      resetGhostAccum(ghosts[i])
      setGhostVisible(ghosts[i], shouldShow(ghosts[i]))
    }
    pushSample() // sample 0, player at rest at the start line
    for (let i = 0; i < ghosts.length; i++) {
      if (ghosts[i].visible && ghosts[i].track) {
        playAt(ghosts[i], 0)
        updateLabel(ghosts[i])
      }
    }
    return
  }

  if (phase === 'finished') return // run over; the FINISH edge above already hid everyone

  // --- runs EVERY launched frame. The shared clock and the rival playback are
  //     NOT gated by whether the player has a personal best — only the SELF
  //     ghost's own visibility is (it has no track until a best exists). ---
  elapsed += dt

  while (elapsed >= nextSampleT && recording.length < MAX_SAMPLES) {
    pushSample() // player recording — self only
    nextSampleT += STEP
  }

  for (let i = 0; i < ghosts.length; i++) {
    const gp = ghosts[i]
    if (gp.visible && gp.track) {
      playAt(gp, elapsed) // rivals always have a track
      updateLabel(gp) // name tag follows the sphere — here, not in playAt
    }
  }
}

export function startGhost() {
  selfGhost = {
    entity: buildGhostSphere('self'),
    kind: 'self',
    label: buildGhostLabel(''), // no name tag for your own ghost
    name: '',
    track: undefined,
    roll: 0,
    prevX: 0,
    prevZ: 0,
    hasPrev: false,
    visible: false
  }
  ghosts.push(selfGhost)

  for (const b of BAKED_GHOSTS) {
    ghosts.push({
      entity: buildGhostSphere('rival'),
      kind: 'rival',
      label: buildGhostLabel(b.name), // name straight from the data — server will supply real ones
      name: b.name,
      track: decodeGhost(b.chunks),
      roll: 0,
      prevX: 0,
      prevZ: 0,
      hasPrev: false,
      visible: false
    })
  }

  // B2: LIVE_N green slots for the server's top-N runs. No track until a
  // liveGhost message fills a slot; then it rides with the rest.
  for (let i = 0; i < LIVE_N; i++) {
    const gp: GhostPlayer = {
      entity: buildGhostSphere('live'),
      kind: 'live',
      label: buildGhostLabel(''),
      name: '',
      track: undefined,
      roll: 0,
      prevX: 0,
      prevZ: 0,
      hasPrev: false,
      visible: false
    }
    liveGhosts.push(gp)
    ghosts.push(gp)
  }

  room.onMessage('liveGhost', onLiveGhost)
  requestGhosts() // in case the server already has a board from a previous visitor

  engine.addSystem(ghostSystem)
  console.log(`[CLIENT] ghost ready — self + ${BAKED_GHOSTS.length} rivals + ${LIVE_N} live slots`)
}
