/**
 * Ghost blob codec.
 *
 * One sample = 7 bytes, little-endian:
 *   x   int16  decimetres (10 cm units) from track start
 *   y   int16  decimetres
 *   z   int16  decimetres
 *   yaw uint8   sphere heading, 1/256 of a turn
 *
 * Format 1 stored centimetres (±327.67 m range) — fine for the original ~158 m
 * track. The Sept 2026 length pass stretched the track to ~380 m one-way, plus
 * headroom for further growth, so format 2 stores decimetres instead
 * (±3276.7 m range) at 10 cm quantisation — imperceptible on a 1 m-radius
 * sphere smoothed by Catmull-Rom playback. GHOST_FORMAT bumped accordingly:
 * any format-1 blob left in server Storage decodes as garbage under format 2
 * and must be cleared, not migrated (the track geometry changed anyway, so old
 * ghosts don't line up with it any more).
 *
 * Record rate: RECORD_HZ. A full run is RUN_SECONDS long, so the raw payload is
 * RECORD_HZ * RUN_SECONDS * 7 bytes. That is chunked with (seq, total) headers
 * from day one — a scene message silently drops above ~13 KB — even though at the
 * current rate everything fits in a single chunk.
 */

export const GHOST_FORMAT = 2
export const SAMPLE_BYTES = 7
export const RECORD_HZ = 8
/** Run duration budget — relaxed from the original 50-70s (CLAUDE.md §1) to
 * 90-120s for the longer track; padded above 120s for tuning headroom. */
export const RUN_SECONDS = 140
export const MAX_SAMPLES = RECORD_HZ * RUN_SECONDS

/** Raw bytes per chunk. base64 inflates ~4/3, so 8000 -> ~10.7 KB, under 13 KB. */
export const MAX_CHUNK_BYTES = 8000

export interface GhostSample {
  /** centimetres from track start */
  x: number
  y: number
  z: number
  /** radians; stored quantised to 1/256 turn */
  yaw: number
}

export interface GhostChunk {
  v: number
  /** 0-based chunk index */
  seq: number
  /** number of chunks in the set */
  total: number
  hz: number
  /** total sample count across the whole set */
  n: number
  /** base64 of this chunk's raw sample bytes */
  b64: string
}

/** Flat, pre-decoded form for allocation-free playback. */
export interface GhostTrack {
  hz: number
  count: number
  /** metres from track start */
  x: Float32Array
  y: Float32Array
  z: Float32Array
  /** radians */
  yaw: Float32Array
}

// ---- base64 (QuickJS has no Buffer / reliable atob) ----------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INV = /* @__PURE__ */ (() => {
  const t = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i
  return t
})()

function bytesToB64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '=='
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='
  }
  return out
}

function b64ToBytes(s: string): Uint8Array {
  let len = s.length
  while (len > 0 && s[len - 1] === '=') len--
  const outLen = (len * 3) >> 2
  const out = new Uint8Array(outLen)
  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < len; i++) {
    const v = B64_INV[s.charCodeAt(i)]
    if (v < 0) continue
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 0xff
    }
  }
  return o === outLen ? out : out.subarray(0, o)
}

// ---- encode ------------------------------------------------------------

const TWO_PI = Math.PI * 2

export function encodeGhost(samples: GhostSample[], hz: number = RECORD_HZ): GhostChunk[] {
  const n = Math.min(samples.length, MAX_SAMPLES)
  const raw = new Uint8Array(n * SAMPLE_BYTES)
  const dv = new DataView(raw.buffer)
  for (let i = 0; i < n; i++) {
    const s = samples[i]
    const o = i * SAMPLE_BYTES
    // GhostSample.x/y/z arrive in centimetres (see ghost.ts pushSample); stored
    // as decimetres (format 2), so divide by 10 going in.
    dv.setInt16(o, clampI16(Math.round(s.x / 10)), true)
    dv.setInt16(o + 2, clampI16(Math.round(s.y / 10)), true)
    dv.setInt16(o + 4, clampI16(Math.round(s.z / 10)), true)
    let t = s.yaw % TWO_PI
    if (t < 0) t += TWO_PI
    dv.setUint8(o + 6, Math.round((t / TWO_PI) * 256) & 0xff)
  }

  const samplesPerChunk = Math.floor(MAX_CHUNK_BYTES / SAMPLE_BYTES)
  const total = Math.max(1, Math.ceil(n / samplesPerChunk))
  const chunks: GhostChunk[] = []
  for (let seq = 0; seq < total; seq++) {
    const from = seq * samplesPerChunk * SAMPLE_BYTES
    const to = Math.min(raw.length, from + samplesPerChunk * SAMPLE_BYTES)
    chunks.push({ v: GHOST_FORMAT, seq, total, hz, n, b64: bytesToB64(raw.subarray(from, to)) })
  }
  return chunks
}

// ---- decode ----------------------------------------------------------

export function decodeGhost(chunks: GhostChunk[]): GhostTrack {
  if (chunks.length === 0) return emptyTrack()
  const ordered = chunks.slice().sort((a, b) => a.seq - b.seq)
  const first = ordered[0]
  const n = first.n
  const raw = new Uint8Array(n * SAMPLE_BYTES)
  let offset = 0
  for (const c of ordered) {
    const part = b64ToBytes(c.b64)
    raw.set(part.subarray(0, Math.min(part.length, raw.length - offset)), offset)
    offset += part.length
  }

  const dv = new DataView(raw.buffer)
  const count = Math.min(n, Math.floor(raw.length / SAMPLE_BYTES))
  const track: GhostTrack = {
    hz: first.hz,
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    yaw: new Float32Array(count)
  }
  for (let i = 0; i < count; i++) {
    const o = i * SAMPLE_BYTES
    // raw is decimetres (format 2): ×10 for cm, ×0.01 for metres = /10 straight to metres.
    track.x[i] = dv.getInt16(o, true) / 10
    track.y[i] = dv.getInt16(o + 2, true) / 10
    track.z[i] = dv.getInt16(o + 4, true) / 10
    track.yaw[i] = (dv.getUint8(o + 6) / 256) * TWO_PI
  }
  return track
}

// ---- helpers -------------------------------------------------------

function clampI16(v: number): number {
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v
}

function emptyTrack(): GhostTrack {
  return {
    hz: RECORD_HZ,
    count: 0,
    x: new Float32Array(0),
    y: new Float32Array(0),
    z: new Float32Array(0),
    yaw: new Float32Array(0)
  }
}

/** total base64 payload size of a chunk set, in bytes */
export function chunkSetBytes(chunks: GhostChunk[]): number {
  let n = 0
  for (const c of chunks) n += c.b64.length
  return n
}
