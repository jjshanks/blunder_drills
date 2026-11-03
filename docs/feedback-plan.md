# Blunder Drills: In-Page Feedback Plan

Written 2026-11-01. Status (2026-11-02): built, with tests. The Worker is deployed at `https://blunder-feedback.jjshanks.workers.dev/feedback`, and `FEEDBACK_URL` points to it. Where the code differs from the first plan, this file now says what the code does.

**Decision (2026-11-01):** use a Cloudflare Worker and D1. The other options are kept below as a record of why.

## Goal

People who use the site can tell us what they think, without leaving the page and without an account:

- **Thumbs up or thumbs down** on the advice for a puzzle ("The idea: …", "The game move … allowed …").
- **Free text** about the puzzle, or about the site in general.

The cost must be zero. The page stays one `index.html` with no build step, MIT licensed.

Assumption: the request said "They shouldn't have to believe it". This plan reads it as "They shouldn't have to leave it", that is, no new tab, no GitHub login and no Google Form page.

## Decision: Cloudflare Worker + D1

A small **Cloudflare Worker** with a **D1** (SQLite) table. The page sends one `fetch` POST for each vote or message. The Worker checks the data and writes one row.

Why this one:

- **Free, with no surprise bill.** The Workers Free plan gives about 100,000 requests a day. D1 Free gives 100,000 row writes a day and 5 GB. Since 2026-09-01, D1 stops the queries when the account goes over the daily limit. It does not bill. The limits reset at 00:00 UTC. A hobby chess site will use much less than 1% of this.
- **The code lives in this repo** (MIT), with tests, the same as the rest of the app. Nothing is in a web console that we cannot review.
- **We control the checks:** origin, size, rate and fields. The other free options give us no control or less control (see the table below).
- **We can read the data with SQL.** For example: "show all thumbs-down on fork advice". This makes each bad piece of advice a test case (see "Turn each thumbs-down into a test").

The cost to us: a free Cloudflare account, about 80 lines of Worker code, and one manual `wrangler deploy`.

### Options we did not pick

| Option | Free? | Stays on the page? | Why not first choice |
|---|---|---|---|
| GitHub Issues / Discussions (giscus) | Yes | No | Needs a GitHub account and a login. Most chess players do not have one. |
| Google Form, link or iframe | Yes | No / partly | A Google page. Looks foreign, heavy iframe. |
| Google Form, hidden POST to `formResponse` (`no-cors`) | Yes | Yes | Zero backend code, but the page cannot see if the send worked. No checks, open to spam. It uses a form URL that Google does not document for this use. |
| Google Apps Script web app + Sheet | Yes | Yes | The fallback if Cloudflare stops being free. Data in a Sheet is easy to read. But the code lives in the Apps Script editor, each change needs a new deployment, a failed run shows as a CORS error, and replies are slow (1–3 s). |
| Formspree, Web3Forms, Getform | Small free cap | Yes | Free caps are near 50–250 sends a month (check the current numbers). Thumbs clicks would use that fast. They send email, not rows we can query. |
| Supabase | Yes | Yes | A free project pauses after about a week with no use. Then the first vote after a quiet week fails. |
| Firebase Firestore | Yes | Yes | Works, but adds a large SDK or hand-written REST calls and Google project setup. More than we need. |
| GoatCounter / analytics events | Yes (non-commercial) | Yes | Counts clicks only. No free text, no puzzle context. |

If we ever must move away from Cloudflare, Apps Script + Sheet is the fallback. The page side stays the same. Only the URL and the server code change.

## What the user sees

### 1. Thumbs on the advice

After a solve or "Show solution", the feedback box (`#fb`) shows the advice. Under it, add one quiet row:

```
Was this explanation right?   👍   👎
```

- Put the row **next to** `#fb`, not in it. `#fb` is an `aria-live` region and `setFeedback()` replaces its content. A row inside it would be cleared and read aloud again.
- Show the row only when the advice has a tactic note (`tacticNoteParts(p, …)` is not empty). Without a note there is nothing to judge.
- After a click: the chosen thumb stays pressed (`aria-pressed="true"`), and a short text says "Thanks." A second click on the other thumb changes the vote.
- After a 👎, open a small optional text box under the row: "What was wrong? (optional)" with a **Send** button.
- One vote for each puzzle for each page load. The page remembers it in memory only.

### 2. General feedback

A small **Feedback** link in the page header, next to the engine status. It opens a `<dialog>` with:

- A text box (max 1000 characters, with a counter).
- A check box, on by default when a puzzle is on the board: "Include this puzzle position". When the advice is on screen, the message also takes the advice (the same `puzzle` object as a vote).
- A short privacy line (see "Privacy").
- **Send** and **Cancel**.

### 3. States

- Sending: the button says "Sending…" and is disabled.
- Done: "Thanks. We read every message."
- Failed (offline, rate limit, server down): "Could not send. Try again later." Keep the text in the box. No retry queue.
- If `FEEDBACK_URL` is empty, hide all feedback UI. Local copies and forks then work with no errors.
- A key pressed in the dialog does not work the puzzle shortcuts (H, S, R, P, N, the arrows).

## What the page sends

One JSON object for each send. The body goes as `text/plain`, so the browser does not send a CORS preflight.

```json
{
  "v": 1,
  "kind": "vote",                 // "vote" | "text"
  "vote": -1,                     // 1 | -1, only for "vote"
  "text": "The knight is pinned, so this is not a fork.",  // only for "text", max 1000 chars
  "page": "a1b2c3d4e5f6",         // 12 random hex digits made at page load; not stored in the browser
  "app": "5143ba6",               // APP_VERSION: 'dev' in the source; the deploy job writes the short commit SHA
  "puzzle": {                     // only if a puzzle is on the board (and the box is checked)
    "fen": "r1bqkb1r/…",
    "type": "blunder",            // "mate" | "blunder" | "mistake"
    "played": "e2e4",
    "line": ["d2d4", "…"],        // the line that the advice explains (the solver's line or p.pv), max 12 moves;
                                  // with no advice on screen, p.pv
    "refute": ["…"],              // p.refute, max 12 moves
    "idea": "fork",               // motif names from findTactics, or null; only with advice
    "allowed": "pin",
    "note": "The idea: Nxe5 forks the king and the rook."   // the exact text the user judged; only with advice
  },
  "hp": ""                        // honeypot field; humans leave it empty
}
```

We do **not** send the PGN. It holds player names, dates and events. The puzzle FEN and the lines are enough to replay the advice.

Why `line` and not `best` (a change from the first plan): when the solver finds another good move, the advice explains the solver's line, not `p.pv`. To replay the advice we need `findTactics(fen, line)` with the line that was really used. 12 moves, not 8, so that a full mate-in-5 line fits.

## The Worker

Files, in a new folder in this repo:

```
feedback/
  wrangler.toml        # name, D1 binding, rate-limit binding, allowed origins
  schema.sql           # the table
  src/worker.js        # fetch handler + validate()
  read.mjs             # the queries for npm run feedback
  package.json         # Wrangler, pinned; separate, so that the root npm ci in CI does not install it
  README.md            # deploy and read steps
```

`schema.sql`:

```sql
CREATE TABLE feedback (
  id      INTEGER PRIMARY KEY,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  kind    TEXT NOT NULL CHECK (kind IN ('vote', 'text')),
  vote    INTEGER CHECK (vote IN (1, -1)),
  text    TEXT,
  page    TEXT NOT NULL,
  app     TEXT,
  puzzle  TEXT            -- the puzzle object as JSON
);
```

A vote change from the same page load is a new row. When we read, the last row for each `(page, puzzle fen)` wins. This keeps the Worker simple: insert only, no update.

The handler, in order:

1. `OPTIONS` → 204 with CORS headers. `POST /feedback` only. Any other request → 404.
2. `Origin` must be in the allow list: `https://jjshanks.github.io` and `http://127.0.0.1:8000`. Else 403. (This stops other sites, not scripts. The next steps stop scripts.)
3. Body max 8 KB. Else 413. The Worker checks `Content-Length` first, then reads the body as a stream and stops at 8 KB, so a false `Content-Length` cannot make it keep a large body.
4. Rate limit: 10 sends a minute for each IP, with the Workers rate-limiting binding (`ratelimits` in `wrangler.toml`, period 60 s, Wrangler 4.36 or later). Else 429. The IP is used only for this check and is never stored. The binding counts for each Cloudflare location, not globally, so it is a loose filter, not a hard limit. That is enough for feedback.
5. `validate(body)`: known fields only, right types, `text` max 1000 characters, FEN max 100 characters, each line max 12 moves in UCI form. No control characters (but newline and tab) in `text`, `note` and `app`, because `npm run feedback` prints them in a terminal. A full `hp` field → reply 200 and store nothing.
6. Insert one row with a prepared statement. Reply `{"ok":true}`.

If spam comes in spite of this, add Cloudflare **Turnstile** (free) to the free-text dialog only, not to the thumbs. Do not add it before we need it: it loads a third-party script and can show a challenge.

### Read the feedback

Add an npm script:

```sh
npm run feedback            # last 50 messages, and votes by motif
```

It runs `feedback/read.mjs`, which runs `wrangler d1 execute blunder-feedback --remote --command "…"` for each query. The advice score counts one vote for each page load, puzzle and note (the last row wins), and groups by the pair of motifs: what the game move allowed, and the idea of the better line. One note can tell both, so a thumbs-down cannot say which part was wrong. The queries are in `read.mjs`, and `tests/feedback-worker.spec.js` checks them against the real schema.

The Cloudflare dashboard also has a D1 console, so you can read the data from a phone.

Later, only if the volume makes it useful: a daily Cron Trigger that emails a digest. Not in this plan.

## Turn each thumbs-down into a test

This is the main value of the context fields. The tactics plan (`docs/tactics-plan.md`) already adds a near-miss test for each wrong report. A 👎 row has the FEN, the line and the motif that the app reported. So:

1. Read the 👎 rows for a motif.
2. Paste the FEN and line into a new case in `tests/logic.spec.js`.
3. Fix `findTactics` or `motifsAt` until the case passes.

Users then find the false reports for us, and each one becomes a lasting test.

## Public repo: what must not be committed

The repo will be public. The Worker code is safe to publish. These things are not, and must stay out of git:

- **Cloudflare API tokens and the account login.** `wrangler login` keeps the token in the user's home folder, not in the repo. If a GitHub Action ever deploys the Worker, the token goes in a GitHub Actions secret, never in a file.
- **The account ID.** `wrangler` finds it from the login. Do not write `account_id` in `wrangler.toml`.
- **Local Wrangler state:** `.wrangler/` (the local D1 copy and caches) and `.dev.vars` (local secrets). Add both to `.gitignore` in step 1.
- **Any feedback data.** Never commit an export of the table, a sample of real messages or a screenshot of the console. Test data in the repo is made up.
- **Real game PGNs from users.** The page does not send them. Test fixtures keep using the sample game.

These are public on purpose, and that is fine: the Worker URL (`*.workers.dev`, it is in the page), the D1 database name, and the D1 `database_id` in `wrangler.toml` (an ID, not a credential; nobody can use it without an API token for the account).

If Turnstile is added later, its **site key** is public (it is in the page) and its **secret key** goes in a Worker secret (`wrangler secret put`), never in the repo.

Before each commit in `feedback/`, run `git diff --cached` and check for tokens, emails and real feedback text.

## Privacy

- No cookies, no stored id, no IP in the table, no PGN.
- The privacy line in the dialog: "We store your message, the puzzle position and the time. Not your name, email or IP address."
- Add a short "Feedback and privacy" section to `README.md` that says the same, and names Cloudflare as the host of the data.
- The page today loads from unpkg, jsDelivr and a font CDN. This adds one more host, only when the user clicks.

## Tests

- **Page (`tests/feedback.spec.js`):** the tests put a test `FEEDBACK_URL` in the served page and use `page.route()` to catch the sends. They check the payload shape, the pressed state of the thumbs, the "Thanks" and "Could not send" states, and that the UI is hidden when `FEEDBACK_URL` is empty. CI never calls the real Worker. The thumbs test needs the real engine (one analysis of the sample game).
- **Worker (`tests/feedback-worker.spec.js`):** in Node with the Playwright test runner (no browser). `validate()` with good input, each bad field, the longest good values and a full honeypot. The handler with a D1 stand-in on `node:sqlite` and the real `schema.sql`: CORS, origin, size (also a streamed body with no `Content-Length`), rate, bad JSON, a failed insert, and the read queries.
- **By hand, once:** `wrangler dev` with a local D1 and `curl`: a vote and a message are stored, the preflight gets 204, the 11th send in a minute gets 429.

## Steps

1. **Worker.** `feedback/` folder, schema, `validate()` with tests, rate limit, CORS, `.gitignore` entries. Deploy by hand with `wrangler deploy`. Check with one `curl`. *You do the Cloudflare login and the first deploy.*
2. **General feedback dialog** in `index.html`, with `FEEDBACK_URL` and `APP_VERSION` constants, and its page tests.
3. **Thumbs row** under `#fb`, the optional text box after 👎, and its page tests.
4. **`npm run feedback`**, the README privacy section, and `feedback/README.md`.

Each step is one commit. Steps 2 and 3 do nothing until step 1 is live, because the UI hides when the URL is empty.

Done (2026-11-02): the code and the tests for all four steps. To do, by you:

1. `cd feedback && npm ci && npx wrangler login`.
2. `npx wrangler d1 create blunder-feedback`, and put the `database_id` in `wrangler.toml`.
3. `npm run schema`, then `npm run deploy`. Check with the `curl` command in `feedback/README.md`.
4. Set `FEEDBACK_URL` in `index.html` to the Worker URL with `/feedback` at the end. Commit. The deploy to Pages then shows the UI.

## Decisions on the open questions (2026-11-02)

1. **Repo visibility.** Closed: the repo is public, and Pages serves `https://jjshanks.github.io/blunder_drills/`. The allowed origin `https://jjshanks.github.io` is correct (an origin has no path).
2. **Where to put thumbs.** On the tactic advice only. The free-text dialog takes comments about the puzzle.
3. **Reply to users?** No email field. The data holds no personal information.

## Sources

- Cloudflare D1 pricing: <https://developers.cloudflare.com/d1/platform/pricing/>
- D1 free-tier limit enforcement, 2026-09-01: <https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/>
- Workers rate-limiting binding: <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>
- Workers pricing and limits: <https://developers.cloudflare.com/workers/platform/pricing/>, <https://developers.cloudflare.com/workers/platform/limits/>
- Apps Script to Sheet pattern: <https://gist.github.com/mhawksey/1276293>
