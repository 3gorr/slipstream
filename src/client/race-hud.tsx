/** Race HUD — live clock, finish panel, on-screen restart button.
 * Also hosts the desktop-only debug tuning panel (DEBUG_HUD in flags.ts). */
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { InputAction } from '@dcl/sdk/ecs'
import { DEBUG_HUD, TOUCH_TUNE, SHOW_TOUCH_TUNE, SHOW_DEBUG_PANEL, SHOW_NET_DEBUG } from './flags'
import { debugHud, requestRespawn } from './vehicle'
import { netState, racerNameRaw } from './net'

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

const GREEN = Color4.create(0.5, 1, 0.7, 1)

const Clock = () => (
  <UiEntity
    uiTransform={{ positionType: 'absolute', position: { top: 20 }, width: '100%', height: 84, justifyContent: 'center' }}
  >
    <Label
      value={fmt(raceHud.time)}
      fontSize={58}
      font="monospace"
      color={raceHud.phase === 'finished' ? GREEN : Color4.White()}
      textAlign="middle-center"
      uiTransform={{ width: 380, height: 80 }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
    />
  </UiEntity>
)

const ResultPanel = () => {
  if (raceHud.phase !== 'finished') return <UiEntity uiTransform={{ display: 'none' }} />
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 170 },
        width: '100%',
        height: 210,
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: 380, height: 196, flexDirection: 'column', alignItems: 'center', padding: 14 }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.62) }}
      >
        <Label value="FINISH" fontSize={28} color={GREEN} uiTransform={{ width: '100%', height: 38 }} textAlign="middle-center" />
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
        <Label
          value="tap RESTART to race again"
          fontSize={18}
          color={Color4.create(0.75, 0.75, 0.75, 1)}
          uiTransform={{ width: '100%', height: 30 }}
          textAlign="middle-center"
        />
      </UiEntity>
    </UiEntity>
  )
}

// Bottom-right thumb zone. Native joystick sits bottom-left; native buttons are
// hidden (setupMobileControls), so this corner is clear. IA_PRIMARY = the same
// action F / E trigger on desktop, so vehicle.ts already handles it; onMouseDown
// is a direct backup in case a client does not honour uiInputBinding.
const RestartButton = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { bottom: 40, right: 40 },
      width: 132,
      height: 132,
      justifyContent: 'center',
      alignItems: 'center',
      pointerFilter: 'block'
    }}
    uiBackground={{ color: Color4.create(0.85, 0.22, 0.28, 0.85) }}
    uiText={{ value: 'RESTART', fontSize: 20, color: Color4.White(), textAlign: 'middle-center' }}
    uiInputBinding={{ actions: [InputAction.IA_PRIMARY] }}
    onMouseDown={requestRespawn}
  />
)

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

// Temporary: touch-steer calibration readout (TOUCH_TUNE). Top-left, small.
const TouchTunePanel = () => {
  if (!TOUCH_TUNE) return <UiEntity uiTransform={{ display: 'none' }} />
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 116, left: 24 },
        width: 236,
        height: 34,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
      uiText={{
        value: `touch steer ${debugHud.touchSteer.toFixed(0)}   [1 / 2]`,
        fontSize: 18,
        color: Color4.create(0.8, 1, 0.9, 1),
        textAlign: 'middle-center'
      }}
    />
  )
}

// Dev-only network indicator, gated by SHOW_NET_DEBUG (default false — a judge
// never sees this). The racer-name cache in net.ts runs regardless.
const NetPanel = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: 60, left: 24 },
      width: 360,
      height: 30,
      justifyContent: 'flex-start',
      alignItems: 'center'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    uiText={{
      // TEMP: name suffix is a diagnostic for the racerName cache — remove with the panel.
      value:
        (netState.serverConnected ? 'server: connected' : 'server: waiting…') +
        (racerNameRaw() ? ` · ${racerNameRaw()}` : ' · (no name)'),
      fontSize: 16,
      color: netState.serverConnected ? Color4.create(0.5, 1, 0.7, 1) : Color4.create(1, 0.8, 0.4, 1),
      textAlign: 'middle-left'
    }}
  />
)

const Hud = () => {
  // Clock / ResultPanel / RestartButton are the real race UI — always on.
  // The debug panels render only when their flag is set (flags.ts), so a judge
  // never sees them.
  const panels = [Clock(), ResultPanel(), RestartButton()]
  if (SHOW_DEBUG_PANEL) panels.push(DebugPanel())
  if (SHOW_TOUCH_TUNE) panels.push(TouchTunePanel())
  if (SHOW_NET_DEBUG) panels.push(NetPanel())
  return <UiEntity uiTransform={{ width: '100%', height: '100%' }}>{panels}</UiEntity>
}

export function setupRaceHud() {
  // 'interactable' keeps the HUD clear of the client's own UI (minimap, chat,
  // left controls); device safe-area insets apply on top automatically on 7.26+.
  ReactEcsRenderer.setUiRenderer(Hud, {
    virtualWidth: 1920,
    virtualHeight: 1080,
    screenInset: 'interactable'
  })
}
