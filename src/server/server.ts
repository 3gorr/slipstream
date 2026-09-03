// Server entry. Reached via a dynamic import() inside the isServer() branch of
// src/index.ts (mirrors the client side). Keep it that way: once this file
// starts importing @dcl/sdk/server (Storage etc.), the dynamic import is what
// keeps that off the client bundle path.
//
// B0: prove the client↔server channel — every clientHello is answered with a
//     serverHello sent back to that same client.
// B1: one live run, round-tripped through memory. The server keeps ONE run
//     (the last submitRun it received) and hands it to any client that asks
//     via requestGhosts. No Storage, no top-N, no matchmaking yet (that is B2).

import { room } from '../shared/messages'
import type { GhostChunk } from '../shared/codec'

type StoredRun = { name: string; chunks: GhostChunk[] }

// The single run held in memory. Lost on server shutdown — that is fine for B1;
// persistence is B2.
let lastRun: StoredRun | null = null

export function startServer() {
  console.log('[SERVER] setup')

  room.onMessage('clientHello', (_data, ctx) => {
    const from = ctx?.from
    console.log('[SERVER] clientHello from', from ?? '(unknown)')
    if (from) void room.send('serverHello', { t: Date.now() }, { to: [from] })
    else void room.send('serverHello', { t: Date.now() })
  })

  room.onMessage('submitRun', (data, ctx) => {
    const chunks = data.chunks as GhostChunk[]
    if (!chunks || chunks.length === 0) return
    lastRun = { name: data.name || 'Racer', chunks }
    console.log(
      `[SERVER] submitRun from ${ctx?.from ?? '(unknown)'} — "${lastRun.name}", ${chunks.length} chunk(s)`
    )
  })

  room.onMessage('requestGhosts', (_data, ctx) => {
    const from = ctx?.from
    if (!from) return
    if (!lastRun) {
      console.log('[SERVER] requestGhosts — nothing stored yet')
      return
    }
    console.log(`[SERVER] requestGhosts from ${from} — sending "${lastRun.name}"`)
    void room.send('liveGhost', { name: lastRun.name, chunks: lastRun.chunks }, { to: [from] })
  })
}
