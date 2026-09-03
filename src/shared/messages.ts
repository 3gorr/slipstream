import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * registerMessages() defines a component internally, so this module MUST be
 * imported statically (never via a dynamic import()) and this call MUST run at
 * module load, before the engine seals. See CLAUDE.md section 4.
 *
 * Day 1 skeleton: a placeholder ping plus the B0 hello handshake. B1 added a
 * single in-memory ghost round-trip. B2 makes it a Storage-backed top-N board:
 * submitRun carries the run time, liveGhost carries a slot index so the client
 * can place several live ghosts at once.
 */

// One ghost blob chunk — mirrors GhostChunk in shared/codec.ts. base64 string
// nested inside Array→Map serialises fine over the room transport.
const GhostChunkSchema = Schemas.Map({
  v: Schemas.Int,
  seq: Schemas.Int,
  total: Schemas.Int,
  hz: Schemas.Int,
  n: Schemas.Int,
  b64: Schemas.String
})

export const messages = {
  ping: Schemas.Map({ t: Schemas.Int64 }),
  pong: Schemas.Map({ t: Schemas.Int64 }),
  // B0 — prove the client↔server channel. Client sends clientHello on start;
  // the server answers serverHello (to that client) carrying its clock.
  clientHello: Schemas.Map({ t: Schemas.Int64 }),
  serverHello: Schemas.Map({ t: Schemas.Int64 }),
  // B1/B2 — live runs through the server. Client posts its finished run (name +
  // blob + time in ms); asks for ghosts on start/finish; server ranks by time
  // and streams back the top-N, one liveGhost message per ghost (idx / total let
  // the client fill several slots without a single oversized message).
  submitRun: Schemas.Map({
    name: Schemas.String,
    chunks: Schemas.Array(GhostChunkSchema),
    timeMs: Schemas.Int
  }),
  requestGhosts: Schemas.Map({ t: Schemas.Int64 }),
  liveGhost: Schemas.Map({
    name: Schemas.String,
    chunks: Schemas.Array(GhostChunkSchema),
    idx: Schemas.Int,
    total: Schemas.Int
  })
}

export const room = registerMessages(messages)
