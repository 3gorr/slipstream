import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * registerMessages() defines a component internally, so this module MUST be
 * imported statically (never via a dynamic import()) and this call MUST run at
 * module load, before the engine seals. See CLAUDE.md section 4.
 *
 * Day 1 skeleton: a placeholder ping plus the B0 hello handshake. Real messages
 * (ghost blob chunks, finish, inbox) land later.
 */
export const messages = {
  ping: Schemas.Map({ t: Schemas.Int64 }),
  pong: Schemas.Map({ t: Schemas.Int64 }),
  // B0 — prove the client↔server channel. Client sends clientHello on start;
  // the server answers serverHello (to that client) carrying its clock.
  clientHello: Schemas.Map({ t: Schemas.Int64 }),
  serverHello: Schemas.Map({ t: Schemas.Int64 })
}

export const room = registerMessages(messages)
