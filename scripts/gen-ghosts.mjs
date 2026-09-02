/**
 * OFFLINE ghost-data generator. Runs in plain Node — no DCL engine.
 *
 * Produces 3 "rival" ghosts that ride the real track (geometry from
 * src/shared/track.ts) beside the player, each with a constant lane offset and a
 * different finish time, encoded with the real codec (src/shared/codec.ts).
 * Output: src/shared/bakedGhosts.ts (an array of { name, chunks }, chunks being
 * exactly what decodeGhost() takes — nothing is re-assembled at load time).
 *
 *   node scripts/gen-ghosts.mjs      (or: npm run bake-ghosts)
 *
 * codec.ts and the track geometry are pure math (only @dcl/sdk/math), so they
 * are bundled with esbuild into temp ESM modules and imported here.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESBUILD = join(ROOT, 'node_modules', '.bin', 'esbuild')
const TMP = join(ROOT, 'node_modules', '.cache', 'gen-ghosts')
mkdirSync(TMP, { recursive: true })

function bundle(srcRel) {
  const out = join(TMP, srcRel.replace(/[\\/]/g, '_') + '.mjs')
  execFileSync(ESBUILD, [
    join(ROOT, srcRel),
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--log-level=warning',
    `--outfile=${out}`
  ])
  return pathToFileURL(out).href
}

const codec = await import(bundle('src/shared/codec.ts'))
const track = await import(bundle('src/shared/track.ts'))

const { encodeGhost, decodeGhost, chunkSetBytes, RECORD_HZ, MAX_SAMPLES } = codec
const { TRACK_ORIGIN, trackCentreAt, segmentAtZ, RUNOUT_START_Z, HALF_LANE, CHECKPOINTS_Z } = track

const DT = 1 / RECORD_HZ
const START_Z = 10 // where the player effectively launches (SPAWN.z ≈ 10.09)
const FINISH_Z = CHECKPOINTS_Z[CHECKPOINTS_Z.length - 1] // 156
const ACCEL_TIME = 1.5 // seconds to ramp from ~rest to cruise — the real gyrosphere is quick
const V_MIN = 0.05 // tiny floor only to keep the very first sample non-degenerate

// --- track sampling helpers (plain) ------------------------------

/** world position on the track at longitudinal Z with a constant lane offset d */
function posAt(z, d) {
  const c = trackCentreAt(z)
  // right vector is horizontal; on the straight run-out it is world +X
  const rx = z >= RUNOUT_START_Z ? 1 : segmentAtZ(z).right.x
  const rz = z >= RUNOUT_START_Z ? 0 : segmentAtZ(z).right.z
  return { x: c.x + rx * d, y: c.y, z: c.z + rz * d }
}
/** how much a unit of travelled distance advances world Z at this point */
function dirZAt(z) {
  return z >= RUNOUT_START_Z ? 1 : segmentAtZ(z).dir.z
}
function smoothstep(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

// --- simulate one rival at a given cruise speed -----------------

function simulate(laneOffset, vCruise) {
  const world = []
  let z = START_Z
  let t = 0
  while (z < FINISH_Z && world.length < MAX_SAMPLES) {
    world.push(posAt(z, laneOffset))
    // ramp over TIME, not distance — no vicious circle where a low v keeps the
    // ramp low. Reaches cruise ~ACCEL_TIME after the start.
    const v = Math.max(V_MIN, vCruise * smoothstep(t / ACCEL_TIME))
    const ds = v * DT
    z += ds * dirZAt(z)
    t += DT
  }
  // one sample at/just past the finish so the ghost visibly crosses the line
  if (world.length < MAX_SAMPLES) world.push(posAt(Math.min(z, FINISH_Z + 1), laneOffset))
  return { world, seconds: t }
}

/** find the cruise speed that finishes in ~targetSeconds */
function tuneCruise(laneOffset, targetSeconds) {
  let lo = 1
  // ~8 s over the ~155 m track needs ~20 m/s cruise, so the search range must
  // reach that. This is the search bound, not the accel profile.
  let hi = 45
  let best = null
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const run = simulate(laneOffset, mid)
    best = { ...run, vCruise: mid }
    const reachedFinish = run.world.length < MAX_SAMPLES
    if (!reachedFinish || run.seconds > targetSeconds) lo = mid
    else hi = mid
  }
  return best
}

// --- build a rival's GhostSample[] -----------------------------

function toSamples(world) {
  const n = world.length
  const samples = new Array(n)
  for (let i = 0; i < n; i++) {
    const w = world[i]
    const nx = world[Math.min(i + 1, n - 1)]
    const dz = nx.z - w.z
    const dx = nx.x - w.x
    const yaw = dx === 0 && dz === 0 ? (i > 0 ? samples[i - 1].yaw : 0) : Math.atan2(dx, dz)
    samples[i] = {
      x: (w.x - TRACK_ORIGIN.x) * 100,
      y: (w.y - TRACK_ORIGIN.y) * 100,
      z: (w.z - TRACK_ORIGIN.z) * 100,
      yaw
    }
  }
  return samples
}

// --- rivals ---------------------------------------------------
// lane offsets: all within ±(HALF_LANE − sphereR) ≈ ±3, distinct, spread across
// the lane so they ride beside the player, not through them.
// Tuned to the player's real time on this track (~8.35 s).
const RIVALS = [
  { name: 'Rival A', lane: -1.3, targetSeconds: 7.8 }, // the rabbit — just ahead, catchable
  { name: 'Rival B', lane: +1.7, targetSeconds: 8.4 }, // neck-and-neck with the player
  { name: 'Rival C', lane: -2.7, targetSeconds: 9.6 } // the one you overtake
]

const baked = []
for (const r of RIVALS) {
  const tuned = tuneCruise(r.lane, r.targetSeconds)
  const samples = toSamples(tuned.world)
  const chunks = encodeGhost(samples)
  baked.push({ name: r.name, lane: r.lane, chunks, _sim: tuned })
}

// --- write src/shared/bakedGhosts.ts --------------------------

const body = baked
  .map(
    (b) =>
      `  {\n    name: ${JSON.stringify(b.name)},\n    chunks: ${JSON.stringify(b.chunks)}\n  }`
  )
  .join(',\n')

const fileText = `// AUTO-GENERATED by scripts/gen-ghosts.mjs — do not edit by hand.
// Regenerate with: npm run bake-ghosts
import type { GhostChunk } from './codec'

export const BAKED_GHOSTS: { name: string; chunks: GhostChunk[] }[] = [
${body}
]
`
writeFileSync(join(ROOT, 'src', 'shared', 'bakedGhosts.ts'), fileText)

// --- self-check ---------------------------------------------

console.log('\n=== baked ghosts self-check ===')
for (const b of baked) {
  const tr = decodeGhost(b.chunks)
  const first = tr.count > 0 ? worldOf(tr, 0) : null
  const last = tr.count > 0 ? worldOf(tr, tr.count - 1) : null
  console.log(
    `${b.name}  lane ${b.lane >= 0 ? '+' : ''}${b.lane}m\n` +
      `  samples ${tr.count}   duration ${(tr.count / tr.hz).toFixed(2)}s  (sim ${b._sim.seconds.toFixed(2)}s, vCruise ${b._sim.vCruise.toFixed(2)} m/s)\n` +
      `  first (m) ${fmt(first)}\n` +
      `  last  (m) ${fmt(last)}\n` +
      `  base64 ${chunkSetBytes(b.chunks)} B   chunks ${b.chunks.length}`
  )
}
console.log(`\nfinish line at Z=${FINISH_Z} (world), start Z=${START_Z}, TRACK_ORIGIN=(${TRACK_ORIGIN.x},${TRACK_ORIGIN.y},${TRACK_ORIGIN.z})`)

function worldOf(tr, i) {
  return { x: TRACK_ORIGIN.x + tr.x[i], y: TRACK_ORIGIN.y + tr.y[i], z: TRACK_ORIGIN.z + tr.z[i] }
}
function fmt(p) {
  return p ? `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})` : '—'
}

rmSync(TMP, { recursive: true, force: true })
