# Judging Slipstream — 2 minutes

**Nobody has ever ridden this alone.**

This is a solo-playable, no-server-required experience. You do not need anyone
else online, and you do not need to wait for anything to warm up — ghosts of
past riders are already on the track from the first frame.

## 1. Open the World

<!-- TODO: paste a QR code image here once the world is live for judging.
     Generate it from the join link below, e.g. with `npx qrcode-terminal`
     or any QR generator, and save it as assets/images/judge-qr.png -->

📱 **[assets/images/judge-qr.png](assets/images/judge-qr.png)**

Or open directly in the Decentraland Mobile App:

```
https://play.decentraland.org/?realm=weareworking.dcl.eth
```

Best on **mobile, landscape orientation**. Desktop client works too.

## 2. Ride

- You spawn already rolling downhill inside the gyrosphere. No tutorial, no menu.
- **Joystick** (left thumb) steers left/right.
- **Action button** (right thumb) is **boost**. Tap it while inside a boost ring
  on the wall track for a speed burst; tap it outside a ring and you lose a
  little speed instead — that's the whole risk/reward.
- Six ghosts run beside you the entire way — real people's past runs, with
  their names. One of them, the current record holder, rides in their real
  Decentraland wearables. The rest are silhouettes, colored by their place on
  the board.
- The run takes **50–70 seconds**. Floor holds you in from start to finish —
  there is nothing to get lost in.

## 3. Finish

- Your time is compared against the leaderboard automatically, server-side —
  you don't submit anything by hand.
- If you beat someone's time, your run becomes a ghost for the next rider.
- Come back a second time (if you want) — you'll see whether anyone passed you
  since your last run.

## What to look for, mapped to the judging criteria

| Criterion | Where it shows up |
|---|---|
| Mobile-First Experience | Touch joystick + single boost button, no desktop-only input assumed |
| Social Value | Six ghosts always present; asynchronous rivalry, no live players required |
| Mobile UX & Accessibility | Landscape-only, safe-area-aware HUD, large touch targets |
| Performance | Fused track geometry, silhouette ghosts (only 1 real avatar loaded), boost rings are emissive materials not lights |
| Creativity & Originality | Gyrosphere movement (not avatar locomotion), server-authoritative anti-cheat timing as a side effect |
| Retention & Discovery | Inbox tells you who passed you since your last run — the reason to come back |
| Overall Execution | Playable end-to-end with zero live players and a cold server, by design |

## If something looks broken

- **No ghosts on first load / a `syncing` indicator:** expected on a cold
  server. The single-player loop (track, timer, ghosts) works entirely from
  the baked ghost file and does not wait on the server — if it doesn't, that's
  a bug, not the intended cold-start behavior.
- **Portrait orientation:** not supported. Rotate to landscape.

---

Repository: this repo. Open source, MIT licensed. Built for the
[Friendzone Mobile Buildathon](https://dorahacks.io/hackathon/friendzone/detail)
(DCL Regenesis Labs).
