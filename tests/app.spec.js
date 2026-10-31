// End-to-end tests: the real page with the real Stockfish engine from unpkg (needs network).
import { test, expect } from '@playwright/test';

const SAMPLE_PUZZLES = ['5… Be7', '13. Qb5+', '13… Bd7', '14. Qb4', '14… Nxa4', '17. Qa6', '24… Nxe2+'];

async function openAnalyzed(page, url = '/') {
  await page.goto(url);
  await expect(page.locator('#engineText')).toHaveText('Stockfish 18 ready', { timeout: 60_000 });
  await expect(page.locator('#ptext')).toHaveText(/^Done/, { timeout: 90_000 });
}
async function play(page, uci) {
  await page.locator(`.sq[data-sq="${uci.slice(0, 2)}"]`).click();
  await page.locator(`.sq[data-sq="${uci.slice(2, 4)}"]`).click();
}
const current = page => page.evaluate(() => {
  const p = window.BlunderDrills.trainer.p;
  return { fen: p.fen, best: p.best, played: p.played.uci, pv: p.pv };
});
const arrow = page => page.locator('#board .arrow');
async function expectGameMoveArrow(page, p) {
  await expect(arrow(page)).toHaveCount(1);
  await expect(arrow(page)).toHaveAttribute('data-from', p.played.slice(0, 2));
  await expect(arrow(page)).toHaveAttribute('data-to', p.played.slice(2, 4));
}

test('analyzes the sample game into the expected puzzles', async ({ page }) => {
  await openAnalyzed(page);
  await expect(page.locator('#summary')).toHaveText(/^7 puzzles: 1 missed mate, 6 blunders\./);
  await expect(page.locator('.pitem .mv')).toHaveText(SAMPLE_PUZZLES);
  await expect(page.locator('.pitem .chip.mate')).toHaveText(['Mate in 2']);
  await expect(page.locator('#chart .mk')).toHaveCount(7);
  await expect(page.locator('#tcount')).toHaveText('Puzzle 1 of 7');
});

test('solves a blunder puzzle with the engine move on the first try, then plays out the line', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  await expectGameMoveArrow(page, p);
  await play(page, p.best);
  await expect(arrow(page)).toHaveCount(0);
  await expect(page.locator('#fb')).toHaveClass(/good/);
  await expect(page.locator('#fb')).toContainText('Solved.');
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('✓ Solved');
  await expect(page.locator('#summary')).toContainText('Solved on first try: 1.');
  // The board steps through the engine line shown in the feedback.
  const end = await page.evaluate(p => {
    const c = new Chess(p.fen);
    for (const u of p.pv.slice(0, 6)) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    return c.fen();
  }, p);
  await page.waitForFunction(fen => window.BlunderDrills.trainer.chess.fen() === fen, end, { timeout: 10_000 });
});

test('rejects the game move, resets the board, then counts a later solve as a retry', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  await play(page, p.played);
  await expect(page.locator('#fb')).toHaveClass(/bad/);
  await expect(page.locator('#fb')).toContainText('That is the move from the game.');
  await page.waitForFunction(fen => {
    const t = window.BlunderDrills.trainer;
    return t.mode === 'play' && t.chess.fen() === fen;
  }, p.fen);
  await expectGameMoveArrow(page, p);
  await play(page, p.best);
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('Solved after retry');
});

test('plays out the missed mate in 2 against the engine', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('.pitem', { hasText: 'Mate in 2' }).click();
  await expect(page.locator('#prompt')).toHaveText('Black to move. Mate in 2.');
  await play(page, (await current(page)).best);
  await expect(page.locator('#fb')).toContainText('Opponent replies');
  const mate = await page.evaluate(() => {
    const c = new Chess(window.BlunderDrills.trainer.chess.fen());
    const m = c.moves({ verbose: true }).find(m => { c.move(m); const x = c.in_checkmate(); c.undo(); return x });
    return m.from + m.to;
  });
  await play(page, mate);
  await expect(page.locator('#fb')).toContainText('Checkmate. Solved.');
});

test('Show solution marks the puzzle as revealed', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('#bSol').click();
  await expect(page.locator('#fb')).toContainText('Solution');
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('Revealed');
});

test('filters puzzles by player', async ({ page }) => {
  await openAnalyzed(page);
  await page.getByRole('button', { name: 'Alex Sample (White)' }).click();
  await expect(page.locator('.pitem .mv')).toHaveText(['13. Qb5+', '14. Qb4', '17. Qa6']);
  await page.getByRole('button', { name: 'Sam Example (Black)' }).click();
  await expect(page.locator('.pitem')).toHaveCount(4);
});

test('exports one valid Lichess study chapter per puzzle', async ({ page }) => {
  await openAnalyzed(page);
  const chapters = await page.evaluate(() => window.BlunderDrills.studyPgn().split('\n\n\n')
    .map(ch => ({ fen: /\[FEN "([^"]+)"\]/.exec(ch)[1], ok: new Chess().load_pgn(ch) })));
  expect(chapters).toHaveLength(7);
  expect(chapters.every(c => c.ok)).toBe(true);
});

test('analyzes a pasted game that ends in checkmate and remembers it after reload', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('#src').fill('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
  await page.locator('#run').click();
  await expect(page.locator('#ptext')).toHaveText(/^Done · 8 positions/, { timeout: 60_000 });
  await expect(page.locator('.pitem .mv')).toContainText(['3… Nf6']);
  await expect(page.locator('#evalNow')).toHaveText('Final 1-0');
  await page.reload();
  await expect(page.locator('#src')).toHaveValue(/Qxf7#/);
});

test('shows an error for a bare FEN', async ({ page }) => {
  await page.goto('/');
  await page.locator('#src').fill('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  await page.locator('#run').click();
  await expect(page.locator('#err')).toBeVisible();
  await expect(page.locator('#err')).toContainText('single position (FEN)');
});

test('falls back to the asm.js engine when the WebAssembly build fails', async ({ page }) => {
  await page.route('**/stockfish-18-lite-single.js', route => route.fulfill({ status: 404 }));
  await page.goto('/');
  await expect(page.locator('#engineText')).toHaveText('Stockfish 18 (asm.js) ready', { timeout: 120_000 });
});

test('reports an engine that cannot load', async ({ page }) => {
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#engineText')).toHaveText('Engine failed to load');
  await expect(page.locator('#err')).toContainText('Stockfish could not start');
});

test('runs when index.html is opened from disk', async ({ page }) => {
  await openAnalyzed(page, new URL('../index.html', import.meta.url).href);
  await expect(page.locator('.pitem')).toHaveCount(7);
});
