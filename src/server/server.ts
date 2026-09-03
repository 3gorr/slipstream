// Server entry. Reached via a dynamic import() inside the isServer() branch of
// src/index.ts — this file imports @dcl/sdk/server (Storage), which must never
// reach the client bundle. Keep the dynamic import.
//
// B0: clientHello -> serverHello handshake.
// B1: one live run round-tripped through memory.
// B2: a persistent top-N leaderboard ranked by run time.
//     - lb:v1            -> LbEntry[] (sorted by timeMs asc, length <= TOP_N)
//     - ghost:v1:<addr>  -> GhostChunk[] blob, only for addrs currently in lb:v1
//     Working copy lives in memory; Storage is written through only when the
//     board changes (on submitRun / finish), never per frame.

import { Storage } from '@dcl/sdk/server'
import { room } from '../shared/messages'
import type { GhostChunk } from '../shared/codec'

const TOP_N = 3 // as many live ghosts as baked rivals — keeps the mobile budget

const LB_KEY = 'lb:v1'
const ghostKey = (addr: string) => `ghost:v1:${addr}`

type LbEntry = { addr: string; name: string; timeMs: number }

// ---- in-memory working copy (authoritative once loaded) ----------------
let board: LbEntry[] = []
const blobs = new Map<string, GhostChunk[]>()

let loadPromise: Promise<void> | null = null
function ensureLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = loadBoard()
  return loadPromise
}

function validBoard(v: unknown): LbEntry[] {
  if (!Array.isArray(v)) return []
  const out: LbEntry[] = []
  for (const e of v) {
    if (
      e &&
      typeof e.addr === 'string' &&
      typeof e.name === 'string' &&
      typeof e.timeMs === 'number' &&
      e.timeMs > 0
    ) {
      out.push({ addr: e.addr, name: e.name, timeMs: e.timeMs })
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out.slice(0, TOP_N)
}

function validChunks(v: unknown): GhostChunk[] {
  if (!Array.isArray(v)) return []
  // shallow shape check — the codec decodes defensively anyway
  return v.every((c) => c && typeof c.b64 === 'string' && typeof c.n === 'number') ? (v as GhostChunk[]) : []
}

async function loadBoard(): Promise<void> {
  try {
    board = validBoard(await Storage.get<LbEntry[]>(LB_KEY))
    for (const e of board) {
      const c = validChunks(await Storage.get<GhostChunk[]>(ghostKey(e.addr)))
      if (c.length > 0) blobs.set(e.addr, c)
    }
    console.log(`[SERVER] board loaded — ${board.length} entr${board.length === 1 ? 'y' : 'ies'}, ${blobs.size} blob(s)`)
  } catch (err) {
    console.log('[SERVER] board load failed, starting empty:', err)
    board = []
    blobs.clear()
  }
}

// ---- write-through (only on a board change) ----------------------------
async function persist(addr: string, chunks: GhostChunk[], evicted: LbEntry[]): Promise<void> {
  const okLb = await Storage.set(LB_KEY, board)
  if (!okLb) console.log('[SERVER] Storage.set lb:v1 returned false — board NOT persisted')

  const okG = await Storage.set(ghostKey(addr), chunks)
  if (!okG) console.log(`[SERVER] Storage.set ghost:v1:${addr} returned false — blob NOT persisted`)

  for (const e of evicted) {
    const okD = await Storage.delete(ghostKey(e.addr))
    if (!okD) console.log(`[SERVER] Storage.delete ghost:v1:${e.addr} returned false`)
  }
}

// ---- handlers ---------------------------------------------------------
export function startServer() {
  console.log('[SERVER] setup')

  room.onMessage('clientHello', (_data, ctx) => {
    const from = ctx?.from
    console.log('[SERVER] clientHello from', from ?? '(unknown)')
    if (from) void room.send('serverHello', { t: Date.now() }, { to: [from] })
    else void room.send('serverHello', { t: Date.now() })
  })

  room.onMessage('submitRun', (data, ctx) => {
    void handleSubmit(data, ctx?.from)
  })

  room.onMessage('requestGhosts', (_data, ctx) => {
    void handleRequest(ctx?.from)
  })
}

async function handleSubmit(
  data: { name: string; chunks: GhostChunk[]; timeMs: number },
  addr: string | undefined
): Promise<void> {
  try {
    if (!addr) return
    const chunks = validChunks(data.chunks)
    const timeMs = data.timeMs
    if (chunks.length === 0 || typeof timeMs !== 'number' || timeMs <= 0) return
    const name = data.name || 'Racer'

    await ensureLoaded()

    const prev = board.find((e) => e.addr === addr)
    if (prev && timeMs >= prev.timeMs) {
      console.log(`[SERVER] submitRun ${addr} ${timeMs}ms — no improvement over ${prev.timeMs}ms`)
      return
    }

    const next = board
      .filter((e) => e.addr !== addr)
      .concat({ addr, name, timeMs })
      .sort((a, b) => a.timeMs - b.timeMs)
      .slice(0, TOP_N)

    if (!next.some((e) => e.addr === addr)) {
      console.log(`[SERVER] submitRun ${addr} ${timeMs}ms — did not make top ${TOP_N}`)
      return
    }

    const evicted = board.filter((e) => !next.some((n) => n.addr === e.addr))
    board = next
    blobs.set(addr, chunks)
    for (const e of evicted) blobs.delete(e.addr)

    console.log(
      `[SERVER] submitRun ${addr} "${name}" ${timeMs}ms — board now [${board
        .map((e) => `${e.name}:${e.timeMs}`)
        .join(', ')}]${evicted.length ? ` (evicted ${evicted.map((e) => e.addr).join(', ')})` : ''}`
    )
    await persist(addr, chunks, evicted)
  } catch (err) {
    console.log('[SERVER] submitRun handler error:', err)
  }
}

async function handleRequest(from: string | undefined): Promise<void> {
  try {
    if (!from) return
    await ensureLoaded()
    if (board.length === 0) {
      console.log('[SERVER] requestGhosts — board empty')
      return
    }
    let sent = 0
    for (let i = 0; i < board.length; i++) {
      const e = board[i]
      const chunks = blobs.get(e.addr)
      if (!chunks || chunks.length === 0) continue
      void room.send('liveGhost', { name: e.name, chunks, idx: i, total: board.length }, { to: [from] })
      sent++
    }
    console.log(`[SERVER] requestGhosts from ${from} — sent ${sent}/${board.length} ghost(s)`)
  } catch (err) {
    console.log('[SERVER] requestGhosts handler error:', err)
  }
}
