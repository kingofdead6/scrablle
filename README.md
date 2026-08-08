# Scrabble Live

Party-style Scrabble for **5 devices or less**: one screen hosts the shared board, up to 4 phones join with a 4-letter code and play from their own rack. Every move syncs to every device in real time. Short on people? Fill the empty seats with **up to 3 bots** and play solo.

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
3. Optionally press **+ Add bot** (up to 3) — pick Easy/Medium/Hard before adding, or tap a bot's level to change it.
4. Host presses **Start game** (2–4 players, at least one of them human).

The client auto-connects its socket to `http://<same-hostname>:3001`, so whatever address you opened the page from is the one the phones use — no config needed. To point elsewhere, set `VITE_SERVER_URL` in `client/.env`.

## Production / deployment

```bash
cd client && npm run build   # outputs client/dist
cd ../server && npm start    # Express serves client/dist + Socket.io on one port
```

One process, one port — deploy `server/` (with the built `client/dist` next to it) to Render, Railway, or any Node host. Set `PORT` via env. Then everyone just opens the public URL; no LAN needed.

## How to play

- Tap a tile in your rack, then tap a square. Legal landing squares light up while a tile is selected. Tap a placed (gold-ringed) tile to take it back.
- The running total (**+24**, with each word broken down) appears above the rack and on the **Play** button as you place tiles, so you know what a word is worth before you commit.
- **Play** submits; the server validates and scores, then broadcasts to all screens. The score you actually earned bursts on screen, with confetti on a bingo.
- **Swap** exchanges selected tiles with the bag (ends your turn). **Pass** skips (tap twice to confirm).
- Blank tiles open a letter picker; they score 0 and show a red dot.
- **⟳ Refresh** pulls a fresh board and rack from the server (and reconnects first if the socket dropped). **Leave** gives up your seat — mid-game your tiles go back to the bag and turn order closes over you.
- **💬** opens the table chat — see below.
- **🎨** picks one of **16 board themes**, grouped dark and light: Midnight Felt, Classic Wood, Emerald Table, Ocean Deep, Noir, Neon Arcade, Ruby Velvet, Slate & Copper, Autumn Oak, Lavender Dusk, Carbon & Lime, Parchment, Sakura, Arctic, Desert Sand, Mint Cream. A theme re-points the shared colour tokens, so the whole interface follows the board, not just the grid. The choice is per-device and remembered.
- Refreshing or losing connection is fine — the seat is held and the app auto-rejoins.

## Chat

Everyone in the room — all four phones and the board screen — shares one live thread, opened with **💬** from the lobby, mid-game, or the end screen. The button carries an unread badge while the popup is shut. On a phone it slides up as a sheet; on the board screen it docks in the corner so the grid stays visible.

The server keeps the last 80 messages per room and hands the backlog to anyone who joins, rejoins, or hits refresh, so reloading a phone doesn't lose the conversation. Alongside what people type, the thread records what happened at the table: who joined or left, when a bot sat down, when the game started, and who won. Messages are trimmed to 240 characters and throttled to a few per second.

## Bots

The host can seat up to 3 computer players from the lobby, each at Easy, Medium or Hard. They take their turn about a second or two after it comes round, so moves feel played rather than teleported in.

`server/bot.js` generates moves the classic way — anchors (empty squares touching the board), per-square cross-checks for the perpendicular word, and a prefix index over the dictionary to prune dead branches. Every candidate goes back through `validateMove()` for scoring, so a bot can never make a move a human couldn't. Difficulty is how it picks from that list: Hard takes the best play, Medium samples the top slice, Easy takes the best of a handful of random looks. Bots hold on to blanks unless a play really pays for them, and swap awkward tiles when they're stuck.

## Rules implemented (server/game.js)

- Standard 100-tile English distribution, letter values, and premium-square layout.
- First word must cover the center star (2+ letters).
- Placements must be one row/column, gap-free, and connected to existing tiles.
- All words formed score; premium squares count only on the turn they're covered, and apply to **every** word formed that turn.
- Bingo: +50 for playing all 7 tiles.
- End: a player empties their rack with an empty bag (they gain everyone's leftover points, others subtract theirs), or two full rounds of scoreless turns.

**Dictionary enforced** — every word a play forms, main and cross-words alike, is checked against `an-array-of-english-words` before the move is accepted, and the rejection names the word that failed. The same set backs the bots' move generator.

## Architecture

```
server/
  index.js   Socket.io rooms, join codes, rejoin tokens, chat log, bot scheduling
  game.js    Pure game engine: bag, validation, scoring, leaving, endgame
  bot.js     Move generation (anchors + cross-checks + prefix index), difficulty
  test.js    Engine + bot unit tests (hand-verified scores)  → npm test
  itest.js   End-to-end socket test (players, bots, chat)    → node itest.js
client/src/
  App.jsx                 Session persistence + auto-rejoin + routing
  socket.js               Socket singleton (VITE_SERVER_URL override)
  constants.js            Board bonuses + letter values (render copy)
  scoring.js              Client-side "what is this play worth" preview
  themes.js               The 16 board themes + persistence
  components/Board.jsx      15×15 grid, scales via container queries
  components/HostView.jsx   Lobby (code-as-tiles, bots, timer), live board, score rail
  components/PlayerView.jsx Rack, tap-to-place, swap/pass/blank picker, zoom
  components/Chat.jsx       Room chat popup + unread badge
  components/ThemePicker.jsx  Theme sheet, grouped dark/light
  components/ScoreBurst.jsx   Accepted-word score burst + bingo confetti
```

**Socket events:** `host:create` `host:start` `host:restart` `host:close` `host:setTimer` · `host:addBot` `host:removeBot` `host:setBotDifficulty` · `player:join` `player:move` `player:pass` `player:swap` `player:preview` `player:leave` · `chat:send` · `rejoin` `client:refresh` → server emits `state` (public, racks hidden) to the room, `rack` privately to each player, `chat:new` / `chat:history` for the thread, and `room:closed` when the host shuts the room down.


Mobile App Link : https://scrable-app.vercel.app/scrablle.apk
