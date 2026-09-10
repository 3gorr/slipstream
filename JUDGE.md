# Slipstream — guide for judges

A mobile-first downhill racing game for Decentraland. You ride a gyrosphere down a
winding track against the clock. On your **first run you race solo** to learn the
track — from your **second run on, ghosts of other real players' runs** race alongside
you, each with their name above them.

Everything below takes about 30 seconds. Play solo, on your phone, no host needed.

---

## Open it on your phone

**Scan this QR code with your phone camera**, then tap to open in the Decentraland app:

![Scan to play](./judge-qr.png)

Or paste this link into your phone's browser — it will offer to open the app:

```
decentraland://?realm=weareworking.dcl.eth&dclenv=org
```

If the app doesn't open, install **Decentraland Mobile** first (App Store / Google
Play), then scan again.

---

## How to play (30 seconds)

1. **You start rolling automatically.** The gyrosphere is pulled downhill by physics —
   you don't need to press anything to move.
2. **Steer with the touch joystick** (bottom-left of the screen): drag left / right to
   take the corners, stay on the track, and avoid the obstacles.
3. **Reach the finish** at the bottom. The timer stops and shows your run time.
4. **Tap RESTART** (bottom-right) to race again — and now you'll have rivals.

That's it — one finger, one screen.

---

## What to look for

- **Your first run is a solo warm-up** — just you, learning the track. Your run is
  recorded and sent to the server.
- **From your second run on, the ghosts racing beside you are other players' real
  recorded runs**, not bots. Each shows the player's name. You're competing against the
  community's actual laps, asynchronously — even when nobody else is online right now.
- Your own best run is saved and served to the **next** players as a ghost — so you
  leave a mark others race against.
- Your goal is simply to get down the track as fast as you can while chasing the ghosts
  ahead.

---

## Notes

- Open source (MIT). Repository: this repo.
- Deployed to the World `weareworking.dcl.eth` and live for the full judging period.
- Designed for Decentraland Mobile from the start — touch controls, fixed chase camera,
  safe-area HUD, lightweight scene.
