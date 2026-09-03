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
import { getPlayer, onEnterScene } from '@dcl/sdk/players'
import { room } from '../shared/messages'

export const netState = { serverConnected: false }

// Local player's display name. Used when submitting a run (B1). The profile does
// not resolve on the first frames — and onEnterScene for the local player can
// fire before it does, handing us an empty name and never firing again. So two
// sources feed the cache: onEnterScene (early when it works) and a poll that
// keeps checking getPlayer() until a name shows up, then removes itself.
let racerNameCache = ''

/** for callers that need a value now — real name once known, else 'Racer' */
export function racerName(): string {
  return racerNameCache || 'Racer'
}
/** raw cache (empty until resolved) — used by the net indicator for diagnostics */
export function racerNameRaw(): string {
  return racerNameCache
}

function cacheName(name: string | undefined): boolean {
  if (!name || name.length === 0 || racerNameCache) return false
  racerNameCache = name
  console.log('[CLIENT] racer name cached:', name)
  return true
}

const RETRY_EVERY = 2 // seconds
let sinceRetry = RETRY_EVERY // fire on the first eligible frame

function helloSystem(dt: number) {
  if (netState.serverConnected) return
  sinceRetry += dt
  if (sinceRetry < RETRY_EVERY) return
  sinceRetry = 0
  if (room.isReady()) void room.send('clientHello', { t: Date.now() })
}

// Poll the profile until a name is available, then stop polling.
const NAME_POLL_EVERY = 0.5 // seconds
let sinceNamePoll = 0
function nameCacheSystem(dt: number) {
  if (racerNameCache) {
    engine.removeSystem(nameCacheSystem)
    return
  }
  sinceNamePoll += dt
  if (sinceNamePoll < NAME_POLL_EVERY) return
  sinceNamePoll = 0
  if (cacheName(getPlayer()?.name)) engine.removeSystem(nameCacheSystem)
}

export function startNet() {
  onEnterScene((player) => {
    const me = getPlayer()
    cacheName(me && player.userId === me.userId ? me.name : player.name)
  })
  engine.addSystem(nameCacheSystem)

  room.onMessage('serverHello', (data) => {
    if (netState.serverConnected) return
    netState.serverConnected = true
    console.log('[CLIENT] serverHello received (server t=' + data.t + ')')
  })
  engine.addSystem(helloSystem)
  console.log('[CLIENT] net started (B0 hello)')
}
