/** SPIKE A debug HUD — throwaway. Big monospace readout, top-left. */
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

export const hudState = {
  speed: 0,
  runSpeed: 0,
  extraGravity: 0,
  pitchSign: -1,
  fps: 0
}

function row(text: string, y: number) {
  return (
    <Label
      key={y}
      value={text}
      fontSize={22}
      font="monospace"
      color={Color4.create(0.6, 1, 0.7, 1)}
      textAlign="middle-left"
      uiTransform={{ width: '100%', height: 30 }}
    />
  )
}

const Hud = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 12, left: 12 },
        width: 420,
        height: 200,
        flexDirection: 'column',
        padding: 10
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      {row(`SPEED   ${hudState.speed.toFixed(1)} m/s`, 0)}
      {row(`run set ${hudState.runSpeed.toFixed(0)}   [1/2]`, 1)}
      {row(`gravity+ ${hudState.extraGravity.toFixed(0)}   [3/4]`, 2)}
      {row(`pitch   ${hudState.pitchSign > 0 ? '+' : '-'}   [E flip]`, 3)}
      {row(`fps     ${hudState.fps.toFixed(0)}   [F respawn]`, 4)}
    </UiEntity>
  </UiEntity>
)

export function setupSpikeAHud() {
  ReactEcsRenderer.setUiRenderer(Hud, { virtualWidth: 1920, virtualHeight: 1080 })
}
