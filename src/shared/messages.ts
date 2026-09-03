import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * registerMessages() defines a component internally, so this module MUST be
 * imported statically (never via a dynamic import()) and this call MUST run at
 * module load, before the engine seals. See CLAUDE.md section 4.
 *
 * Day 1 skeleton: a placeholder ping plus the B0 hello handshake. B1 adds a
 * single in-memory ghost round-trip (submitRun / requestGhosts / liveGhost).
 * Storage-backed top-N and matchmaking land in B2.
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
  // B1 — one live run, round-tripped through server memory (no Storage yet).
  // Client posts its encoded run on finish; asks for ghosts on start/finish;
  // server replays the last run it holds back to that client.
  submitRun: Schemas.Map({ name: Schemas.String, chunks: Schemas.Array(GhostChunkSchema) }),
  requestGhosts: Schemas.Map({ t: Schemas.Int64 }),
  liveGhost: Schemas.Map({ name: Schemas.String, chunks: Schemas.Array(GhostChunkSchema) })
}

export const room = registerMessages(messages)
