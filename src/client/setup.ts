// Client entry point. Builds the scene, then the vehicle.
import { TEST_FLAT } from './flags'
import { buildTrack } from './track'
import { buildTestPad } from './testpad'
import { startVehicle } from './vehicle'

export function startClient() {
  console.log('[CLIENT] setup')
  if (TEST_FLAT) buildTestPad()
  else buildTrack()
  startVehicle()
}
