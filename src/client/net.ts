/**
 * B0 — proof the client↔server channel works, ahead of shipping ghost blobs.
 *
 * On start the client sends `clientHello`; the server answers `serverHello`;
 * `netState.serverConnected` flips true. The race HUD shows a small indicator
 * (SHOW_NET_DEBUG). No gameplay depends on this yet — baked ghosts are untouched.
 *
 * `room` buffers sends until the transport is ready, but the server itself may
 * still be cold-starting (~15 s in prod) and drop early messages — so a system
 * resends `clientHello` every couple of seconds until an answer lands.
 */
import { engine } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'

export const netState = { serverConnected: false }

const RETRY_EVERY = 2 // seconds
let sinceRetry = RETRY_EVERY // fire on the first eligible frame

function helloSystem(dt: number) {
  if (netState.serverConnected) return
  sinceRetry += dt
  if (sinceRetry < RETRY_EVERY) return
  sinceRetry = 0
  if (room.isReady()) void room.send('clientHello', { t: Date.now() })
}

export function startNet() {
  room.onMessage('serverHello', (data) => {
    if (netState.serverConnected) return
    netState.serverConnected = true
    console.log('[CLIENT] serverHello received (server t=' + data.t + ')')
  })
  engine.addSystem(helloSystem)
  console.log('[CLIENT] net started (B0 hello)')
}
