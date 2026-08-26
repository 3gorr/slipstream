import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * registerMessages() defines a component internally, so this module MUST be
 * imported statically (never via a dynamic import()) and this call MUST run at
 * module load, before the engine seals. See CLAUDE.md section 4.
 *
 * Day 1 skeleton: only a placeholder ping. Real messages (ghost blob chunks,
 * finish, inbox) land on day 2+.
 */
export const messages = {
  ping: Schemas.Map({ t: Schemas.Int64 }),
  pong: Schemas.Map({ t: Schemas.Int64 })
}

export const room = registerMessages(messages)
