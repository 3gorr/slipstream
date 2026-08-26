import { isServer } from '@dcl/sdk/network'

// Static import — registerMessages() must run at module load, before the engine
// seals. Never move this behind a dynamic import(). See CLAUDE.md section 4.
import './shared/messages'

export function main() {
  if (isServer()) {
    console.log('[SERVER] up')
    // Server-only modules (anything importing @dcl/sdk/server) are dynamically
    // imported here so they never reach the client bundle.
    // import('./server/server').then((m) => m.startServer())
  } else {
    console.log('[CLIENT] up')
    // import('./client/setup').then((m) => m.startClient())
  }
}
