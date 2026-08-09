# Scrabble Live

Party-style Scrabble for **5 devices or less**: one screen hosts the shared board, up to 4 phones join with a 4-letter code and play from their own rack. Every move syncs to every device in real time. Short on people? Fill the empty seats with **up to 3 bots** and play solo.

Sign in and it becomes a proper little site: friends, direct messages, profiles with stats and a picture, a full game archive, and a dictionary you can search on its own page.

**Stack:** Node.js + Express + Socket.io (server-authoritative game engine) · MongoDB via Mongoose for accounts · Cloudinary for profile pictures · React + Vite + Tailwind v4 + React Router (client). No WebRTC — all devices connect to one Socket.io server, so there are zero NAT/TURN headaches and the server is the single source of truth for validation and scoring.

**Everything account-shaped is optional.** With an empty `.env` the server boots and hosts guest games exactly as it always has; the sign-in screen says so and names the variables that would switch accounts on. See [Configuration](#configuration).

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
- Every word your tiles form is ringed **green** if it's real and **red** if it isn't, live, before you play it. The server answers from the same word list it validates against, so the ring never disagrees with the result.
- **Play** submits; the server validates and scores, then broadcasts to all screens. The score you actually earned bursts on screen, with confetti on a bingo.
- **Swap** exchanges selected tiles with the bag (ends your turn). **Pass** skips (tap twice to confirm).
- Blank tiles open a letter picker; they score 0 and show a red dot.
- **⟳ Refresh** pulls a fresh board and rack from the server (and reconnects first if the socket dropped). **Leave** gives up your seat — mid-game your tiles go back to the bag and turn order closes over you.
- **Tap the tile bag** (the count on the phone bar, the card on the board screen) to see exactly what letters are still to come.
- **📜** opens the full move history — every turn, who played it, the words, and the score.
- **💬** opens the table chat — see below.
- **🎨** picks one of **16 board themes**, grouped dark and light: Midnight Felt, Classic Wood, Emerald Table, Ocean Deep, Noir, Neon Arcade, Ruby Velvet, Slate & Copper, Autumn Oak, Lavender Dusk, Carbon & Lime, Parchment, Sakura, Arctic, Desert Sand, Mint Cream. A theme re-points the shared colour tokens, so the whole interface follows the board, not just the grid. The choice is per-device and remembered.
- Refreshing or losing connection is fine — the seat is held and the app auto-rejoins.

## Configuration

Copy `server/.env.example` to `server/.env`. Nothing in it is required:

| Variables | What they switch on | Without them |
|---|---|---|
| `MONGODB_URI`, `JWT_SECRET` | accounts, friends, DMs, game history, profiles | guest play only; `/api/auth/*` answers 503 naming the missing variable |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | profile pictures | the profile page works, the upload button is hidden |
| `PORT`, `CORS_ORIGIN`, `MONGODB_DB`, `JWT_EXPIRES_IN`, `CLOUDINARY_FOLDER` | — | sensible defaults |

`GET /api/health` reports what's on, and the client hides UI it can't back up.

## Accounts

Three ways in: **guest** (a name, nothing else), **register** (name, email, password), or **sign in**. A guest still gets a real row, so a guest's games are attributed and can be **claimed** later — same id, same stats, same history, now with a password.

Every player gets a short **tag** like `SCR-7QK4` alongside their name, which is what you hand someone who wants to add you.

## Friends

Search by name, tag, exact email, or raw id; the response says which it matched on. Email matching is exact only — substring email search would make the endpoint an address directory.

Requests are one-way until accepted, and asking someone who already asked you just accepts. Friends show live presence (online, and which room they're in), you can DM them outside any game, and you can tick several at once and **invite them all into your room** — the invite lands as a banner wherever they are in the site.

## Profiles

Name, bio, picture, and a record: games, wins and win rate, best game, bingos, average and total score, words and tiles played, and your **top word** with what it scored. All of it accumulates from finished games. Pictures go to Cloudinary, cropped to a square thumbnail server-side.

## Game archive

Every finished game is stored with its seats, final scores, winners and the complete turn log. `/history` lists them with who you played; opening one replays the whole game move by move — the same log the in-game panel shows, including the endgame leftover-tile settlement. There's also a "who you play most" list.

## Dictionary page

`/dictionary` is a standalone word tool, no account needed:

- **Is it a word?** — a straight yes/no from the game's own list, plus what it scores and longer words that start with it. A miss suggests near-neighbours instead of dead-ending.
- **Starts with** — every word from a prefix, shortest first.
- **From these letters** — what you could build from a rack; `?` is a blank.

## Tiles left

Tapping the bag opens a per-letter breakdown of what's **unseen** — deliberately unseen rather than the literal bag, because the bag alone would let you subtract and read an opponent's rack. Unseen means the bag *plus* the racks you can't see, minus your own tiles, which is exactly what tile-tracking at a real table gives you. The panel splits the total into bag / racks and calls out vowels, consonants and blanks.

None of this needs the server: every tile is either on the board or unseen, and the board is public, so `client/src/tiles.js` derives it from the 100-tile set minus what's been played.

## Move history

**📜** opens the turn-by-turn record: numbered turns, who took each one, the words formed with their individual scores, bingo bonuses, what the turn was worth, and the running total after it. Passes, swaps and walk-outs are in there too, and the end-of-game leftover-tile settlement gets its own entry showing each player's swing. A compact scoreboard pins to the top.

The engine keeps the log in `game.history`; the server pushes it as a `history` event only when a turn actually completes, so the frequent tile-drag preview broadcasts stay light. Anyone joining, rejoining or refreshing gets the whole log.

## Chat

Everyone in the room — all four phones and the board screen — shares one live thread, opened with **💬** from the lobby, mid-game, or the end screen. The button carries an unread badge while the popup is shut. On a phone it slides up as a sheet; on the board screen it docks in the corner so the grid stays visible.

The server keeps the last 80 messages per room and hands the backlog to anyone who joins, rejoins, or hits refresh, so reloading a phone doesn't lose the conversation. Alongside what people type, the thread records what happened at the table: who joined or left, when a bot sat down, when the game started, and who won. Messages are trimmed to 240 characters and throttled to a few per second.

## Bots

The host can seat up to 3 computer players from the lobby, each at Easy, Medium or Hard. They take their turn about a second or two after it comes round, so moves feel played rather than teleported in.

`server/bot.js` generates moves the classic way — anchors (empty squares touching the board), per-square cross-checks for the perpendicular word, and a prefix index over the dictionary to prune dead branches. Every candidate goes back through `validateMove()` for scoring, so a bot can never make a move a human couldn't.

Difficulty is how it picks from that list, and it's measured rather than asserted: over 20 three-way self-play games hard/medium/easy average **301 / 229 / 198** and hard takes 17 of 20. Hard plays the best move it can see; medium samples the top slice; easy is held to short words, modest turns and **never a bingo**, so a beginner isn't blown off the table. Once the bag is empty every level does the endgame arithmetic — going out collects the other racks, and tiles left in hand count against you twice.

One thing that *didn't* make it: weighting the rack you keep alongside the score, which is the textbook refinement. Across ~150 self-play games at several weights it came out a coin flip, because this word list is broad enough that almost any seven tiles bingo, leaving little for rack quality to decide. It stayed in exactly one place — choosing which tiles to swap back, where nothing else is on the line.

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
  index.js       Socket.io rooms, join codes, rejoin tokens, chat log, bot scheduling
  game.js        Pure game engine: bag, validation, scoring, leaving, endgame
  bot.js         Move generation (anchors + cross-checks + prefix index), difficulty
  accounts.js    Bridge: socket auth, presence, friend invites, history writes
  config.js      Every env var, and which features each one switches on
  api/           Express routers: auth, users, friends, messages, games, dictionary
  db/models/     User, Friendship, GameRecord, DirectMessage
  lib/           validate, stats, tokens, cloudinary, dictionary, presence
  test.js        Engine, bot and library unit tests            → npm test
  itest.js       End-to-end socket test (players, bots, chat)  → npm run test:socket
  apitest.js     Account API over HTTP (needs MongoDB)         → npm run test:api
client/src/
  App.jsx                 Session persistence + auto-rejoin + routing
  socket.js               Socket singleton (VITE_SERVER_URL override)
  constants.js            Board bonuses + letter values (render copy)
  scoring.js              Client-side "what is this play worth" preview
  tiles.js                Unseen-tile counts derived from the board
  themes.js               The 16 board themes + persistence
  components/Board.jsx      15×15 grid, scales via container queries
  components/HostView.jsx   Lobby (code-as-tiles, bots, timer), live board, score rail
  components/PlayerView.jsx Rack, tap-to-place, swap/pass/blank picker, zoom
  components/Sheet.jsx      Popup shell shared by chat / tiles / history
  components/Chat.jsx       Room chat popup + unread badge
  components/TilesPanel.jsx   What's left to come, per letter
  components/HistoryPanel.jsx Turn-by-turn log with running totals
  components/ThemePicker.jsx  Theme sheet, grouped dark/light
  components/ScoreBurst.jsx   Accepted-word score burst + bingo confetti
  api.js                  Typed calls into /api
  auth.jsx                Who is signed in + what this server supports
  pages/                  Game, SignIn, Profile, Friends, Dictionary, History
```

**Socket events:** `host:create` `host:start` `host:restart` `host:close` `host:setTimer` · `host:addBot` `host:removeBot` `host:setBotDifficulty` · `player:join` `player:move` `player:pass` `player:swap` `player:preview` `player:leave` · `chat:send` · `rejoin` `client:refresh` → server emits `state` (public, racks hidden) to the room, `rack` privately to each player, `history` for the move log, `chat:new` / `chat:history` for the thread, and `room:closed` when the host shuts the room down.


Mobile App Link : https://scrable-app.vercel.app/scrablle.apk
