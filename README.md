# Ludo Time

A ludo game that runs in the browser. Open `index.html` and play — no install, no build step.
Run the small server alongside it and coins and levels start following a player from one
phone to the next.

## Files

| File | What lives here |
|------|-----------------|
| `index.html` | The page itself: every screen, button and dialog |
| `style.css` | How it all looks: colours, sizes, layout, animations |
| `app.js` | How it all works: board maths, rules, computer opponent, online play |
| `server/server.js` | The web server: hands out the game, answers the account calls |
| `server/db.js` | The SQLite file that remembers who signed up and what they own |
| `server/auth.js` | Turning passwords into hashes, and handing out sign-in tokens |

The three files in the root are the whole game and must stay in the same folder. Everything
under `server/` is optional — leave it alone and the game still plays, guests and all.

## Playing

- **2 to 6 players.** Two, three and four use the classic cross board; five and six use a hexagonal one.
- **Vs Computer**, **Pass & Play** on one device, or **Play Online** with friends.
- **Quick** matches give each player 2 gotis, **Full** gives 4 (3 on the hex board).

## Accounts

Guests keep their coins in the browser they played in, which is fine until they pick up a
second phone and find nothing there. An account moves that pile onto the server instead, so
signing in anywhere brings it back.

Start the server:

```bash
node server/server.js
```

Then open `http://localhost:8777` — the server hands out the game as well as answering the
account calls, so there is only ever one address to remember. Set `PORT` to move it.

Sign up from the game itself: **Sign in with a username** → *Create an account instead*. A
guest who signs up carries the progress already on that device into the new account rather
than starting over.

Everything lives in one SQLite file, `ludotime.db`, made on first start and ignored by git.
`DATA_DIR` or `DB_PATH` puts it somewhere else, which is what a host with a mounted disk
wants. Passwords are never stored — only a scrypt hash with a salt of its own — and sign-in
is capped at six tries a minute per address, so a stolen copy of the file still opens no
doors. The database and the `server/` folder are refused over HTTP; only the game's own
files are served.

Accounts need the game on `http://localhost` or an `https://` address. Opened straight off
the disk there is no server to reach, and the button says so instead of hanging.

## Google sign-in

The button is wired up but needs a client ID of your own before Google will answer it.

1. Open the [Google Cloud console](https://console.cloud.google.com/), make a project.
2. **APIs & Services → OAuth consent screen** — pick *External*, fill in the app name and
   your email, and add yourself under *Test users* while it is still unpublished.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web
   application**.
4. Under *Authorised JavaScript origins* add every address the game is served from —
   `http://localhost:8777` while you work on it, plus the real `https://…` address once
   it is online. The port has to match exactly.
5. Copy the client ID into `GOOGLE_CLIENT_ID` near the top of the sign-in section in
   `app.js`.

Two things Google will not budge on: the page must come from `http://localhost` or an
`https://` address — a file opened straight off the disk is refused — and the origin must
be on that list. Until the client ID is filled in the button says so and points at guest
play, so nothing breaks either way.

## Online play

One player creates a room and gets a four-letter code; the others join with it. The phones talk
straight to each other — there is no game server. Whoever creates the room runs the match and
sends the board to everyone else after each move, so nobody's board can drift out of step.

## Rules

Standard ludo. Roll a six to bring a goti out. A six rolls again, but three in a row loses the
turn. Landing on an opponent sends it home and earns another roll. Starred squares are safe.
Two of your own gotis on one square block opponents from passing. The last step into the centre
must be exact.

## Putting it online

Without accounts it is three static files, so any static host will do: GitHub Pages,
Cloudflare Pages, Netlify. Upload them and the link works.

With accounts it needs somewhere that runs Node and keeps a disk between restarts — Render,
Fly.io and Railway all have a free tier that does. Point the host at `npm start`, give it a
writable folder through `DATA_DIR`, and let it set `PORT` itself. Nothing to build and no
packages to install: the server uses only what Node already carries, which is why it wants
Node 22.5 or newer for the built-in SQLite.

## Credits

Everything here is original. The board layout is the traditional game, which belongs to nobody.
All artwork is drawn by the code itself, and the music is generated live rather than recorded,
so there is nothing licensed in the project.
