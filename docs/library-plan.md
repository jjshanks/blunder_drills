# Blunder Drills: Game Library, Saved Puzzles and Training Plan

Written 2026-11-07. Status: PR 1 (game library) in progress. PR 2 and PR 3 not started.

## Goal

1. **Game library.** You can open a game again without a new paste and without a new analysis.
2. **Saved puzzles.** You can save a puzzle from any game.
3. **Training.** A mode shows your saved puzzles in random order. The puzzles that you missed come more often. The page keeps stats.

All data stays in the browser. Nothing goes to a server. The page stays one `index.html` with no build step.

## Decisions (2026-11-07)

| Question | Decision |
|---|---|
| Storage | localStorage, behind one small module (`Lib`). IndexedDB only if localStorage becomes too small. |
| Library | Each game that you paste goes into the library automatically. You can delete it. |
| Engine results | Cached for each game, with the full lines. |
| Saved puzzle | A full copy of the puzzle, not a reference to the game. |
| Training order | Random, and the puzzles that you missed come more often (see "Training"). |
| Training scope | All saved puzzles. No filter in the first version. |
| Export and import | Yes, in the first version (PR 3), because of the Safari risk below. |

## Why localStorage

- The page already uses it for the settings, the last game and the puzzle status.
- Reads are synchronous. The page can load a game at start with no extra async step.
- The data is small. One game with its engine results is about 15–25 KB: the sample game (88 positions) at depth 14 is 14.5 KB, and deeper lines are longer. The limit is about 5 MB, so about 200 games fit.
- When storage is full, the page removes the engine results of the games that you opened least recently. It keeps their PGN and puzzle status, which are small. Such a game analyzes again when you open it.

IndexedDB has a much larger limit, but it is async and needs more code. All storage goes through `Lib`, so a change to IndexedDB later stays in one place.

## Risks

1. **Shared origin.** The site is at `jjshanks.github.io/blunder_drills`. All `jjshanks.github.io` sites share one localStorage area and its limit. The `drills.` prefix stops name conflicts, but not the size limit. A custom domain would solve this.
2. **Safari deletes the data.** Safari deletes all script-writable storage of a site (localStorage and IndexedDB) after 7 days of Safari use with no visit to that site. The counter counts days on which you use Safari, not calendar days. A web app on the iOS Home Screen has its own counter. It is not clear if `navigator.storage.persist()` stops this deletion; we could not confirm it from a primary source. The real protection is **Export**: a JSON file that you keep, and that you can import again (also on a different device).
3. **Full storage.** Before this work, `store.set` ignored a failed write. That is fine for a setting. For the library, the page must tell you when storage is full.

## Data model

| Key | Value |
|---|---|
| `drills.games` | The index: an array of `{ k, w, b, date, result, moves, at }`, one for each game in the library. `at` is the last time that you opened it (ms). The sample game is not in the index. |
| `drills.g.<k>` | One game: `{ src, depth, done, evals, progress }`. `evals` is the engine result for each position, as `Engine.analyse` gives it, or `null` after removal. `done` is true when the analysis is complete. `progress` is `{ 'ply type': status }`, as before. |
| `drills.saved` | PR 2: the saved puzzles, `{ <id>: { puzzle, game, savedAt } }`. |
| `drills.train` | PR 3: the stats for each saved puzzle, `{ <id>: { box, tries, clean, last, lastAt } }`, and the totals. |

`<k>` is the hash of the start position and the moves (`gameKey`), as before. The sample game also has a `drills.g.<k>` record, so that its progress and engine results stay, but it is not in the index.

### Migration from the old keys

- `drills.src` (the last game): if it is not the sample, the page adds it to the library. Then it removes `drills.src`.
- `drills.game.<k>` (the old progress): when the page makes the record for game `<k>`, it moves the old progress into it and removes the old key. Old progress for a game that is not in the library stays until you paste that game again.

## PR 1: Game library

- **Open a game.** If the record has engine results that are complete, at the chosen depth or deeper, the page shows them at once. It does not wait for the engine. If the analysis stopped before the end at the same depth, the page analyzes only the positions that are missing. In all other cases, it analyzes the game again.
- **Save.** The page writes the engine results every 10 positions and at the end. A reload during the analysis then loses at most 10 positions.
- **A new depth.** When you change the depth, the page analyzes the game again at that depth, unless the cached results are at that depth or deeper.
- **"Your games".** A button in the game panel opens the list of games, the most recent first. A click opens a game. A × button deletes it. If you delete the game on the board, the next game in the list opens (or the sample).
- **Start.** The page opens the game that you opened last, or the sample when the library is empty.
- **Full storage.** See "Why localStorage". If storage is still full after the removal, the page shows an error.
- **GoatCounter.** One new event, `game-reopened`, when you open a game from the list. No game data.
- **README.** One sentence in the privacy section: your games, puzzles and stats stay in your browser.

## PR 2: Saved puzzles

- A ☆ Save button in the trainer head, and a star on each row of the puzzle list. A second click removes the puzzle.
- The page saves a full copy of the puzzle object: the position (FEN), the best move and line, the reply line (`refute`), the scores, the move played, the move before it, the type and the mate distance. It also saves the player names, the date and the game key, so that "Open game" works while the game is in the library.
- The ID is `<game key>:<ply>`.
- A copy still works when you delete the game, or when a new depth changes the type of the puzzle.

## PR 3: Training, stats, export and import

- **"Train (N)"** in the header. The board stays the same. The left column shows the stats and the list of saved puzzles in place of the game and the chart.
- **The result of an attempt:**
  - **Clean**: solved on the first try, with no hint (`T.firstTry`).
  - **Helped**: solved after a wrong move or a hint.
  - **Revealed**: you clicked Show solution.
- **Order (simple spaced repetition).** Each saved puzzle has a box from 0 to 4. A new puzzle starts in box 0. Clean: box + 1 (at most 4). Helped: box − 1 (at least 0). Revealed: box 0. The page picks the next puzzle at random, with the weight 2^(4 − box) (16, 8, 4, 2, 1), so a missed puzzle comes 16 times more often than a puzzle that you know well. The page does not pick one of the last 3 puzzles shown (or fewer, when you saved fewer than 4).
- **Stats.** For each puzzle: tries, clean solves, the last result and its date. Overall: this session, all time, and the split by type (mate, blunder, mistake).
- A training attempt does not change the status of the puzzle in its game.
- The engine still loads. The page uses it to check a good move that is not the engine's first choice.
- **Export.** One JSON file: `{ app: 'blunder-drills', v: 1, games, saved, train }`.
- **Import.** Merge, not replace. Games: by key; keep the complete engine results at the greater depth, and merge the progress. Saved puzzles: by ID. Stats: keep the record with more tries.
- Call `navigator.storage.persist()` once, after the first save. It costs nothing, even if Safari ignores it.

## Tests

- `tests/library.spec.js`, with the engine blocked: the migration, a game that opens from cached results with no engine, the list (order, open, delete), and full storage.
- `tests/app.spec.js`, with the real engine: a reload opens the analyzed game from the cache, with the same puzzles.
