// Tests for the feedback Worker (feedback/src/worker.js) in Node, with no browser and no Cloudflare account.
// D1 is a SQLite database in memory (node:sqlite) with the real schema, so the inserts meet its CHECK rules.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { validate, LIMITS } from '../feedback/src/worker.js';
import { RECENT, MOTIFS } from '../feedback/read.mjs';

const ORIGIN = 'https://jjshanks.github.io';
const FEN = 'r2q1rk1/p4ppp/bp4n1/3pN3/3P4/1Q5P/PP3PP1/3RR1K1 b - - 0 20';
const PUZZLE = { fen: FEN, type: 'blunder', played: 'a8b8', line: ['d8c7', 'e5c6'], refute: ['e5c6', 'd8f6'], idea: null, allowed: 'fork', note: 'The game move, 20... Rb8, lost your rook.' };
const vote = (over = {}) => ({ v: 1, kind: 'vote', vote: -1, page: 'a1b2c3d4', app: 'dev', puzzle: PUZZLE, hp: '', ...over });
const text = (over = {}) => ({ v: 1, kind: 'text', text: 'The knight is pinned, so this is not a fork.', page: 'a1b2c3d4', app: 'dev', hp: '', ...over });

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../feedback/schema.sql', import.meta.url), 'utf8'));
  return { db, prepare: sql => ({ bind: (...a) => ({ run: async () => db.prepare(sql).run(...a) }) }) };
}
function env({ limit = true } = {}) {
  const DB = d1(), keys = [];
  return { DB, keys, ALLOWED_ORIGINS: `${ORIGIN}, http://127.0.0.1:8000`, LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: limit } } } };
}
const post = (body, headers = {}) => new Request('https://blunder-feedback.example.workers.dev/feedback', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'CF-Connecting-IP': '203.0.113.7', ...headers },
});
const rows = e => e.DB.db.prepare('SELECT kind, vote, text, page, app, puzzle FROM feedback ORDER BY id').all();

test.describe('validate', () => {
  test('accepts a vote and a message, and makes the row to store', () => {
    expect(validate(vote())).toEqual({ row: { kind: 'vote', vote: -1, text: null, page: 'a1b2c3d4', app: 'dev', puzzle: JSON.stringify(PUZZLE) } });
    expect(validate(text({ text: '  Nice site.  ' })).row).toEqual({ kind: 'text', vote: null, text: 'Nice site.', page: 'a1b2c3d4', app: 'dev', puzzle: null });
    expect(validate(text({ puzzle: PUZZLE, app: undefined })).row.app).toBe(null);
    expect(validate(vote({ hp: undefined }))).toHaveProperty('row');
    for (const target of ['advice', 'solution']) expect(validate(vote({ puzzle: { ...PUZZLE, target } }))).toHaveProperty('row');
  });

  test('a full honeypot is spam', () => {
    expect(validate(text({ hp: 'http://spam.example' }))).toEqual({ spam: true });
  });

  test('rejects each bad field and names it', () => {
    const cases = [
      [null, 'body'], [[], 'body'], ['x', 'body'],
      [vote({ extra: 1 }), 'extra'], [vote({ hp: 1 }), 'hp'], [vote({ v: 2 }), 'v'],
      [vote({ page: 'XYZ' }), 'page'], [vote({ page: 'abc' }), 'page'], [vote({ app: 'x'.repeat(LIMITS.app + 1) }), 'app'],
      [vote({ kind: 'like' }), 'kind'], [vote({ vote: 0 }), 'vote'], [vote({ vote: '1' }), 'vote'],
      [vote({ text: 'hi' }), 'text'], [vote({ puzzle: undefined }), 'puzzle'],
      [text({ vote: 1 }), 'vote'], [text({ text: '   ' }), 'text'], [text({ text: 'x'.repeat(LIMITS.text + 1) }), 'text'], [text({ text: 5 }), 'text'],
      [vote({ puzzle: [] }), 'puzzle'], [vote({ puzzle: { ...PUZZLE, pgn: '1. e4' } }), 'puzzle.pgn'],
      [vote({ puzzle: { ...PUZZLE, fen: 'not a fen' } }), 'puzzle.fen'], [vote({ puzzle: { ...PUZZLE, fen: FEN + ' '.repeat(LIMITS.fen) } }), 'puzzle.fen'],
      [vote({ puzzle: { ...PUZZLE, type: 'brilliant' } }), 'puzzle.type'], [vote({ puzzle: { ...PUZZLE, played: 'Rb8' } }), 'puzzle.played'],
      [vote({ puzzle: { ...PUZZLE, target: 'puzzle' } }), 'puzzle.target'], [vote({ puzzle: { ...PUZZLE, target: null } }), 'puzzle.target'],
      [vote({ puzzle: { ...PUZZLE, line: Array(LIMITS.moves + 1).fill('e2e4') } }), 'puzzle.line'], [vote({ puzzle: { ...PUZZLE, refute: ['e2e9'] } }), 'puzzle.refute'],
      [vote({ puzzle: { ...PUZZLE, idea: 'Fork!' } }), 'puzzle.idea'], [vote({ puzzle: { ...PUZZLE, allowed: 3 } }), 'puzzle.allowed'],
      [vote({ puzzle: { ...PUZZLE, note: 'x'.repeat(LIMITS.note + 1) } }), 'puzzle.note'],
      // Control characters could change the terminal that prints the rows (npm run feedback).
      [text({ text: 'red \u001b[31m text' }), 'text'], [text({ text: 'back\rover' }), 'text'], [text({ text: 'c1 \u009b2J' }), 'text'],
      [vote({ puzzle: { ...PUZZLE, note: '\u0007bell' } }), 'puzzle.note'], [vote({ app: 'dev\u0000' }), 'app'],
    ];
    for (const [body, field] of cases) expect(validate(body), JSON.stringify(body)?.slice(0, 80)).toEqual({ error: field });
  });

  test('accepts the longest good values and a promotion move', () => {
    const p = { ...PUZZLE, line: Array(LIMITS.moves).fill('e7e8q'), note: 'x'.repeat(LIMITS.note) };
    expect(validate(text({ text: 'x'.repeat(LIMITS.text), puzzle: p }))).toHaveProperty('row');
    expect(validate(text({ text: 'Line one.\n\tLine two, with é and ♞.' }))).toHaveProperty('row');
  });
});

test.describe('handler', () => {
  test('stores a vote and a message, and replies with CORS for the page origin', async () => {
    const e = env();
    const r = await worker.fetch(post(vote()), e);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect((await worker.fetch(post(text(), { Origin: 'http://127.0.0.1:8000' }), e)).status).toBe(200);
    expect(rows(e)).toEqual([
      { kind: 'vote', vote: -1, text: null, page: 'a1b2c3d4', app: 'dev', puzzle: JSON.stringify(PUZZLE) },
      { kind: 'text', vote: null, text: text().text, page: 'a1b2c3d4', app: 'dev', puzzle: null },
    ]);
    expect(e.keys).toEqual(['203.0.113.7', '203.0.113.7']); // the rate limit key; it is not in the table
  });

  test('answers the CORS preflight', async () => {
    const r = await worker.fetch(new Request('https://w.example/feedback', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env());
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(r.headers.get('Access-Control-Allow-Methods')).toBe('POST');
  });

  test('refuses other paths, methods, origins, big bodies, fast senders and bad JSON, and stores nothing', async () => {
    const e = env();
    const status = async (req, en = e) => { const r = await worker.fetch(req, en); return [r.status, (await r.json()).error, r.headers.get('Access-Control-Allow-Origin')] };
    expect(await status(new Request('https://w.example/other', { method: 'POST', body: '{}', headers: { Origin: ORIGIN } }))).toEqual([404, 'not found', ORIGIN]);
    expect(await status(new Request('https://w.example/feedback', { headers: { Origin: ORIGIN } }))).toEqual([404, 'not found', ORIGIN]);
    expect(await status(post(vote(), { Origin: 'https://evil.example' }))).toEqual([403, 'origin', null]);
    expect(await status(new Request('https://w.example/feedback', { method: 'POST', body: JSON.stringify(vote()) }))).toEqual([403, 'origin', null]);
    expect(await status(post('x'.repeat(LIMITS.body + 1)))).toEqual([413, 'size', ORIGIN]);
    expect(await status(post(vote()), env({ limit: false }))).toEqual([429, 'rate', ORIGIN]);
    expect(await status(post('{not json'))).toEqual([400, 'json', ORIGIN]);
    expect(await status(post(vote({ vote: 5 })))).toEqual([400, 'vote', ORIGIN]);
    expect(rows(e)).toEqual([]);
  });

  test('stops reading a body with no Content-Length when it passes the limit', async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(chunk) } }); // never ends
    const req = new Request('https://w.example/feedback', { method: 'POST', body: stream, duplex: 'half', headers: { Origin: ORIGIN } });
    expect(req.headers.get('Content-Length')).toBe(null);
    const r = await worker.fetch(req, env());
    expect([r.status, (await r.json()).error]).toEqual([413, 'size']);
    expect(pulled).toBeLessThan(LIMITS.body / 1024 + 4);
    const small = new Request('https://w.example/feedback', { method: 'POST', body: new Blob([JSON.stringify(vote())]).stream(), duplex: 'half', headers: { Origin: ORIGIN } });
    expect((await worker.fetch(small, env())).status).toBe(200);
  });

  test('says yes to a bot that fills the honeypot, and stores nothing', async () => {
    const e = env();
    const r = await worker.fetch(post(text({ hp: 'buy now' })), e);
    expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
    expect(rows(e)).toEqual([]);
  });

  test('a failed insert is a 500 with CORS, so that the page can say it could not send', async () => {
    const e = env();
    e.DB = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1 limit') } }) }) };
    const err = console.error; console.error = () => {};
    try {
      const r = await worker.fetch(post(vote()), e);
      expect([r.status, (await r.json()).error, r.headers.get('Access-Control-Allow-Origin')]).toEqual([500, 'store', ORIGIN]);
    } finally { console.error = err }
  });
});

test('the read queries: the last vote for each page, puzzle and note wins, and each target has its own score', async () => {
  const e = env();
  const fork = { ...PUZZLE, target: 'advice', idea: 'fork', allowed: null, note: 'The idea: 33. Qe8+ forks the king.' };
  const sol = { ...PUZZLE, target: 'solution', idea: null, allowed: 'fork', note: '' }; // same motifs as PUZZLE, no note
  // PUZZLE has no target, as in the rows from before the field: it counts as advice.
  for (const b of [vote({ vote: 1 }), vote({ vote: -1 }), vote({ page: 'ffff0000', vote: -1 }), vote({ puzzle: fork, vote: -1 }), vote({ puzzle: fork, vote: 1 }), vote({ puzzle: sol, vote: -1 }), text()]) {
    expect((await worker.fetch(post(b), e)).status).toBe(200);
  }
  expect(e.DB.db.prepare(RECENT).all().map(r => r.kind + ' ' + r.target)).toEqual(['text advice', 'vote solution', 'vote advice', 'vote advice', 'vote advice', 'vote advice', 'vote advice']);
  expect(e.DB.db.prepare(MOTIFS).all().map(r => ({ ...r }))).toEqual([
    { target: 'advice', allowed: 'fork', idea: null, up: 0, down: 2 }, // a1b2c3d4 changed its vote to down; ffff0000 voted down
    { target: 'solution', allowed: 'fork', idea: null, up: 0, down: 1 },
    { target: 'advice', allowed: null, idea: 'fork', up: 1, down: 0 },
  ]);
});
