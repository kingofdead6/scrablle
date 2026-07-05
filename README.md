# Scrabble Live

Party-style Scrabble for **5 devices or less**: one screen hosts the shared board, up to 4 phones join with a 4-letter code and play from their own rack. Every move syncs to every device in real time.

**Stack:** Node.js + Express + Socket.io (server-authoritative game engine) · React + Vite + Tailwind v4 (client). No WebRTC — all devices connect to one Socket.io server, so there are zero NAT/TURN headaches and the server is the single source of truth for validation and scoring.

## Quick start (dev)

```bash
# Terminal 1 — server on :3001
cd server && npm install && npm start

# Terminal 2 — client on :5173 (exposed on LAN)
cd client && npm install && npm run dev
```

1. On the **host machine**, open the LAN URL Vite prints (e.g. `http://192.168.1.20:5173`) → **Create a room**. Use the LAN URL, not `localhost`, so the code screen shows an address phones can actually reach.
2. On each **phone** (same Wi-Fi), open that same URL → enter the 4-letter code + a name.
3. Host presses **Start game** (2–4 players).

The client auto-connects its socket to `http://<same-hostname>:3001`, so whatever address you opened the page from is the one the phones use — no config needed. To point elsewhere, set `VITE_SERVER_URL` in `client/.env`.

## Production / deployment

```bash
cd client && npm run build   # outputs client/dist
cd ../server && npm start    # Express serves client/dist + Socket.io on one port
```

One process, one port — deploy `server/` (with the built `client/dist` next to it) to Render, Railway, or any Node host. Set `PORT` via env. Then everyone just opens the public URL; no LAN needed.

## How to play

- Tap a tile in your rack, then tap a square. Tap a placed (gold-ringed) tile to take it back.
- **Play** submits; the server validates and scores, then broadcasts to all screens.
- **Swap** exchanges selected tiles with the bag (ends your turn). **Pass** skips (tap twice to confirm).
- Blank tiles open a letter picker; they score 0 and show a red dot.
- Refreshing or losing connection is fine — the seat is held and the app auto-rejoins.

## Rules implemented (server/game.js)

- Standard 100-tile English distribution, letter values, and premium-square layout.
- First word must cover the center star (2+ letters).
- Placements must be one row/column, gap-free, and connected to existing tiles.
- All words formed score; premium squares count only on the turn they're covered, and apply to **every** word formed that turn.
- Bingo: +50 for playing all 7 tiles.
- End: a player empties their rack with an empty bag (they gain everyone's leftover points, others subtract theirs), or two full rounds of scoreless turns.

**No dictionary check** — like table Scrabble, players police each other's words. To enforce one, load a word list into a `Set` and reject in `validateMove()` right after the words are collected:

```js
for (const w of words) {
  const word = w.map(x => x.cell.letter).join('');
  if (!DICTIONARY.has(word)) return { error: `${word} is not a valid word.` };
}
```

## Architecture

```
server/
  index.js   Socket.io rooms, join codes, rejoin tokens, broadcasting
  game.js    Pure game engine: bag, validation, scoring, endgame
  test.js    Engine unit tests (hand-verified scores)   → npm test
  itest.js   End-to-end socket test (2 players + host)  → node itest.js
client/src/
  App.jsx                 Session persistence + auto-rejoin + routing
  socket.js               LAN-aware socket singleton
  constants.js            Board bonuses + letter values (render copy)
  components/Board.jsx    15×15 grid, scales via container queries
  components/HostView.jsx Lobby (code-as-tiles), live board, score rail, rematch
  components/PlayerView.jsx Rack, tap-to-place, swap/pass/blank picker, zoom
```

**Socket events:** `host:create` `host:start` `host:restart` · `player:join` `player:move` `player:pass` `player:swap` · `rejoin` → server emits `state` (public, racks hidden) to the room and `rack` privately to each player.


Mobile App Link : https://scrable-app.vercel.app/scrablle.apk
