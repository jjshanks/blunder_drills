# Test Report 2026-11-01: Triage and Plan

Written 2026-11-01. A tester ran the app end to end on their own game and reported 9 bugs and 6 suggestions. This file records what was fixed, what is not fixed yet, and a plan for the larger items.

## Bugs

| # | Report | Status | Change |
| --- | --- | --- | --- |
| 1 | A filter can hide the puzzle on the board. Next then goes to puzzle 1. | Fixed | `syncBoard()` opens the next visible puzzle in game order (or the last one). The chart markers now follow the filter too. |
| 2 | A game with no puzzles keeps "Finding puzzles…". The tip says "Include mistakes" when it is on. | Fixed | `emptyText()` says "No puzzles in this game" (or "for <player>") and gives only the tips that apply. |
| 3 | "It still mates, but in 6, not 2" on a "Mate in 3" step. | Fixed | The text counts the move just played, the same as the prompt. |
| 4 | The Lichess export asks for the whole engine line, quiet moves included. | Fixed | A blunder or mistake chapter has only the key move. The engine line is a comment. A mate chapter keeps its full line. |
| 5 | Show solution leaves the board at the start, with no arrow. | Fixed | The board plays the solving move (with the slide and the last-move squares). With Autoplay on, it plays the whole line, as before. |
| 6a | "4.Qf3 allowed 5…Nxe4" does not say that 4…Nd4 attacks the queen. | Not fixed | Needs a new motif. See [Threats](#threats-bug-6a). |
| 6b | A mate in 4 is explained as "takes the bishop for free". | Fixed | In a line that ends in mate, material won on the way does not confirm a motif. Only a motif that the mate pays off counts. |
| 6c | "Gives away too much" for a move that keeps Black at −3.6. | Fixed | When the side is still better, the text says "<side> is still better, but the best move is much stronger." |
| 7 | Nothing survives a reload. A new depth wipes the progress. | Fixed | Depth, the mate limit and "Include mistakes" are saved. The progress of each game is saved under a hash of its moves, so it stays at any depth. |
| 8 | The part of the chart that is not analysed yet looks like a Black advantage. | Fixed | That part is now empty, with a dashed outline. |
| 9a | Copy FEN and Copy PGN show no "Copied". | Fixed | Cause: the Clipboard API was blocked, and the fallback text box is in the puzzle list, far from Copy FEN. The app now tries `execCommand('copy')` before it shows the box. |
| 9b | The moves in the line are plain text. | Fixed | Each move is a button that goes to that move. They are not tab stops: the arrow keys do the same. |
| 9c | A bad PGN does not name the bad move. | Fixed | "Could not play the move Ke3. Check it for a typo or an illegal move." chess.js gives only the move, not its number. |

## Suggestions

| Suggestion | Status |
| --- | --- |
| Default the filter to your side | Done. The app remembers the last player you chose by name. The next game opens on that player when the name is in its headers. |
| Keyboard shortcuts | Done: H hint, S solution, R retry, P previous, N next. The buttons show them in their tooltips and in `aria-keyshortcuts`. |
| Save progress per game | Done (bug 7). Spaced repetition is not done. See [Review queue](#review-queue). |
| Faster deep analysis | Not done. See [Faster analysis](#faster-analysis). |
| Import games by username | Not done. See [Game import](#game-import). |
| Rename the "Game: 16. b3" tab | Open question. See [Questions](#questions). |

## Plan for the items not done

### Faster analysis

Depth 18 took 54.7 s, and depth 14 took 2.6 s, for the same game. Three changes, smallest first:

1. **Cache by position and depth.** Keep `{ fen + depth → result }` in memory. A new analysis of the same game at the same depth is then instant. A result at a greater depth can serve a request at a lower depth. To keep results after a reload, store them per game in localStorage (about 20 KB for a 90-ply game), and keep only the last 20 games.
2. **Two passes.** Analyse each position at depth 12 first and show the puzzles. Then analyse again at the chosen depth only the positions around a drop of 0.15 or more in win chance (the position before the move and the position after it). A blunder at depth 18 that depth 12 does not see at all would be missed. Measure how often that happens on 20 real games before this becomes the default.
3. **Threads.** The multi-threaded Stockfish build needs `SharedArrayBuffer`, which needs the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers. **GitHub Pages cannot set these headers**, so the tester's note that "you control your own server" is not true for the planned host. A known workaround is a service worker that adds the headers (for example `coi-serviceworker`). It also makes every CDN script need CORS or CORP headers. Not verified yet: if the stockfish@18 npm package has a threaded "lite" build, and if unpkg and jsDelivr send the headers that COEP needs. Do a small experiment first.

### Review queue

Spaced repetition across games:

- Keep one record per puzzle: `{ gameKey, ply, type, fen, best, pv, due, interval, ease }`. The progress per game (bug 7) already gives the key.
- A "Review" tab shows the puzzles that are due, from all games. A first-try solve makes the interval longer. A miss, a hint or a revealed solution sets it back to one day.
- Use SM-2 or a simpler Leitner box. Leitner is enough for a first version.
- localStorage has about 5 MB. A puzzle record is about 300 bytes, so space is not a problem for thousands of puzzles.

### Game import

- Lichess: `GET https://lichess.org/api/games/user/{name}?max=20&pgnInJson=false` returns PGN as a stream, and it allows CORS.
- Chess.com: `GET https://api.chess.com/pub/player/{name}/games/archives`, then one month of games. Not verified if it allows CORS from a `github.io` page. Check this first.
- A batch analysis needs the cache and the review queue above. Without them, a batch only makes a long list that does not survive a reload.
- The import sends the username to a third-party API. That is acceptable, because the user types it for that purpose.

### Threats (bug 6a)

The tactics checker finds motifs that win material. 4…Nd4 only attacks the queen, so it is not a motif: the queen moves away, and then 5…Nxe4 wins a pawn. The checker reports the pawn capture, which is true but misses the point.

A possible "attack with tempo" rule: attacker move A attacks a piece worth more than the attacker. The defender moves that piece away. The attacker's next move wins material that the moved piece defended before, or that the defender's move left undefended. This is close to "removal of the defender" in [tactics-plan.md](tactics-plan.md), and it has the same risk of false reports. Do it with the defender tactics, with near-miss tests.

## Questions

1. **The "Game: 16. b3" tab.** It shows the game move, then the engine's best answer. The tester read it as the moves of the game. Options: rename it to "Refuted: 16. b3", or keep the name and add a line under it: "After the game move, the engine plays the best answer." Which do you prefer?
2. **Lichess export of mates.** A mate chapter still asks for the exact mating line, and Lichess plays a fixed defence. The app accepts any mate in the same number of moves. Not verified: if Lichess accepts a move that is in a variation of an Interactive lesson. If it does, the export could add the other mating first moves as variations.

## Smells found during the fixes

- The clipboard fallback box says "paste into a Lichess Study", but Copy FEN uses it too. It is in the puzzle list, far from Copy FEN. It now shows only when both copy methods fail, so it is rare.
- When the engine stops during an analysis, the trainer prompt stays at "Finding puzzles…". The error line above it is correct.
- The saved progress has one localStorage entry per game, and nothing removes old entries. Each entry is small (under 1 KB), so this is not urgent. The review queue should own this data later.
