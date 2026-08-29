// Client entry point. Builds the scene, the vehicle, then the race timer.
import { TEST_FLAT } from './flags'
import { buildTrack } from './track'
import { buildTestPad } from './testpad'
import { startVehicle } from './vehicle'
import { startRace } from './race'
import { startGhost } from './ghost'
import { setupMobileControls } from './mobile'

export function startClient() {
  console.log('[CLIENT] setup')
  if (TEST_FLAT) buildTestPad()
  else buildTrack()
  startVehicle()
  if (!TEST_FLAT) {
    setupMobileControls()
    startRace()
    startGhost()
  }
}
