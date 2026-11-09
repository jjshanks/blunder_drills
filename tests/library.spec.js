// Tests for the game library (docs/library-plan.md): records in localStorage, cached engine results, the migration
// from the old keys, the Your games list and full storage. The engine download is blocked, so a game shows puzzles
// only from engine results in storage.
import { test, expect } from '@playwright/test';

const GAME = '[White "Ann"]\n[Black "Bob"]\n[Date "2026.11.01"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
const OTHER = '[White "Cy"]\n[Black "Di"]\n\n1. d4 d5 2. c4 *';

test.beforeEach(async ({ page }) => {
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.BlunderDrills);
});

// Fake engine results for GAME, one for each of its 8 positions. Each best move is the game move, at an even score,
// except 3… Nf6, which allows mate in 1: one blunder puzzle.
const fakeEvals = (page, src) => page.evaluate(src => {
  const g = window.BlunderDrills.parseInput(src);
  return g.positions.map((_, k) => {
    if (k === 5) return { score: { cp: -50 }, pv: ['g7g6'], best: 'g7g6', depth: 14 };
    if (k === 6) return { score: { mate: 1 }, pv: ['h5f7'], best: 'h5f7', depth: 14 };
    if (k === 7) return { score: { mate: 0, lost: true }, pv: [], best: null };
    return { score: { cp: 0 }, pv: [g.moves[k].uci], best: g.moves[k].uci, depth: 14 };
  });
}, src);
const keyOf = (page, src) => page.evaluate(src => window.BlunderDrills.gameKey(window.BlunderDrills.parseInput(src)), src);
// Write a game record (and its index entry) to localStorage, then reload.
async function seed(page, src, rec, at = Date.now()) {
  const k = await keyOf(page, src);
  await page.evaluate(([k, src, rec, at]) => {
    localStorage.setItem('drills.g.' + k, JSON.stringify({ src, progress: {}, ...rec }));
    const idx = JSON.parse(localStorage.getItem('drills.games') || '[]').filter(e => e.k !== k);
    localStorage.setItem('drills.games', JSON.stringify([...idx, { k, w: 'W', b: 'B', date: '', result: '', moves: 4, at }].sort((a, b) => b.at - a.at)));
  }, [k, src, rec, at]);
  return k;
}
const ls = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function pasteGame(page, text) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(t => navigator.clipboard.writeText(t), text);
  await page.locator('#paste').click();
}

test('a game with complete engine results in storage opens at once, with no engine', async ({ page }) => {
  await seed(page, GAME, { depth: 14, done: true, evals: await fakeEvals(page, GAME), progress: { '5blunder': 'solved' } });
  await page.reload();
  await expect(page.locator('#gsum')).toHaveText('Ann vs Bob · 1-0 · 4 moves');
  await expect(page.locator('#ptext')).toHaveText('Analysis complete');
  await expect(page.locator('#pmeta')).toHaveText(' · 8 positions at depth 14, from storage'); // depth 14 serves the default depth 10
  await expect(page.locator('.pitem .mv')).toHaveText(['3… Nf6']);
  await expect(page.locator('.pitem .st')).toHaveText('✓ Solved');
  await expect(page.locator('#evalNow')).toHaveText('Checkmate · 1-0');
});

test('engine results at a lower depth are not used; results stopped at the same depth are kept', async ({ page }) => {
  const evals = await fakeEvals(page, GAME);
  await page.evaluate(() => localStorage.setItem('drills.depth', '14'));
  const k = await seed(page, GAME, { depth: 10, done: true, evals });
  await page.reload();
  await expect(page.locator('#ptext')).toHaveText('The engine could not start in this browser.');
  await expect(page.locator('.pitem')).toHaveCount(0);
  await seed(page, GAME, { depth: 14, done: false, evals: [...evals.slice(0, 7), null] }); // stopped before the last position
  await page.reload();
  await expect(page.locator('.pitem .mv')).toHaveText(['3… Nf6']); // from the kept results, before the engine fails
  await expect(page.locator('#ptext')).toHaveText('The engine could not start in this browser.');
  expect((await ls(page, 'drills.g.' + k)).evals.slice(0, 7)).toEqual(evals.slice(0, 7));
});

test('moves the last game and its progress from before the library into the library', async ({ page }) => {
  const k = await keyOf(page, GAME);
  await page.evaluate(([k, src]) => {
    localStorage.clear();
    localStorage.setItem('drills.src', src);
    localStorage.setItem('drills.game.' + k, JSON.stringify({ '5blunder': 'retry' }));
  }, [k, GAME]);
  await page.reload();
  await expect(page.locator('#gsum')).toHaveText('Ann vs Bob · 1-0 · 4 moves');
  await expect(page.locator('#bGames')).toHaveText('Your games (1)');
  expect(await ls(page, 'drills.src')).toBeNull();
  expect(await ls(page, 'drills.game.' + k)).toBeNull();
  expect((await ls(page, 'drills.g.' + k)).progress).toEqual({ '5blunder': 'retry' });
  expect(await ls(page, 'drills.games')).toEqual([{ k, w: 'Ann', b: 'Bob', date: '2026.11.01', result: '1-0', moves: 4, at: expect.any(Number) }]);
});

test('Your games lists the pasted games, most recent first; a click opens one, × deletes one', async ({ page }) => {
  await expect(page.locator('#bGames')).toBeHidden(); // the sample game is not in the library
  await pasteGame(page, GAME);
  await expect(page.locator('#gsum')).toHaveText('Ann vs Bob · 1-0 · 4 moves');
  await pasteGame(page, OTHER);
  await expect(page.locator('#gsum')).toHaveText('Cy vs Di · 2 moves');
  const btn = page.locator('#bGames'), rows = page.locator('#glist .gopen');
  await expect(btn).toHaveText('Your games (2)');
  await expect(page.locator('#glist')).toBeHidden();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(rows).toHaveText(['Cy vs Di · 2 moves', 'Ann vs Bob · 1-0 · 2026.11.01 · 4 moves']);
  await expect(rows.first()).toHaveAttribute('aria-current', 'true');
  await rows.nth(1).click();
  await expect(page.locator('#gsum')).toHaveText('Ann vs Bob · 1-0 · 4 moves');
  await expect(page.locator('#glist')).toBeHidden();
  await btn.click();
  await expect(rows).toHaveText(['Ann vs Bob · 1-0 · 2026.11.01 · 4 moves', 'Cy vs Di · 2 moves']);
  await page.reload(); // the game opened last opens with the page
  await expect(page.locator('#gsum')).toHaveText('Ann vs Bob · 1-0 · 4 moves');
  await btn.click();
  const asked = [];
  page.once('dialog', d => { asked.push(d.message()); d.dismiss() }); // Cancel keeps the game
  await page.getByRole('button', { name: 'Delete Cy vs Di' }).click();
  await expect(rows).toHaveCount(2);
  expect(asked).toEqual(['Delete Cy vs Di? Its engine results and puzzle progress go too.']);
  page.on('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Delete Cy vs Di' }).click(); // not the game on the board
  await expect(rows).toHaveText(['Ann vs Bob · 1-0 · 2026.11.01 · 4 moves']);
  await expect(page.locator('#gsum')).toHaveText('Ann vs Bob · 1-0 · 4 moves');
  await page.getByRole('button', { name: 'Delete Ann vs Bob' }).click(); // the game on the board: the sample opens
  await expect(page.locator('#gsum')).toHaveText('Martin Reyes vs Priya Nair · 1-0 · 44 moves');
  await expect(btn).toBeHidden();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('drills.g.')).length)).toBe(1); // only the sample's record
});

// Make localStorage throw QuotaExceededError when a write would take the total over a limit, as a full browser does.
const limitStorage = (page, extra) => page.evaluate(extra => {
  const used = s => { let n = 0; for (let i = 0; i < s.length; i++) { const k = s.key(i); n += k.length + s.getItem(k).length } return n };
  const limit = used(localStorage) + extra, set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    const old = this.getItem(k);
    if (used(this) - (old === null ? 0 : k.length + old.length) + k.length + String(v).length > limit) throw new DOMException('full', 'QuotaExceededError');
    return set.call(this, k, v);
  };
}, extra);

test('when storage is full, the engine results of the game opened least recently go first', async ({ page }) => {
  const evals = await fakeEvals(page, GAME);
  const old = await seed(page, GAME, { depth: 14, done: true, evals, progress: { '5blunder': 'solved' } }, 1000); // the sample stays on the board
  await limitStorage(page, 0);
  await pasteGame(page, OTHER);
  await expect(page.locator('#gsum')).toHaveText('Cy vs Di · 2 moves');
  await expect(page.locator('#err')).toBeHidden();
  const rec = await ls(page, 'drills.g.' + old);
  expect(rec.evals).toBeNull(); // removed for space
  expect(rec.done).toBe(false);
  expect(rec.progress).toEqual({ '5blunder': 'solved' }); // the progress and the PGN stay
  expect(rec.src).toBe(GAME);
  expect(await ls(page, 'drills.g.' + await keyOf(page, OTHER))).toMatchObject({ src: OTHER });
});

test('says once when storage is full and there is nothing to remove', async ({ page }) => {
  await limitStorage(page, 0);
  await pasteGame(page, OTHER);
  await expect(page.locator('#gsum')).toHaveText('Cy vs Di · 2 moves');
  await expect(page.locator('#err')).toHaveText('The browser did not save this game: its storage is full or blocked. To make space, delete some games under Your games.');
  await pasteGame(page, GAME);
  await expect(page.locator('#gsum')).toHaveText('Ann vs Bob · 1-0 · 4 moves');
  await expect(page.locator('#err')).toBeHidden(); // said once for each page load
});
