/** SPIKE B debug HUD — throwaway. Monospace readout, top-left. */
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

export const hudState = {
  speed: 0,
  fps: 0,
  accelForce: 0,
  steerRate: 0,
  headingDeg: 0
}

function row(text: string, key: number) {
  return (
    <Label
      key={key}
      value={text}
      fontSize={22}
      font="monospace"
      color={Color4.create(0.6, 1, 0.9, 1)}
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
        width: 460,
        height: 210,
        flexDirection: 'column',
        padding: 10
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      {row(`SPEED    ${hudState.speed.toFixed(1)} m/s`, 0)}
      {row(`fps      ${hudState.fps.toFixed(0)}`, 1)}
      {row(`accel    ${hudState.accelForce.toFixed(0)}   [1/2]`, 2)}
      {row(`steer/s  ${hudState.steerRate.toFixed(0)}   [3/4]`, 3)}
      {row(`heading  ${hudState.headingDeg.toFixed(0)} deg   [F respawn]`, 4)}
    </UiEntity>
  </UiEntity>
)

export function setupSpikeBHud() {
  ReactEcsRenderer.setUiRenderer(Hud, { virtualWidth: 1920, virtualHeight: 1080 })
}
