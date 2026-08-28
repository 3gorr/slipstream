/**
 * Temporary flat test pad (behind flags.TEST_FLAT). One export: buildTestPad().
 *
 * The scene is only 16 m wide (1 parcel), so the pad is a long corridor —
 * 14 m across, 100 m along Z — not a square. Border walls on all four sides,
 * scattered pillar markers to read cornering and drift against. No slope, so the
 * vehicle uses manual throttle here.
 */
import { engine, Transform, MeshRenderer, MeshCollider, Material, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'

const PAD_W = 14
const PAD_L = 100
const PAD_CX = 8
const PAD_CZ = 80
const WALL_H = 3
const WALL_T = 0.4

export const TESTPAD_SPAWN = Vector3.create(PAD_CX, 1.2, PAD_CZ)
export const TESTPAD_LOOK = Vector3.create(PAD_CX, 1, PAD_CZ + 20)

const FLOOR_COLOR = Color4.create(0.13, 0.13, 0.17, 1)
const WALL_COLOR = Color4.create(0.1, 0.1, 0.14, 1)
const PILLAR_GLOW = Color3.create(1, 0.5, 0.15)

function box(pos: Vector3, scale: Vector3, collide: boolean, color: Color4) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  MeshRenderer.setBox(e)
  if (collide) MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(e, { albedoColor: color, metallic: 0, roughness: 1 })
  return e
}

export function buildTestPad() {
  // floor: top face at y = 0.1
  box(Vector3.create(PAD_CX, -0.1, PAD_CZ), Vector3.create(PAD_W, 0.4, PAD_L), true, FLOOR_COLOR)

  // border walls
  box(Vector3.create(PAD_CX, WALL_H / 2, PAD_CZ - PAD_L / 2), Vector3.create(PAD_W + 2 * WALL_T, WALL_H, WALL_T), true, WALL_COLOR)
  box(Vector3.create(PAD_CX, WALL_H / 2, PAD_CZ + PAD_L / 2), Vector3.create(PAD_W + 2 * WALL_T, WALL_H, WALL_T), true, WALL_COLOR)
  box(Vector3.create(PAD_CX - PAD_W / 2, WALL_H / 2, PAD_CZ), Vector3.create(WALL_T, WALL_H, PAD_L), true, WALL_COLOR)
  box(Vector3.create(PAD_CX + PAD_W / 2, WALL_H / 2, PAD_CZ), Vector3.create(WALL_T, WALL_H, PAD_L), true, WALL_COLOR)

  // pillar markers — visual reference only, no collider so you never snag on them
  const spots: [number, number][] = [
    [-4, -35],
    [4, -20],
    [-3, -5],
    [3, 8],
    [-4, 22],
    [4, 34],
    [0, -30],
    [0, 30]
  ]
  for (const [ox, oz] of spots) {
    const p = engine.addEntity()
    Transform.create(p, {
      position: Vector3.create(PAD_CX + ox, 2, PAD_CZ + oz),
      scale: Vector3.create(0.4, 4, 0.4),
      rotation: Quaternion.Identity()
    })
    MeshRenderer.setBox(p)
    Material.setPbrMaterial(p, {
      albedoColor: Color4.create(PILLAR_GLOW.r, PILLAR_GLOW.g, PILLAR_GLOW.b, 1),
      emissiveColor: PILLAR_GLOW,
      emissiveIntensity: 1.5
    })
  }

  console.log('[CLIENT] test pad built')
}
