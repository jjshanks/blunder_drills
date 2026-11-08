// Tests for saved puzzles, training mode, its stats, and export and import (docs/library-plan.md, PR 2).
// The engine download is blocked. The game has engine results in storage, so its puzzle shows with no engine. A solve
// with the best move, the first hint and Show solution do not need the engine.
import { test, expect } from '@playwright/test';

const GAME = '[White "Ann"]\n[Black "Bob"]\n[Date "2026.11.01"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';

// Put GAME in the library with fake engine results: one blunder puzzle, 3… Nf6 (ply 5; the best move is g7g6).
async function seedGame(page) {
  await page.evaluate(src => {
    const D = window.BlunderDrills, g = D.parseInput(src), k = D.gameKey(g);
    const evals = g.positions.map((_, i) => i === 5 ? { score: { cp: -50 }, pv: ['g7g6', 'h5f3'], best: 'g7g6', depth: 14 }
      : i === 6 ? { score: { mate: 1 }, pv: ['h5f7'], best: 'h5f7', depth: 14 }
        : i === 7 ? { score: { mate: 0, lost: true }, pv: [], best: null }
          : { score: { cp: 0 }, pv: [g.moves[i].uci], best: g.moves[i].uci, depth: 14 });
    localStorage.setItem('drills.g.' + k, JSON.stringify({ src, depth: 14, done: true, evals, progress: {} }));
    localStorage.setItem('drills.games', JSON.stringify([{ k, w: 'Ann', b: 'Bob', date: '2026.11.01', result: '1-0', moves: 4, at: Date.now() }]));
  }, GAME);
  await page.reload();
  await expect(page.locator('#pmeta')).toHaveText(' · 8 positions at depth 14, from storage');
  return page.evaluate(() => window.BlunderDrills.state.key);
}
const ls = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function play(page, uci) {
  await page.locator(`.sq[data-sq="${uci.slice(0, 2)}"]`).click();
  await page.locator(`.sq[data-sq="${uci.slice(2, 4)}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.BlunderDrills);
});

test('saves a puzzle from the list or the trainer head, and removes it again', async ({ page }) => {
  const k = await seedGame(page);
  const star = page.locator('#plist .star'), save = page.locator('#bSave'), train = page.locator('#bTrain');
  await expect(train).toBeHidden(); // no saved puzzles yet
  await expect(save).toHaveText('☆ Save');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(save).toHaveText('★ Saved');
  await expect(train).toHaveText('Train (1)');
  const saved = await ls(page, 'drills.saved');
  expect(Object.keys(saved)).toEqual([k + ':5']);
  expect(saved[k + ':5'].g).toEqual({ k, w: 'Ann', b: 'Bob', date: '2026.11.01' });
  expect(saved[k + ':5'].p).toMatchObject({ ply: 5, color: 'b', type: 'blunder', best: 'g7g6', depth: 14, played: { san: 'Nf6' } });
  expect(saved[k + ':5'].p.status).toBeUndefined(); // the copy has no game progress
  await page.reload();
  await expect(train).toHaveText('Train (1)');
  await save.click(); // remove
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(train).toBeHidden();
  expect(await ls(page, 'drills.saved')).toEqual({});
});

test('training counts the first result of each attempt, moves the box, and keeps the game progress apart', async ({ page }) => {
  const k = await seedGame(page), id = k + ':5';
  await page.locator('#plist .star').click();
  await page.locator('#bTrain').click();
  await expect(page.locator('#bTrain')).toHaveText('Back to game');
  await expect(page.locator('.listp')).toBeHidden();
  await expect(page.locator('.trainp')).toBeVisible();
  await expect(page.locator('#ctx')).toContainText('Ann vs Bob: 3… Nf6');
  await expect(page.locator('#bPrev')).toBeHidden();
  await expect(page.locator('#tcount')).toHaveText('Training · 0 done');
  await expect(page.locator('#tlist .st')).toHaveText(['Not tried']);

  await play(page, 'g7g6'); // clean
  await expect(page.locator('#fb')).toContainText('Found it: g6');
  await expect(page.locator('#tSession')).toHaveText('This session: 1 puzzle · 1 clean · 0 with help · 0 revealed.');
  await expect(page.locator('#tcount')).toHaveText('Training · 1 done');
  await expect(page.locator('#lWhich [data-k="whole"]')).toBeHidden(); // no game on the board
  expect(await ls(page, 'drills.train')).toEqual({ [id]: { box: 1, tries: 1, clean: 1, helped: 0, revealed: 0, last: 'clean', lastAt: expect.any(Number) } });
  await page.locator('#bRetry').click(); // the same attempt: no second result
  await play(page, 'g7g6');
  await page.locator('#bSol').click();
  expect((await ls(page, 'drills.train'))[id]).toMatchObject({ box: 1, tries: 1 });

  await page.locator('#bNext').click(); // a hint makes it "with help"
  await page.locator('#bHint').click();
  await play(page, 'g7g6');
  await expect(page.locator('#tSession')).toHaveText('This session: 2 puzzles · 1 clean · 1 with help · 0 revealed.');
  expect((await ls(page, 'drills.train'))[id]).toMatchObject({ box: 0, tries: 2, helped: 1 });

  await page.locator('#bNext').click();
  await page.locator('#bSol').click();
  expect((await ls(page, 'drills.train'))[id]).toMatchObject({ box: 0, tries: 3, revealed: 1, last: 'revealed' });
  await expect(page.locator('#tStats tr')).toHaveText(['All timeSavedTriesClean', 'Blunders131 (33%)', 'Total131 (33%)']);
  await expect(page.locator('#tlist .st')).toHaveText(['1/3 clean']);

  await page.locator('#bTrain').click(); // back to the game
  await expect(page.locator('.listp')).toBeVisible();
  await expect(page.locator('#bTrain')).toHaveText('Train (1)');
  await expect(page.locator('#ctx')).toContainText('In the game: 3… Nf6');
  await expect(page.locator('#plist .st')).toHaveText('Not tried'); // training did not touch the game status
});

test('a saved puzzle still works after its game is deleted', async ({ page }) => {
  await seedGame(page);
  await page.locator('#plist .star').click();
  page.on('dialog', d => d.accept());
  await page.locator('#bGames').click();
  await page.getByRole('button', { name: 'Delete Ann vs Bob' }).click();
  await expect(page.locator('#gsum')).toHaveText('Martin Reyes vs Priya Nair · 1-0 · 44 moves');
  await page.locator('#bTrain').click();
  await expect(page.locator('#ctx')).toContainText('Ann vs Bob: 3… Nf6');
  await play(page, 'g7g6');
  await expect(page.locator('#fb')).toContainText('Found it: g6');
  await page.locator('.trainp .star').click(); // remove the last saved puzzle: training ends at the next puzzle
  await page.locator('#bNext').click();
  await expect(page.locator('.listp')).toBeVisible();
  await expect(page.locator('#bTrain')).toBeHidden();
});

test('pickNext favours the missed puzzles and skips the last ones shown', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { pickNext } = window.BlunderDrills, ids = ['a', 'b', 'c', 'd', 'e'], stats = { a: { box: 4 }, b: { box: 0 } };
    const counts = {}; let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++) { const id = pickNext(ids, stats, [], rnd); counts[id] = (counts[id] || 0) + 1 }
    return {
      counts,
      skip: [...new Set(Array.from({ length: 200 }, () => pickNext(ids, stats, ['c', 'd', 'e'], rnd)))].sort(),
      two: [...new Set(Array.from({ length: 50 }, () => pickNext(['a', 'b'], {}, ['a', 'b', 'a'], rnd)))],
      one: pickNext(['a'], {}, ['a'], rnd),
    };
  });
  // Weights: a (box 4) 1, the others (box 0) 16 each. a comes about 1/65 of the time.
  expect(r.counts.a).toBeLessThan(150);
  expect(r.counts.b).toBeGreaterThan(800);
  expect(r.skip).toEqual(['a', 'b']); // the last 3 are skipped
  expect(r.two).toEqual(['b']); // with 2 saved puzzles, only the last one is skipped
  expect(r.one).toBe('a'); // one saved puzzle comes up each time
});

test('exports a backup and imports it into an empty browser', async ({ page }) => {
  const k = await seedGame(page), id = k + ':5';
  await page.locator('#plist .star').click();
  await page.locator('#bTrain').click();
  await play(page, 'g7g6');
  await expect(page.locator('#tSession')).toContainText('1 clean');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#bExport').click()]);
  expect(download.suggestedFilename()).toMatch(/^blunder-drills-\d{4}-\d\d-\d\d\.json$/);
  await expect(page.locator('#backupMsg')).toHaveText('Exported 1 game and 1 saved puzzle.');
  const file = await download.path();
  const data = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'));
  expect(data).toMatchObject({ app: 'blunder-drills', v: 1, games: [{ k, w: 'Ann', rec: { depth: 14, done: true } }], train: { [id]: { clean: 1 } } });

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#bTrain')).toBeHidden();
  await page.locator('#importFile').setInputFiles({ name: 'not.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.locator('#backupMsg')).toHaveText('That file is not a Blunder Drills backup.');
  await page.locator('#importFile').setInputFiles(file);
  await expect(page.locator('#backupMsg')).toHaveText('Imported 1 new game and 1 new saved puzzle.');
  await expect(page.locator('#bGames')).toHaveText('Your games (1)');
  await expect(page.locator('#bTrain')).toHaveText('Train (1)');
  expect((await ls(page, 'drills.train'))[id]).toMatchObject({ box: 1, clean: 1 });
  await page.locator('#bGames').click();
  await page.locator('#glist .gopen').click(); // the game opens from the imported engine results
  await expect(page.locator('#pmeta')).toHaveText(' · 8 positions at depth 14, from storage');
  await page.locator('#importFile').setInputFiles(file); // a second import adds nothing
  await expect(page.locator('#backupMsg')).toHaveText('Imported 0 new games and 0 new saved puzzles.');
});

test('an import does not trust the file: bad puzzles, statuses and stats are dropped, and no script runs', async ({ page }) => {
  const k = await seedGame(page), id = k + ':5';
  await page.locator('#plist .star').click();
  const good = (await ls(page, 'drills.saved'))[id];
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const xss = '<img src=x onerror="window.pwned=1">';
  const file = {
    app: 'blunder-drills', v: 1,
    games: [
      { k, w: xss, b: 'Bob', rec: { src: GAME, depth: 14, done: true, evals: [{ score: { cp: xss }, pv: [], best: null }], progress: { '5blunder': xss, '6mate': 'solved' } } },
      { k: '../drills.saved', w: 'A', b: 'B', rec: { src: GAME } },
    ],
    saved: { [id]: good, bad1: { ...good, p: { ...good.p, type: xss } }, bad2: { ...good, p: { ...good.p, played: { ...good.p.played, from: xss } } } },
    train: { [id]: { box: 99, tries: 2, clean: xss, helped: 1, revealed: 0, last: xss } },
  };
  await page.locator('#importFile').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#backupMsg')).toHaveText('Imported 1 new game and 1 new saved puzzle.');
  expect(Object.keys(await ls(page, 'drills.saved'))).toEqual([id]);
  expect((await ls(page, 'drills.train'))[id]).toEqual({ box: 0, tries: 2, clean: 0, helped: 1, revealed: 0 });
  const rec = await ls(page, 'drills.g.' + k);
  expect(rec).toMatchObject({ done: false, evals: [null], progress: { '6mate': 'solved' } });
  expect(rec.progress['5blunder']).toBeUndefined();
  await page.locator('#bGames').click();
  await expect(page.locator('#glist .gopen')).toContainText(`${xss} vs Bob`); // text, not markup
  await page.locator('#bGames').click();
  await page.locator('#bTrain').click();
  await expect(page.locator('#ctx')).toContainText('Ann vs Bob: 3… Nf6');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});
