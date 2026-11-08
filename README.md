# Blunder Drills

Paste a chess game in PGN format. Stockfish runs in your browser, finds the
blunders and missed mates, and turns each one into a puzzle.

When a fork, pin, skewer, discovered attack, double check or free piece was
missed or allowed, the app names it in the second hint and after the solution.

The whole app is one file, `index.html`. There is no build step.

## Run

Open `index.html` in your browser. That is all.

The page needs an internet connection. It downloads Stockfish from unpkg, and
chess.js and the fonts from other CDNs.

To serve the page over http instead, the same way GitHub Pages serves it:

```sh
npm start        # http://127.0.0.1:8000/
```

## Test

The tests use Playwright. Install once:

```sh
npm install
npx playwright install --only-shell chromium
```

Then run:

```sh
npm run lint     # ESLint: index.html, the tests and the scripts
npm test
```

- `tests/logic.spec.js` tests the pure functions: scores, PGN parsing, puzzle
  detection and the tactics checker. It blocks the engine download.
- `tests/app.spec.js` drives the page with the real engine. It needs network
  access to unpkg and jsDelivr.
- `tests/library.spec.js` tests the game library: games and engine results in
  localStorage, the move from the old keys, Your games, and full storage. It
  blocks the engine download.
- `tests/feedback.spec.js` tests the feedback dialog and the thumbs. It catches
  the sends, so it never calls the real Worker.
- `tests/feedback-worker.spec.js` tests the feedback Worker in Node, with an
  in-memory SQLite database.

The page exposes its pure functions on `window.BlunderDrills` for these tests.

GitHub Actions runs `npm run lint` and `npm test` on each push to `main` and on each pull request
(`.github/workflows/ci.yml`). The actions are pinned to commit SHAs. Dependabot
(`.github/dependabot.yml`) proposes updates each week.

## Publish

GitHub Pages serves the site. After lint and the tests pass on `main`, the `deploy` job in
`.github/workflows/ci.yml` publishes only `index.html`. The docs, tests and
experiments are not on the site.

One-time setup: in the repository settings, under Pages, set Source to
**GitHub Actions**.

The deploy job also writes the short commit SHA into `APP_VERSION` in the
published page, so that each feedback row tells which code gave the advice.

## Your games and privacy

The page keeps your games, their engine results and your puzzle progress in
your browser (localStorage), so that you can open a game again without a new
paste or analysis. They are not sent anywhere. When the browser storage is
full, the page removes the engine results of the games that you opened least
recently first. Safari deletes this data when you do not open the site for 7
days of Safari use. See `docs/library-plan.md`.

## Feedback and privacy

People can send feedback from the page: thumbs up or down on the explanation
after a puzzle (or on the solution, when it has no explanation), and free text
from the **Feedback** link. A small Cloudflare Worker stores each send in a
Cloudflare D1 database. Its code is in `feedback/`; `feedback/README.md` tells
how to deploy it and read the data.

What is stored: the message or the vote, the puzzle position, its engine lines,
the explanation that was judged, the app version, a random ID for the page
load, and the time. What is not stored: the PGN, the player names, your name,
email or IP address. The page sets no cookie and keeps no ID in the browser.
Cloudflare hosts the data.

The feedback UI shows only when `FEEDBACK_URL` in `index.html` is set. A local
copy or a fork with no URL shows no feedback UI and sends nothing.

To read the feedback (it needs `npx wrangler login` in `feedback/` first):

```sh
npm --prefix feedback ci   # once
npm run feedback           # the last 50 rows, and the thumbs score for each target and pair of motifs
```

## License

The app code is MIT licensed. See `LICENSE`.

Third-party parts are not MIT:

- **Stockfish.js 18**, by Chess.com and the Stockfish contributors, is GPLv3.
  This repository does not contain it. The browser downloads the
  [`stockfish@18.0.8`](https://www.npmjs.com/package/stockfish) package from
  unpkg at run time and talks to it only through UCI text messages.
  Source: <https://github.com/nmrugg/stockfish.js>
- **chess.js** 1.4.0, by Jeff Hlywa, is BSD 2-Clause. It loads from jsDelivr.
- **Chess pieces** inside `index.html` are by Cburnett, from Wikimedia Commons.
  The author offers them under GFDL, CC BY-SA 3.0, BSD 3-Clause and GPLv2+.
  This project uses them under the BSD 3-Clause License. The full notice is in
  the comment at the top of `index.html`.
- **Fonts** (Bricolage Grotesque, IBM Plex) load from Google Fonts under the
  SIL Open Font License.
