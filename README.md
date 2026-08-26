# Slipstream

A short, fast downhill run in a Decentraland World, tuned for the Decentraland
mobile app.

A run lasts 50–70 seconds. While you ride, six ghosts ride beside you — recorded
runs of real people, carrying their names. When you finish, your run becomes a
ghost for the next player. If you knocked someone off the board, they find out
the next time they enter.

> **Nobody has ever ridden this alone.**

> **You don't come back because someone is waiting. You come back because someone passed you.**

Built for the **Friendzone Mobile Buildathon** (DCL Regenesis Labs). Open source,
MIT licensed.

## Status

Day 1 — spikes only. See [`SPIKE.md`](./SPIKE.md) for what has been measured and
which decisions are locked.

## Develop

```bash
npm install
npm start
```

The preview launches a local Multiplayer Server alongside the scene. Open the
preview twice, with two different addresses, to test multiplayer locally.

## Layout

```
src/
  index.ts       entry, isServer() branch
  client/        input, UI, ghost playback, own-run recorder
  server/        game loop, timing, leaderboard
  shared/        ghost codec, registerMessages(), custom components
static/          baked ghosts for the no-server path
assets/scene/    main.composite — initial scene entities
```
