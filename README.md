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
