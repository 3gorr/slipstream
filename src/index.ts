import { isServer } from '@dcl/sdk/network'

// Static import — registerMessages() must run at module load, before the engine
// seals. Never move this behind a dynamic import(). See CLAUDE.md section 4.
import './shared/messages'

export function main() {
  if (isServer()) {
    console.log('[SERVER] up')
    // import('./server/server').then((m) => m.startServer())
  } else {
    console.log('[CLIENT] up')
    // --- SPIKE B (throwaway) ---
    void import('./client/spike-b-hud').then((m) => m.setupSpikeBHud())
    void import('./client/spike-b').then((m) => m.startSpikeB())
  }
}
