/**
 * Race timer — client-side game loop. One export: startRace().
 *
 *   start  : first time the player moves off the spawn (speed > START_SPEED)
 *   finish : player crosses the finish plane (CHECKPOINTS_Z last, ~Z 156)
 *   reset  : a respawn (detected as a teleport back near SPAWN) zeroes the timer
 *
 * Keeps last and best time of the session. Server-authoritative timing comes
 * later (CLAUDE.md §4); this is the local HUD clock.
 */
import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { SPAWN, CHECKPOINTS_Z } from '../shared/track'
import { raceHud, setupRaceHud } from './race-hud'

const START_SPEED = 2.5 // m/s — moving means the run has begun
const FINISH_Z = CHECKPOINTS_Z[CHECKPOINTS_Z.length - 1]
const TELEPORT_JUMP = 8 // metres in one frame = a respawn, not real movement

let phase: 'idle' | 'running' | 'finished' = 'idle'
let elapsed = 0
let lastTime = 0
let bestTime = 0
let prevP: Vector3 | undefined

function raceSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position

  // respawn = a big single-frame jump. Reset if it lands back at the start.
  if (prevP && Vector3.distance(p, prevP) > TELEPORT_JUMP) {
    prevP = Vector3.create(p.x, p.y, p.z)
    if (Vector3.distance(p, SPAWN) < 6) {
      phase = 'idle'
      elapsed = 0
      pushHud()
    }
    return
  }

  let speed = 0
  if (prevP && dt > 0) {
    const dx = p.x - prevP.x
    const dz = p.z - prevP.z
    speed = Math.sqrt(dx * dx + dz * dz) / dt
  }
  prevP = Vector3.create(p.x, p.y, p.z)

  if (phase === 'idle') {
    // moved off the spawn: rolled 1.5 m forward, or clearly under power
    if (p.z > SPAWN.z + 1.5 || speed > START_SPEED) {
      phase = 'running'
      elapsed = 0
    }
  } else if (phase === 'running') {
    elapsed += dt
    if (p.z > FINISH_Z) {
      phase = 'finished'
      lastTime = elapsed
      if (bestTime === 0 || elapsed < bestTime) bestTime = elapsed
      console.log(`[CLIENT] race finish ${elapsed.toFixed(3)}s  (best ${bestTime.toFixed(3)}s)`)
    }
  }

  pushHud()
}

function pushHud() {
  raceHud.phase = phase
  raceHud.time = phase === 'finished' ? lastTime : elapsed
  raceHud.last = lastTime
  raceHud.best = bestTime
}

export function startRace() {
  setupRaceHud()
  engine.addSystem(raceSystem)
  console.log('[CLIENT] race timer ready')
}
