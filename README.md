# Ludo Time

A ludo game that runs in the browser. No install, no build step — open `index.html` and play.

## Files

| File | What lives here |
|------|-----------------|
| `index.html` | The page itself: every screen, button and dialog |
| `style.css` | How it all looks: colours, sizes, layout, animations |
| `app.js` | How it all works: board maths, rules, computer opponent, online play |

`index.html` pulls in the other two, so all three must stay in the same folder.

## Playing

- **2 to 6 players.** Two, three and four use the classic cross board; five and six use a hexagonal one.
- **Vs Computer**, **Pass & Play** on one device, or **Play Online** with friends.
- **Quick** matches give each player 2 gotis, **Full** gives 4 (3 on the hex board).

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

Any static host will serve it: GitHub Pages, Cloudflare Pages, Netlify. Upload the three files
and the link works.

## Credits

Everything here is original. The board layout is the traditional game, which belongs to nobody.
All artwork is drawn by the code itself, and the music is generated live rather than recorded,
so there is nothing licensed in the project.
