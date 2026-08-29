/**
 * Generates assets/track.glb — the track floor as ONE continuous ribbon mesh
 * through the joints, so there are no overlapping-slab seams for the sphere to
 * trip on. Run: `npm run gen-track` (after editing src/shared/track-joints.ts).
 *
 * Flat-shaded: every triangle carries its own 3 vertices with an explicit face
 * NORMAL, and every quad's winding is chosen so that normal points OUTWARD (top
 * face up, bottom down, skirts sideways). Vertices are in scene/world
 * coordinates — the GltfContainer sits at the origin with an identity transform.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { JOINT_TUPLES, RUNOUT_END, LANE_HALF, FLOOR_DEPTH } from '../src/shared/track-joints.ts'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s]
const len = (v) => Math.hypot(v[0], v[1], v[2])
const norm = (v) => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const UP = [0, 1, 0]

const J = [...JOINT_TUPLES.map((t) => [...t]), [...RUNOUT_END]]

// mitred frame at each joint
const frames = J.map((p, i) => {
  const din = i > 0 ? norm(sub(p, J[i - 1])) : norm(sub(J[i + 1], p))
  const dout = i < J.length - 1 ? norm(sub(J[i + 1], p)) : din
  const dir = norm(add(din, dout))
  const right = norm(cross(UP, dir))
  const normal = norm(cross(dir, right))
  return { p, right, normal }
})

const rings = frames.map((f) => ({
  tL: add(f.p, scale(f.right, -LANE_HALF)),
  tR: add(f.p, scale(f.right, LANE_HALF)),
  bL: sub(add(f.p, scale(f.right, -LANE_HALF)), scale(f.normal, FLOOR_DEPTH)),
  bR: sub(add(f.p, scale(f.right, LANE_HALF)), scale(f.normal, FLOOR_DEPTH))
}))

// --- flat-shaded triangle soup ------------------------------------

const P = [] // positions (flat)
const N = [] // normals (flat)
const IDX = []

function tri(p0, p1, p2, n) {
  const base = P.length / 3
  for (const p of [p0, p1, p2]) {
    P.push(p[0], p[1], p[2])
    N.push(n[0], n[1], n[2])
  }
  IDX.push(base, base + 1, base + 2)
}

function quad(intended, p0, p1, p2, p3) {
  let a = p0
  let b = p1
  let c = p2
  let d = p3
  const n0 = norm(cross(sub(b, a), sub(c, a)))
  if (dot(n0, intended) < 0) {
    b = p3
    d = p1
  }
  const n = norm(cross(sub(b, a), sub(c, a)))
  tri(a, b, c, n)
  tri(a, c, d, n)
}

for (let i = 0; i < frames.length - 1; i++) {
  const r0 = rings[i]
  const r1 = rings[i + 1]
  const nUp = norm(add(frames[i].normal, frames[i + 1].normal))
  const nRight = norm(add(frames[i].right, frames[i + 1].right))

  quad(nUp, r0.tL, r0.tR, r1.tR, r1.tL) // top  → up
  quad(scale(nUp, -1), r0.bL, r0.bR, r1.bR, r1.bL) // bottom → down
  quad(scale(nRight, -1), r0.tL, r0.bL, r1.bL, r1.tL) // left skirt → -right
  quad(nRight, r0.tR, r0.bR, r1.bR, r1.tR) // right skirt → +right
}
// end caps (winding auto-corrected by quad() toward the given outward hint)
quad([0, 0, -1], rings[0].tL, rings[0].tR, rings[0].bR, rings[0].bL)
const eLast = rings.length - 1
quad([0, 0, 1], rings[eLast].tL, rings[eLast].tR, rings[eLast].bR, rings[eLast].bL)

// --- pack GLB -----------------------------------------------------

const posF32 = Float32Array.from(P)
const nrmF32 = Float32Array.from(N)
const idxU16 = Uint16Array.from(IDX)

const min = [Infinity, Infinity, Infinity]
const max = [-Infinity, -Infinity, -Infinity]
for (let i = 0; i < P.length; i += 3)
  for (let k = 0; k < 3; k++) {
    if (P[i + k] < min[k]) min[k] = P[i + k]
    if (P[i + k] > max[k]) max[k] = P[i + k]
  }

const pad4 = (buf) => (buf.length % 4 === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))]))
const posB = Buffer.from(posF32.buffer)
const nrmB = Buffer.from(nrmF32.buffer)
const idxB = pad4(Buffer.from(idxU16.buffer))
const bin = Buffer.concat([posB, nrmB, idxB])

const vcount = P.length / 3
const gltf = {
  asset: { version: '2.0', generator: 'slipstream gen-track-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'TrackFloor' }],
  meshes: [{ name: 'TrackFloor', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [
    {
      name: 'TrackFloor',
      pbrMetallicRoughness: { baseColorFactor: [0.14, 0.14, 0.18, 1], metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true
    }
  ],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posB.length, target: 34962 },
    { buffer: 0, byteOffset: posB.length, byteLength: nrmB.length, target: 34962 },
    { buffer: 0, byteOffset: posB.length + nrmB.length, byteLength: idxB.length, target: 34963 }
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: vcount, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: vcount, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: IDX.length, type: 'SCALAR' }
  ]
}

let json = Buffer.from(JSON.stringify(gltf), 'utf8')
if (json.length % 4 !== 0) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)])

const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8)

const jHdr = Buffer.alloc(8)
jHdr.writeUInt32LE(json.length, 0)
jHdr.writeUInt32LE(0x4e4f534a, 4)

const bHdr = Buffer.alloc(8)
bHdr.writeUInt32LE(bin.length, 0)
bHdr.writeUInt32LE(0x004e4942, 4)

const glb = Buffer.concat([header, jHdr, json, bHdr, bin])
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'track.glb')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, glb)
console.log(`wrote ${out}  (${vcount} verts, ${IDX.length / 3} tris, ${glb.length} bytes)  bbox ${JSON.stringify(min.map((n) => +n.toFixed(1)))}..${JSON.stringify(max.map((n) => +n.toFixed(1)))}`)
