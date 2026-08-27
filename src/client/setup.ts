// Client entry point. Builds the scene, then the vehicle.
import { buildTrack } from './track'

export function startClient() {
  console.log('[CLIENT] setup')
  buildTrack()
}
