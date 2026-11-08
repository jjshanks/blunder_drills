# Blunder Drills: Game Library, Saved Puzzles and Training Plan

Written 2026-11-07. Status: PR 1 (game library) is merged into the local `main`. PR 2 (saved puzzles and training, which was PR 2 and PR 3 before 2026-11-07) is in progress.

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
| Export and import | Yes, in the first version (PR 2), because of the Safari risk below. |
| PRs | Two: PR 1 is the library. PR 2 is saved puzzles, training, stats, export and import together, because saved puzzles have no use without training. |
| Delete a game | After a confirmation. |
| Depth | Deeper saved results always win over a smaller chosen depth. |

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
| `drills.saved` | PR 2: the saved puzzles, `{ <id>: { p, g, at } }`. `p` is the copy of the puzzle with its `depth`. `g` is `{ k, w, b, date }` of its game. `at` is the time that you saved it. |
| `drills.train` | PR 2: the stats for each saved puzzle, `{ <id>: { box, tries, clean, helped, revealed, last, lastAt } }`. A separate key, so that the stats come back when you save a puzzle again. The totals are sums over the saved puzzles. |

`<k>` is the hash of the start position and the moves (`gameKey`), as before. The sample game also has a `drills.g.<k>` record, so that its progress and engine results stay, but it is not in the index.

### Migration from the old keys

- `drills.src` (the last game): if it is not the sample, the page adds it to the library. Then it removes `drills.src`.
- `drills.game.<k>` (the old progress): when the page makes the record for game `<k>`, it moves the old progress into it and removes the old key. Old progress for a game that is not in the library stays until you paste that game again.

## PR 1: Game library

- **Open a game.** If the record has engine results that are complete, at the chosen depth or deeper, the page shows them at once. It does not wait for the engine. If the analysis stopped before the end at the same depth, the page analyzes only the positions that are missing. In all other cases, it analyzes the game again.
- **Save.** The page writes the engine results every 10 positions and at the end. A reload during the analysis then loses at most 10 positions.
- **A new depth.** When you change the depth, the page analyzes the game again at that depth, unless the cached results are at that depth or deeper. Deeper results always win (decision 2026-11-07): you cannot go back to a smaller depth for a game.
- **"Your games".** A button in the game panel opens the list of games, the most recent first. A click opens a game. A × button deletes it, after a confirmation (the browser's `confirm` dialog). If you delete the game on the board, the next game in the list opens (or the sample).
- **Start.** The page opens the game that you opened last, or the sample when the library is empty.
- **Full storage.** See "Why localStorage". If storage is still full after the removal, the page shows an error.
- **GoatCounter.** One new event, `game-reopened`, when you open a game from the list. No game data.
- **README.** One sentence in the privacy section: your games, puzzles and stats stay in your browser.

## PR 2: Saved puzzles and training

### Save a puzzle

- A ☆ Save button in the trainer head, and a star on each row of the puzzle list. A second click removes the puzzle. The stats stay in `drills.train`, so they come back when you save the puzzle again.
- The page saves a full copy of the puzzle object: the position (FEN), the best move and line, the reply line (`refute`), the scores, the move played, the move before it, the type, the mate distance and the depth of the analysis. It also saves the player names, the date and the game key.
- The ID is `<game key>:<ply>`.
- A copy still works when you delete the game, or when a new depth changes the type of the puzzle.
- After the first save, the page calls `navigator.storage.persist()` one time. It costs nothing, even if Safari ignores it. Firefox can ask you for permission.

### Training mode

- **"Train (N)"** in the header, when you have saved puzzles. In training, the same link reads **"Back to game"**. The board stays the same. The left column shows the training panel in place of the game, the chart and the puzzle list. On a phone, the panel is below the board.
- **The result of an attempt:**
  - **Clean**: solved on the first try, with no hint (`T.firstTry`).
  - **Helped**: solved after a wrong move or a hint.
  - **Revealed**: you clicked Show solution before you solved it.
- Only the first result counts for each time that a puzzle comes up. Retry and a later Show solution do not change it.
- **Order (simple spaced repetition).** Each saved puzzle has a box from 0 to 4. A new puzzle starts in box 0. Clean: box + 1 (at most 4). Helped: box − 1 (at least 0). Revealed: box 0. Next picks a puzzle at random, with the weight 2^(4 − box) (16, 8, 4, 2, 1), so a missed puzzle comes 16 times more often than a puzzle that you know well. Next does not pick one of the last 3 puzzles shown (or fewer, when you saved fewer than 4).
- There is no Prev in training.
- **Training panel:**
  - This session: the number of puzzles, and how many were clean, helped and revealed. A session starts when you click Train.
  - All time, for each type (missed mate, blunder, mistake) and in total: saved puzzles, tries, and clean solves.
  - The saved puzzles, the weakest first (lowest box). For each one: the move, the game, and its clean solves out of its tries. A click opens that puzzle now. The star removes it.
- A training attempt does not change the status of the puzzle in its game.
- The trainer head names the game, for example "Ann vs Bob: 3… Nf6".
- The "Whole game" line is not available in training, because the game is not on the board.
- The engine still loads. The page uses it to check a good move that is not the engine's first choice.
- GoatCounter events: `puzzle-saved`, `training-started`, `training-clean`, `training-helped`, `training-revealed`, `backup-exported`, `backup-imported`. No game data.

### Export and import

- In the footer, always there: a line that says where the data is, with **Export a backup** and **Import**. Import must work on a new device with an empty library.
- **Export.** One JSON file, `blunder-drills-<date>.json`: `{ app: 'blunder-drills', v: 1, at, games, saved, train }`. `games` is the index entries, each with its record (`rec`).
- **Import.** Merge, not replace:
  - Games: by key. A new game is added. For a game that you have, the complete engine results at the greater depth win, and the progress is merged (yours wins).
  - Saved puzzles: by ID. A new one is added; yours wins. A puzzle whose position (FEN) chess.js cannot read is skipped.
  - Stats: for each ID, the record with more tries wins.
- A file that is not a backup gives an error, and nothing changes.
- The file is not trusted: it can come from a different person. Import rebuilds each record from the fields that the page uses, and checks their types and values (moves and squares by pattern, the puzzle type, the status and the box from fixed sets). A record that fails is skipped. An engine result that fails becomes a gap, which the next analysis fills. The page shows imported text only with `textContent`, never with `innerHTML`.

## Tests

- `tests/library.spec.js`, with the engine blocked: the migration, a game that opens from cached results with no engine, the list (order, open, delete), and full storage.
- `tests/training.spec.js`, with the engine blocked: save and remove, training results and boxes, a puzzle whose game is deleted, the pick order, export and import. A solve with the best move, the first hint and Show solution do not need the engine.
- `tests/app.spec.js`, with the real engine: a reload opens the analyzed game from the cache, with the same puzzles.
