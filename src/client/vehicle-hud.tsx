/** Vehicle tuning HUD — only shown in TEST_FLAT mode. */
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

export const hudState = {
  steerRate: 0,
  accelForce: 0,
  speed: 0,
  throttle: false
}

function row(text: string, key: number) {
  return (
    <Label
      key={key}
      value={text}
      fontSize={22}
      font="monospace"
      color={Color4.create(0.7, 1, 0.85, 1)}
      textAlign="middle-left"
      uiTransform={{ width: '100%', height: 28 }}
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
        height: 170,
        flexDirection: 'column',
        padding: 10
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      {row(`SPEED     ${hudState.speed.toFixed(1)} m/s  ${hudState.throttle ? '[gas]' : ''}`, 0)}
      {row(`steer/s   ${hudState.steerRate.toFixed(0)} deg   [1 / 2]`, 1)}
      {row(`accel     ${hudState.accelForce.toFixed(0)}   [3 / 4]`, 2)}
      {row(`W forward   A/D steer   F respawn`, 3)}
    </UiEntity>
  </UiEntity>
)

export function setupVehicleHud() {
  ReactEcsRenderer.setUiRenderer(Hud, { virtualWidth: 1920, virtualHeight: 1080 })
}
