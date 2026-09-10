# Slipstream

A short, fast downhill run in a Decentraland World, tuned for the Decentraland mobile app.

A run lasts about 25 seconds. Your first run is a solo warm-up — just you learning the
track. From your second run on, ghosts ride beside you: recorded runs of real people,
each carrying their name. When you finish, your run becomes a ghost for the next player,
served from a live leaderboard of the fastest times.

Nobody has to be online for you to race them. You don't come back because someone is
waiting — you come back because someone passed you.

Built for the **Friendzone Mobile Buildathon** (DCL Regenesis Labs). Open source, MIT licensed.

**Judges:** see [`JUDGE.md`](./JUDGE.md) for a 30-second guide and a QR code to play on your phone.

---

## How it works

- You ride a gyrosphere downhill against the clock; the touch joystick steers, physics
  handles the descent.
- Ghosts are **real players' recorded runs**, replayed beside you — asynchronous
  competition that works even when no one else is online.
- An authoritative server stores a top-3 leaderboard by best time (one entry per player)
  in persistent Storage, and serves those ghosts to the next racers. Your best run is
  encoded and uploaded on finish.

---

## Develop

```
npm install
npm start
```

The preview launches a local Multiplayer Server alongside the scene. Open the preview
with two different addresses to test the client/server exchange locally.

## Layout

```
src/
  index.ts       entry, isServer() branch
  client/        input, UI, ghost playback, own-run recorder, networking
  server/        game loop, leaderboard, Storage persistence
  shared/        ghost codec, registerMessages(), custom components
assets/          track.glb (visual), scene composite, generated assets
scripts/         gen-ghosts.mjs — offline ghost generator (fallback data)
```

## License

MIT — see [`LICENSE`](./LICENSE).
