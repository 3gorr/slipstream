// Server entry. Reached via a dynamic import() inside the isServer() branch of
// src/index.ts (mirrors the client side). Keep it that way: once this file
// starts importing @dcl/sdk/server (Storage etc.), the dynamic import is what
// keeps that off the client bundle path.
//
// B0: prove the client↔server channel. Every clientHello is answered with a
// serverHello sent back to that same client. No game loop, no storage yet.

import { room } from '../shared/messages'

export function startServer() {
  console.log('[SERVER] setup')

  room.onMessage('clientHello', (_data, ctx) => {
    const from = ctx?.from
    console.log('[SERVER] clientHello from', from ?? '(unknown)')
    if (from) void room.send('serverHello', { t: Date.now() }, { to: [from] })
    else void room.send('serverHello', { t: Date.now() })
  })
}
