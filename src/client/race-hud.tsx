/** Race timer HUD. Big live clock during the run; result panel on finish.
 * Also hosts the temporary debug tuning panel (DEBUG_HUD in flags.ts). */
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { DEBUG_HUD } from './flags'
import { debugHud } from './vehicle'

export const raceHud = {
  phase: 'idle' as 'idle' | 'running' | 'finished',
  time: 0, // seconds — live while running, final when finished
  last: 0,
  best: 0
}

function p2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}
function p3(n: number) {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`
}
function fmt(t: number): string {
  if (t <= 0) return '00:00.000'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const ms = Math.floor((t * 1000) % 1000)
  return `${p2(m)}:${p2(s)}.${p3(ms)}`
}

const Clock = () => (
  <UiEntity
    uiTransform={{ positionType: 'absolute', position: { top: 24 }, width: '100%', height: 90, justifyContent: 'center' }}
  >
    <Label
      value={fmt(raceHud.time)}
      fontSize={64}
      font="monospace"
      color={raceHud.phase === 'finished' ? Color4.create(0.5, 1, 0.7, 1) : Color4.create(1, 1, 1, 1)}
      textAlign="middle-center"
      uiTransform={{ width: 420, height: 84 }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.45) }}
    />
  </UiEntity>
)

const ResultPanel = () => {
  if (raceHud.phase !== 'finished') return <UiEntity uiTransform={{ display: 'none' }} />
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 150 },
        width: '100%',
        height: 220,
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: 420, height: 200, flexDirection: 'column', alignItems: 'center', padding: 16 }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
      >
        <Label value="FINISH" fontSize={30} color={Color4.create(0.5, 1, 0.7, 1)} uiTransform={{ width: '100%', height: 40 }} textAlign="middle-center" />
        <Label
          value={`time   ${fmt(raceHud.last)}`}
          fontSize={26}
          font="monospace"
          color={Color4.White()}
          uiTransform={{ width: '100%', height: 36 }}
          textAlign="middle-center"
        />
        <Label
          value={`best   ${fmt(raceHud.best)}`}
          fontSize={26}
          font="monospace"
          color={raceHud.last <= raceHud.best ? Color4.create(1, 0.9, 0.3, 1) : Color4.create(0.8, 0.8, 0.8, 1)}
          uiTransform={{ width: '100%', height: 36 }}
          textAlign="middle-center"
        />
        <Label value="F — restart" fontSize={20} color={Color4.create(0.75, 0.75, 0.75, 1)} uiTransform={{ width: '100%', height: 32 }} textAlign="middle-center" />
      </UiEntity>
    </UiEntity>
  )
}

function dbgRow(text: string) {
  return (
    <Label
      value={text}
      fontSize={18}
      font="monospace"
      color={Color4.create(0.75, 1, 0.85, 1)}
      textAlign="middle-left"
      uiTransform={{ width: '100%', height: 24 }}
    />
  )
}

// Left side, ~34% down — clear of the centre-top clock and the right-side DCL HUD.
const DebugPanel = () => {
  if (!DEBUG_HUD) return <UiEntity uiTransform={{ display: 'none' }} />
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 370, left: 40 },
        width: 250,
        height: 176,
        flexDirection: 'column',
        padding: 10
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      {dbgRow(`speed    ${debugHud.speed.toFixed(1)} m/s`)}
      {dbgRow(`fps      ${debugHud.fps.toFixed(0)}`)}
      {dbgRow(`seamPin  ${debugHud.seamPin.toFixed(1)}  [1/2]`)}
      {dbgRow(`pinForce ${debugHud.pinForce.toFixed(1)}  [3/4]`)}
      {dbgRow(`steer/s  ${debugHud.steerRate.toFixed(0)}`)}
      {dbgRow(`wallBrk  ${debugHud.wallBrake.toFixed(1)}`)}
    </UiEntity>
  )
}

const Hud = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>{[Clock(), ResultPanel(), DebugPanel()]}</UiEntity>
)

export function setupRaceHud() {
  ReactEcsRenderer.setUiRenderer(Hud, { virtualWidth: 1920, virtualHeight: 1080 })
}
