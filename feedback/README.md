# Feedback Worker

A Cloudflare Worker with a D1 (SQLite) table. The page sends one POST for each
thumbs vote or message. The Worker checks the origin, the size, the rate and
the fields, then writes one row. Why this design: `docs/feedback-plan.md`.

- `src/worker.js`: the handler and `validate()`.
- `schema.sql`: the table.
- `wrangler.toml`: the D1 and rate-limit bindings, and the allowed origins.
- `read.mjs`: the queries for `npm run feedback`.

The tests are in `tests/feedback-worker.spec.js` at the repository root. They run
in Node with an in-memory SQLite database, so they need no Cloudflare account.

## Deploy (the first time)

```sh
cd feedback
npm ci
npx wrangler login                          # opens the browser; the token stays in your home folder
npx wrangler d1 create blunder-feedback     # prints a database_id
```

Put the `database_id` in `wrangler.toml` (it is an ID, not a secret). Then:

```sh
npm run schema                              # creates the table in the remote database
npm run deploy                              # prints the Worker URL, https://blunder-feedback.<you>.workers.dev
```

Check it with one request. A good request returns `{"ok":true}`:

```sh
curl -s https://blunder-feedback.<you>.workers.dev/feedback \
  -H 'Origin: http://127.0.0.1:8000' -H 'Content-Type: text/plain' \
  -d '{"v":1,"kind":"text","text":"Test from curl.","page":"00000000","app":"curl","hp":""}'
```

Then set `FEEDBACK_URL` in `index.html` to `https://blunder-feedback.<you>.workers.dev/feedback`.
Until it is set, the page shows no feedback UI.

To deploy a change later: `npm run deploy` in this folder.

## Read the feedback

At the repository root:

```sh
npm run feedback        # the last 50 rows, and the thumbs score for each pair of motifs
```

For other queries:

```sh
npx wrangler d1 execute blunder-feedback --remote --command "SELECT ..."
```

The Cloudflare dashboard also has a D1 console, so you can read the data from a phone.

## Run it locally

```sh
npx wrangler d1 execute blunder-feedback --local --file schema.sql
npm run dev             # http://127.0.0.1:8787/feedback, with a local D1 in .wrangler/
```

`npm start` at the root serves the page on `http://127.0.0.1:8000`, an allowed origin.
To send from that page to the local Worker, change `FEEDBACK_URL` for the test only.

## What must not be committed

This repository is public. Keep these out of git:

- Cloudflare API tokens and the account ID. `wrangler login` keeps them in your
  home folder. Do not add `account_id` to `wrangler.toml`.
- `.wrangler/` (the local D1 copy) and `.dev.vars` (local secrets). `.gitignore` has both.
- Any feedback data: no exports, no real messages, no screenshots of the console.
  Test data in the repository is made up.

Before each commit in this folder, run `git diff --cached` and look for tokens,
emails and real feedback text.

## Limits

The Workers Free plan allows about 100,000 requests a day. D1 Free allows 100,000
row writes a day. When the account goes over a D1 limit, D1 stops the queries
until 00:00 UTC. It does not bill. Then the page says "Could not send".

If spam comes in spite of the honeypot and the rate limit, add Cloudflare
Turnstile to the message dialog only. Its secret key goes in a Worker secret
(`npx wrangler secret put`), never in this repository.
