# Blunder Drills

Paste a chess game in PGN format. Stockfish runs in your browser, finds the
blunders and missed mates, and turns each one into a puzzle.

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
npm test
```

- `tests/logic.spec.js` tests the pure functions: scores, PGN parsing and
  puzzle detection. It blocks the engine download.
- `tests/app.spec.js` drives the page with the real engine. It needs network
  access to unpkg.

The page exposes its pure functions on `window.BlunderDrills` for these tests.

## Publish (later)

The plan is GitHub Pages: serve the repository root from the `main` branch.
`.nojekyll` tells Pages to serve the files as they are.

## License

The app code is MIT licensed. See `LICENSE`.

Third-party parts are not MIT:

- **Stockfish.js 18**, by Chess.com and the Stockfish contributors, is GPLv3.
  This repository does not contain it. The browser downloads the
  [`stockfish@18.0.8`](https://www.npmjs.com/package/stockfish) package from
  unpkg at run time and talks to it only through UCI text messages.
  Source: <https://github.com/nmrugg/stockfish.js>
- **chess.js** 1.4.0, by Jeff Hlywa, is BSD 2-Clause. It loads from jsDelivr.
- **Chess pieces** inside `index.html` are by Cburnett, from Wikimedia Commons,
  CC BY-SA 3.0.
- **Fonts** (Bricolage Grotesque, IBM Plex) load from Google Fonts under the
  SIL Open Font License.
