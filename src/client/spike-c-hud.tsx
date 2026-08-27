/** SPIKE C status HUD — throwaway. Shows the exact phase so we can see where it stops. */
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

export const hudState = {
  line1: 'BOOT',
  line2: '',
  error: false
}

const Hud = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 12, left: 12 },
        width: 620,
        height: 110,
        flexDirection: 'column',
        padding: 10
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Label
        value={hudState.line1}
        fontSize={26}
        font="monospace"
        color={hudState.error ? Color4.create(1, 0.4, 0.4, 1) : Color4.create(0.6, 1, 0.7, 1)}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 34 }}
      />
      <Label
        value={hudState.line2}
        fontSize={20}
        font="monospace"
        color={Color4.create(0.85, 0.85, 0.85, 1)}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 28 }}
      />
    </UiEntity>
  </UiEntity>
)

export function setupSpikeCHud() {
  ReactEcsRenderer.setUiRenderer(Hud, { virtualWidth: 1920, virtualHeight: 1080 })
}
