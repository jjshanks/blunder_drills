// Blunder Drills feedback Worker. MIT License, see LICENSE at the repository root.
// The page sends one POST /feedback for each vote or message: JSON, sent as text/plain so that the browser
// sends no CORS preflight. The Worker checks the origin, the size, the rate and the fields, then writes one
// row to D1. It only inserts. See docs/feedback-plan.md.

export const LIMITS = { body: 8192, text: 1000, note: 1000, fen: 100, moves: 12, app: 40 };

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MOTIF = /^[a-z]{1,20}$/;
const PAGE = /^[0-9a-f]{8,32}$/; // a random id that the page makes at load; it is not stored in the browser
const FEN = /^[pnbrqkPNBRQK1-8/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/;
const TYPES = ['mate', 'blunder', 'mistake'];
const FIELDS = ['v', 'kind', 'vote', 'text', 'page', 'app', 'puzzle', 'hp'];
const PUZZLE_FIELDS = ['fen', 'type', 'played', 'line', 'refute', 'idea', 'allowed', 'note'];

// Control characters, but not tab and newline. `npm run feedback` prints the text in a terminal, where escape
// codes could change what the terminal shows.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;
const isObject = x => typeof x === 'object' && x !== null && !Array.isArray(x);
const isText = (x, max) => typeof x === 'string' && x.length <= max && !CONTROL.test(x);
const unknown = (o, known) => Object.keys(o).find(k => !known.includes(k));
const isLine = x => Array.isArray(x) && x.length <= LIMITS.moves && x.every(u => typeof u === 'string' && UCI.test(u));
const isMotif = x => x === null || (typeof x === 'string' && MOTIF.test(x));

// The puzzle on the board, and the advice the user judged. Returns the name of the first bad field, or null.
function puzzleError(p) {
  if (!isObject(p)) return 'puzzle';
  const extra = unknown(p, PUZZLE_FIELDS);
  if (extra) return 'puzzle.' + extra;
  if (!isText(p.fen, LIMITS.fen) || !FEN.test(p.fen)) return 'puzzle.fen';
  if (!TYPES.includes(p.type)) return 'puzzle.type';
  if (typeof p.played !== 'string' || !UCI.test(p.played)) return 'puzzle.played';
  for (const k of ['line', 'refute']) if (p[k] !== undefined && !isLine(p[k])) return 'puzzle.' + k;
  for (const k of ['idea', 'allowed']) if (p[k] !== undefined && !isMotif(p[k])) return 'puzzle.' + k;
  if (p.note !== undefined && !isText(p.note, LIMITS.note)) return 'puzzle.note';
  return null;
}

// Checks a parsed body. Returns { row } to store, { spam: true } when the honeypot is full, or { error: field }.
export function validate(b) {
  if (!isObject(b)) return { error: 'body' };
  const extra = unknown(b, FIELDS);
  if (extra) return { error: extra };
  if (b.hp !== undefined && typeof b.hp !== 'string') return { error: 'hp' };
  if (b.hp) return { spam: true };
  if (b.v !== 1) return { error: 'v' };
  if (typeof b.page !== 'string' || !PAGE.test(b.page)) return { error: 'page' };
  if (b.app !== undefined && !isText(b.app, LIMITS.app)) return { error: 'app' };
  if (b.kind === 'vote') {
    if (b.vote !== 1 && b.vote !== -1) return { error: 'vote' };
    if (b.text !== undefined) return { error: 'text' };
    if (b.puzzle === undefined) return { error: 'puzzle' }; // a vote is about the advice for a puzzle
  } else if (b.kind === 'text') {
    if (b.vote !== undefined) return { error: 'vote' };
    if (!isText(b.text, LIMITS.text) || !b.text.trim()) return { error: 'text' };
  } else return { error: 'kind' };
  const pe = b.puzzle === undefined ? null : puzzleError(b.puzzle);
  if (pe) return { error: pe };
  return {
    row: {
      kind: b.kind, vote: b.kind === 'vote' ? b.vote : null, text: b.kind === 'text' ? b.text.trim() : null,
      page: b.page, app: b.app ?? null, puzzle: b.puzzle === undefined ? null : JSON.stringify(b.puzzle),
    },
  };
}

// The body as bytes, or null when it is longer than max. It stops reading at max, so a client with a false
// Content-Length cannot make the Worker keep a large body in memory.
async function readCapped(request, max) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel(); return null }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out;
}

const INSERT ='INSERT INTO feedback (kind, vote, text, page, app, puzzle) VALUES (?, ?, ?, ?, ?, ?)';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = origin !== null && allowed.includes(origin);
    const cors = { Vary: 'Origin', ...(okOrigin && { 'Access-Control-Allow-Origin': origin }) };
    const reply = (status, body) => Response.json(body, { status, headers: cors });

    if (new URL(request.url).pathname !== '/feedback') return reply(404, { ok: false, error: 'not found' });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    if (request.method !== 'POST') return reply(404, { ok: false, error: 'not found' });
    // This stops other sites, not scripts. The rate limit and the checks below are for scripts.
    if (!okOrigin) return reply(403, { ok: false, error: 'origin' });
    if (Number(request.headers.get('Content-Length')) > LIMITS.body) return reply(413, { ok: false, error: 'size' });

    // 10 sends a minute for each IP. The IP is used only for this check and is never stored. The binding counts
    // for each Cloudflare location, not globally, so it is a loose filter. That is enough for feedback.
    const { success } = await env.LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'none' });
    if (!success) return reply(429, { ok: false, error: 'rate' });

    const bytes = await readCapped(request, LIMITS.body); // the Content-Length check above trusts the client; this does not
    if (!bytes) return reply(413, { ok: false, error: 'size' });
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return reply(400, { ok: false, error: 'json' }) }
    const v = validate(body);
    if (v.spam) return reply(200, { ok: true }); // a bot: say yes, store nothing
    if (v.error) return reply(400, { ok: false, error: v.error });

    const r = v.row;
    try {
      await env.DB.prepare(INSERT).bind(r.kind, r.vote, r.text, r.page, r.app, r.puzzle).run();
    } catch (e) {
      console.error('insert failed', e); // for example, the D1 free daily limit: D1 stops the queries until 00:00 UTC
      return reply(500, { ok: false, error: 'store' });
    }
    return reply(200, { ok: true });
  },
};
