// End-to-end tests: the real page with the real Stockfish engine from unpkg (needs network).
import { test, expect } from '@playwright/test';

const SAMPLE_PUZZLES = ['20… Rb8', '29. Rd2', '32… Kf8', '33. d5', '36… Rd7', '41… Rh5'];

// The puzzle checks below are for the sample game at depth 14. The page default is Fast · 10, so the tests choose 14
// unless a test chose a depth itself.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('drills.depth')) localStorage.setItem('drills.depth', '14') });
});

async function openAnalyzed(page, url = '/') {
  await page.goto(url);
  await expect(page.locator('#engineText')).toHaveText('Stockfish 18 ready', { timeout: 60_000 });
  await expect(page.locator('#ptext')).toHaveText('Analysis complete', { timeout: 90_000 });
}
// Put text in the clipboard, then click Paste game.
async function pasteGame(page, text) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(t => navigator.clipboard.writeText(t), text);
  await page.locator('#paste').click();
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
// FEN after the first k moves of a UCI line from the puzzle position.
const fenAfter = (page, p, line, k) => page.evaluate(([fen, line, k]) => {
  const c = new window.BlunderDrills.Chess(fen);
  for (const u of line.slice(0, k)) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return c.fen();
}, [p.fen, line, k]);
const boardFen = page => page.evaluate(() => window.BlunderDrills.trainer.chess.fen());
async function expectBoardAt(page, p, line, k) {
  const fen = await fenAfter(page, p, line, k);
  await page.waitForFunction(fen => window.BlunderDrills.trainer.chess.fen() === fen, fen, { timeout: 10_000 });
}
async function expectGameMoveArrow(page, p) {
  await expect(arrow(page)).toHaveCount(1);
  await expect(arrow(page)).toHaveAttribute('data-from', p.played.slice(0, 2));
  await expect(arrow(page)).toHaveAttribute('data-to', p.played.slice(2, 4));
}

test('analyzes the sample game into the expected puzzles', async ({ page }) => {
  await openAnalyzed(page);
  await expect(page.locator('#summary')).toHaveText(/^6 puzzles: 1 missed mate, 5 blunders\./);
  await expect(page.locator('.pitem .mv')).toHaveText(SAMPLE_PUZZLES);
  await expect(page.locator('.pitem .kind.mate')).toHaveText(['Missed mate in 2']);
  await expect(page.locator('.pitem .kind')).toHaveText(['?? (blunder)', '?? (blunder)', '?? (blunder)', 'Missed mate in 2', '?? (blunder)', '?? (blunder)']);
  await expect(page.locator('#chart .mk')).toHaveCount(6);
  await expect(page.locator('#tcount')).toHaveText('Puzzle 1 of 6');
  await expect(page.locator('#prog .bar')).toBeHidden(); // a complete analysis keeps only its line of text
  await expect(page.locator('#engine')).toBeHidden(); // a ready engine needs no status
});

test('solves a blunder puzzle on the first try, then steps through the engine line', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  await expectGameMoveArrow(page, p);
  await play(page, p.best);
  await expect(arrow(page)).toHaveCount(0);
  await expect(page.locator('#fb')).toHaveClass(/good/);
  await expect(page.locator('#fb')).toContainText('Found it: ');
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('✓ Solved');
  await expect(page.locator('#summary')).toContainText('Solved on first try: 1.');

  // Autoplay is off: the board stays after the solving move.
  const line = p.pv.slice(0, 6), n = line.length;
  await expect(page.locator('#stepper')).toBeVisible();
  await expect(page.locator('#autoplay')).not.toBeChecked();
  await expect(page.locator('#lPos')).toHaveText(new RegExp(`^Move 1 of ${n}: `));
  await page.waitForTimeout(1500);
  expect(await boardFen(page)).toBe(await fenAfter(page, p, line, 1));

  // Step with the keyboard and the buttons.
  await page.keyboard.press('ArrowRight');
  await expectBoardAt(page, p, line, 2);
  await expect(page.locator('#lPos')).toHaveText(new RegExp(`^Move 2 of ${n}: `));
  await page.locator('#lFwd').click();
  await expectBoardAt(page, p, line, 3);
  await page.keyboard.press('ArrowLeft');
  await expectBoardAt(page, p, line, 2);
  await page.keyboard.press('End');
  await expectBoardAt(page, p, line, n);
  await expect(page.locator('#lFwd')).toBeDisabled();
  await page.locator('#lStart').click();
  await expectBoardAt(page, p, line, 0);
  await expect(page.locator('#lPos')).toHaveText(`Start · ${n} moves`);
  await expect(page.locator('#lBack')).toBeDisabled();

  // Turning autoplay on plays the rest of the line.
  await page.locator('#autoplay').check();
  await expectBoardAt(page, p, line, n);
});

test('compares the better line with the game line', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page); // 20... Rb8, +0.1 -> +2.9
  await play(page, p.best);
  const best = page.locator('#lWhich button[data-k="best"]'), game = page.locator('#lWhich button[data-k="game"]');
  await expect(best).toHaveAttribute('aria-pressed', 'true');
  await expect(best).toContainText('Better: 20... ');
  await expect(page.locator('#lSum')).toContainText('Engine eval for this line: +0.1, about equal');
  await expect(page.locator('#lSum')).toContainText('Material here: ');
  await expect(page.locator('#lLine .cur')).toHaveCount(1);
  await page.keyboard.press('ArrowRight'); // better line now at move 2

  await game.click();
  await expect(game).toHaveAttribute('aria-pressed', 'true');
  await expect(game).toHaveText('Game: 20... Rb8');
  await expect(page.locator('#lSum')).toContainText('Engine eval for this line: +2.9, White is better');
  await expect(page.locator('#lPos')).toHaveText(/^Start · /);
  await expectBoardAt(page, p, [], 0);
  await page.keyboard.press('ArrowRight');
  await expectBoardAt(page, p, [p.played], 1);
  await expect(page.locator('#lLine .cur')).toHaveText('20... Rb8');

  await best.click(); // each line keeps its place
  await expectBoardAt(page, p, p.pv, 2);
  await expect(page.locator('#lWhich button[data-k="engine"]')).toBeHidden(); // the engine's move was found: no extra line
});

test('a good move that is not the engine\'s first choice links to the engine\'s move', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page); // 20... Rb8: the engine's first choice is 20... Rc8 (+0.1), and 20... Qd6 (+0.2) also passes
  expect(p.best).toBe('a8c8');
  await play(page, 'd8d6');
  await expect(page.locator('#fb')).toHaveClass(/good/, { timeout: 30_000 });
  await expect(page.locator('#fb')).toContainText(/^Found it: Qd6 \(\S+\)\. The engine's first choice is 20\.\.\. Rc8 \(\+0\.1\)\./);
  await expect(page.locator('#fb')).not.toContainText('also works');
  const best = page.locator('#lWhich button[data-k="best"]'), engine = page.locator('#lWhich button[data-k="engine"]');
  await expect(best).toHaveText('Better: 20... Qd6');
  await expect(engine).toHaveText('Engine: 20... Rc8');

  await page.locator('#fb .mvlink', { hasText: '20... Rc8' }).click();
  await expect(engine).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#lSum')).toContainText('Engine eval for this line: +0.1');
  await expectBoardAt(page, p, p.pv, 1);
});

test('the chart shows the eval of the better line as a branch from the game, until the puzzle closes', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page); // 20... Rb8, +0.1 -> +2.9
  await expect(page.locator('#chart .best')).toHaveCount(0);
  await expect(page.locator('#lgBest')).toBeHidden();
  await play(page, p.best);
  const n = Math.min(6, p.pv.length);
  // The engine checks each position of the line, then the branch has one point for the start and one for each move.
  await page.waitForFunction(n => (window.BlunderDrills.trainer.lines.best.evals || []).length === n + 1, n, { timeout: 30_000 });
  await expect(page.locator('#lgBest')).toBeVisible();
  const d = await page.locator('#chart .best path').first().getAttribute('d');
  expect(d.split(' L')).toHaveLength(n + 1);
  await expect(page.locator('#chart .best title')).toHaveText(/^Better line from 20\.\.\. \S+: ends at \S+$/);
  const end = await page.evaluate(() => { const L = window.BlunderDrills.trainer.lines.best; return L.evals[L.evals.length - 1] });
  expect(Math.abs(end.cp ?? 0)).toBeLessThan(150); // the better line stays near equal, far from the game's +2.9
  await expect(page.locator('#chart .best circle')).toHaveCount(1); // the move on the board
  await page.locator('#bRetry').click();
  await expect(page.locator('#chart .best')).toHaveCount(0);
  await expect(page.locator('#lgBest')).toBeHidden();
});

test('autoplay stays on for the next puzzle, and is off again after a reload', async ({ page }) => {
  test.slow(); // two full analyses and an autoplay: on a busy machine (8 parallel workers) it can take more than 2 minutes
  await page.addInitScript(() => localStorage.setItem('drills.autoplay', '1')); // a value from an older version: not used
  await openAnalyzed(page);
  await play(page, (await current(page)).best);
  await expect(page.locator('#autoplay')).not.toBeChecked();
  await page.locator('#autoplay').check();
  await page.locator('#bNext').click();
  const p = await current(page);
  await play(page, p.best);
  await expectBoardAt(page, p, p.pv.slice(0, 6), Math.min(6, p.pv.length));
  await page.reload();
  await expect(page.locator('#ptext')).toHaveText('Analysis complete', { timeout: 90_000 });
  await expect(page.locator('#autoplay')).not.toBeChecked();
});

test('rejects the game move, resets the board, then counts a later solve as a retry', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  await expect(page.locator('#bRetry')).toBeHidden(); // nothing to retry before a move
  await play(page, p.played);
  await expect(page.locator('#fb')).toHaveClass(/bad/);
  await expect(page.locator('#bRetry')).toBeVisible();
  await expect(page.locator('#fb')).toContainText('that is the move from the game.');
  await page.waitForFunction(fen => {
    const t = window.BlunderDrills.trainer;
    return t.mode === 'play' && t.chess.fen() === fen;
  }, p.fen);
  await expect(page.locator('#bHint')).toBeEnabled(); // the buttons follow the board back to play
  await expectGameMoveArrow(page, p);
  await play(page, p.best);
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('✓ retry');
});

test('plays out the missed mate in 2 against the engine', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('.pitem', { hasText: 'Missed mate in 2' }).click();
  await expect(page.locator('#prompt')).toHaveText('White to move. Mate in 2.');
  await play(page, (await current(page)).best);
  await expect(page.locator('#fb')).toContainText('Opponent replies');
  await expect(page.locator('#bHint')).toBeEnabled();
  const mate = await page.evaluate(() => {
    const c = new window.BlunderDrills.Chess(window.BlunderDrills.trainer.chess.fen());
    const m = c.moves({ verbose: true }).find(m => { c.move(m); const x = c.isCheckmate(); c.undo(); return x });
    return m.from + m.to;
  });
  await play(page, mate);
  await expect(page.locator('#fb')).toContainText('That is checkmate.');
});

test('solves a puzzle by dragging a piece', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  await page.locator(`.sq[data-sq="${p.best.slice(0, 2)}"]`).dragTo(page.locator(`.sq[data-sq="${p.best.slice(2, 4)}"]`));
  await expect(page.locator('#fb')).toContainText('Found it: ');
  await expect(page.locator('.pc.ghost')).toHaveCount(0);
});

test('dropping a piece on an illegal square puts it back', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  const from = p.best.slice(0, 2), to = from === 'a1' ? 'h8' : 'a1';
  await page.locator(`.sq[data-sq="${from}"]`).dragTo(page.locator(`.sq[data-sq="${to}"]`));
  await expect(page.locator('.pc.ghost')).toHaveCount(0);
  expect(await boardFen(page)).toBe(p.fen);
  expect(await page.evaluate(() => [window.BlunderDrills.trainer.mode, window.BlunderDrills.trainer.sel])).toEqual(['play', null]);
  await expect(page.locator('#fb')).toHaveClass(/info/);
});

test('Show solution marks the puzzle as revealed and plays the solving move on the board', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  await page.locator('#bSol').click();
  await expect(page.locator('#fb')).toContainText('Solution');
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('Revealed');
  await expect(page.locator('#lPos')).toHaveText(/^Move 1 of \d+: /);
  await expectBoardAt(page, p, p.pv, 1);
  await expect(page.locator(`#board .sq.last[data-sq="${p.best.slice(2, 4)}"]`)).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await expectBoardAt(page, p, p.pv, 0);
  await page.locator('#lLine button').nth(2).click(); // a move in the line goes to that move
  await expectBoardAt(page, p, p.pv, 3);
  await expect(page.locator('#lPos')).toHaveText(/^Move 3 of /);
  await page.locator('#bNext').click();
  await expect(page.locator('#stepper')).toBeHidden();
});

test('keyboard shortcuts work the puzzle buttons', async ({ page }) => {
  await openAnalyzed(page);
  await page.keyboard.press('h');
  await expect(page.locator('#fb')).toHaveText('Hint: move the highlighted piece. Press Hint again for the idea.');
  await page.keyboard.press('n');
  await expect(page.locator('#tcount')).toHaveText('Puzzle 2 of 6');
  await page.keyboard.press('s');
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('Revealed');
  await page.keyboard.press('r');
  await expect(page.locator('#stepper')).toBeHidden();
  await page.keyboard.press('p');
  await expect(page.locator('#tcount')).toHaveText('Puzzle 1 of 6');
});

test('a filter that hides the puzzle on the board opens the next one for that player', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('.pitem .mv', { hasText: '32… Kf8' }).click();
  await page.getByRole('button', { name: 'Martin Reyes (White)' }).click();
  await expect(page.locator('#prompt')).toHaveText('White to move. Mate in 2.'); // 33. d5, the next White puzzle
  await expect(page.locator('#tcount')).toHaveText('Puzzle 2 of 2');
  await expect(page.locator('#chart .mk')).toHaveCount(2);
  await expect(page.locator('#bPrev')).toBeEnabled();
});

test('the second hint names the tactic, and the solution explains it', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('.pitem .mv', { hasText: '33. d5' }).click();
  const p = await current(page);
  await page.locator('#bHint').click();
  await expect(page.locator('#fb')).toHaveText('Hint: move the highlighted piece. Press Hint again for the idea.');
  await expect(page.locator(`.sq.hint[data-sq="${p.best.slice(0, 2)}"]`)).toHaveCount(1);
  await page.locator('#bHint').click();
  await expect(page.locator('#fb')).toHaveText('Hint: move the highlighted piece. Look for a queen fork.');
  await page.locator('#bSol').click();
  await expect(page.locator('#fb .note')).toHaveText('The idea: 33. Qe8+ forks the king and the rook on d8, and leads to mate.');
});

test('the second hint names what the game move allowed when the better move is not a tactic', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('.pitem .mv', { hasText: '20… Rb8' }).click();
  await page.locator('#bHint').click();
  await page.locator('#bHint').click();
  await expect(page.locator('#fb')).toHaveText('Hint: move the highlighted piece. The game move allowed a knight fork. Find a move that stops it.');
  await page.locator('#bSol').click();
  await expect(page.locator('#fb .note')).toHaveText('The game move, 20... Rb8, lost your rook. It allowed 21. Nc6, which forks your queen on d8 and your rook on b8, and wins the rook.');
});

test('a queen left under attack: the note, the line of attack and a badge of the lost queen', async ({ page }) => {
  // 2... d5 opens the c8 bishop's line to the queen on g4. 3. Nc3 leaves the queen there.
  await openAnalyzed(page);
  await pasteGame(page, '1. e4 e5 2. Qg4 d5 3. Nc3 Bxg4 *');
  await expect(page.locator('#ptext')).toHaveText('Analysis complete', { timeout: 90_000 });
  await page.locator('.pitem .mv', { hasText: '3. Nc3' }).click();
  await page.locator('#bSol').click();
  await expect(page.locator('#fb .note')).toContainText('The game move, 3. Nc3, lost your queen. Your queen on g4 was already under attack from the bishop on c8, and 3... Bxg4 takes it for free.');
  const threat = async () => {
    await expect(page.locator('#board .arrow')).toHaveCount(1);
    await expect(page.locator('#board .arrow.attack')).toHaveAttribute('data-from', 'c8');
    await expect(page.locator('#board .arrow.attack')).toHaveAttribute('data-to', 'g4');
    await expect(page.locator('.sq.tgt[data-sq="g4"]')).toHaveCount(1);
  };
  await page.locator('#fb .note .mvlink', { hasText: '3. Nc3' }).click(); // the game line, after the game move
  await expect(page.locator('#lPos')).toHaveText('Move 1 of 6: 3. Nc3');
  await threat();
  await page.keyboard.press('Home'); // the puzzle position: the attack was there already
  await threat();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lPos')).toHaveText('Move 2 of 6: 3... Bxg4');
  const badge = page.locator('.sq[data-sq="g4"] .took');
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveClass(/\bloss\b/); // White lost it, and the puzzle is White's
  await expect(page.locator('.sq[data-sq="g4"]')).toHaveAttribute('aria-label', 'g4 Black bishop, took the White queen');
  await page.keyboard.press('ArrowRight'); // only the last move's capture has a badge
  await expect(badge).toHaveCount(0);
});

test('a move in the solution note opens its line and draws the tactic on the board', async ({ page }) => {
  await openAnalyzed(page);
  await page.locator('.pitem .mv', { hasText: '41… Rh5' }).click();
  const p = await current(page);
  await page.locator('#bSol').click();
  await page.locator('#fb .note .mvlink', { hasText: '42. Qh8+' }).click();
  await expect(page.locator('#lWhich button[data-k="game"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#lPos')).toHaveText('Move 2 of 6: 42. Qh8+');
  await expectBoardAt(page, p, [p.played, 'c8h8'], 2);
  // The skewer: the queen move, one attack arrow through the king to the rook, and a ring on each.
  await expect(page.locator('.sq.tgt')).toHaveCount(2);
  await expect(page.locator('.sq.tgt[data-sq="h6"]')).toHaveCount(1);
  await expect(page.locator('.sq.tgt[data-sq="h5"]')).toHaveCount(1);
  await expect(page.locator('#board .arrow:not(.attack)')).toHaveAttribute('data-from', 'c8');
  await expect(page.locator('#board .arrow.attack')).toHaveAttribute('data-from', 'h8');
  await expect(page.locator('#board .arrow.attack')).toHaveAttribute('data-to', 'h5');
  await page.keyboard.press('ArrowRight'); // the marks belong to that one position
  await expect(page.locator('.sq.tgt')).toHaveCount(0);
  await expect(page.locator('#board .arrow')).toHaveCount(0);
});

test('a click on the chart opens the whole game without giving away the puzzle', async ({ page }) => {
  await openAnalyzed(page);
  const box = await page.locator('#chart').boundingBox();
  await page.locator('#chart').click({ position: { x: box.width * 34 / 600 + 1, y: box.height / 2 } }); // left edge of the plot
  await expect(page.locator('#lWhich button[data-k="whole"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#lWhich button[data-k="best"]')).toBeHidden();
  await expect(page.locator('#lWhich button[data-k="game"]')).toBeHidden();
  await expect(page.locator('#lPos')).toHaveText('Start · 87 moves');
  await expect(page.locator('#fb')).toHaveText('This is the whole game. To go back to the puzzle, click it in the list or press Retry.');
  expect(await boardFen(page)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  await expect(page.locator('#bHint')).toBeDisabled();
  await page.keyboard.press('End');
  await expect(page.locator('#lPos')).toHaveText('Move 87 of 87: 44. Qxh5+');
  await expect(page.locator('#lSum')).toContainText('Engine eval here: +');
  await page.locator('#bRetry').click();
  await expect(page.locator('#stepper')).toBeHidden();
  await expect(page.locator('#prompt')).toHaveText('Black to move. Improve on Rb8.');
});

test('after a solution, the whole game opens at the puzzle position', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page); // 20... Rb8
  await page.locator('#bSol').click();
  await page.locator('#lWhich button[data-k="whole"]').click();
  await expect(page.locator('#lPos')).toHaveText('Move 39 of 87: 20. Ne5');
  expect(await boardFen(page)).toBe(p.fen);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lLine .cur')).toHaveText('Rb8');
  await expect(page.locator('#lWhich button[data-k="best"]')).toBeVisible(); // a solved puzzle keeps its other lines
});

test('filters puzzles by player', async ({ page }) => {
  await openAnalyzed(page);
  await page.getByRole('button', { name: 'Martin Reyes (White)' }).click();
  await expect(page.locator('.pitem .mv')).toHaveText(['29. Rd2', '33. d5']);
  await page.getByRole('button', { name: 'Priya Nair (Black)' }).click();
  await expect(page.locator('.pitem .mv')).toHaveText(['20… Rb8', '32… Kf8', '36… Rd7', '41… Rh5']);
});

test('exports one valid Lichess study chapter per puzzle', async ({ page }) => {
  await openAnalyzed(page);
  // The number of moves in each chapter, or 0 if the PGN does not load.
  const chapters = await page.evaluate(() => window.BlunderDrills.studyPgn().split('\n\n\n').map(ch => {
    try { const c = new window.BlunderDrills.Chess(); c.loadPgn(ch); return c.history().length } catch { return 0 }
  }));
  // A blunder chapter has only the key move, as in the app: a Lichess lesson would ask for every move. The mate (33. d5) has its whole line.
  expect(chapters).toEqual([1, 1, 1, 3, 1, 1]);
  expect(await page.evaluate(() => window.BlunderDrills.studyPgn().split('\n\n\n')[0])).toMatch(/ \{Engine line: 20\.\.\. \S+ .+\} \*$/);
  // The Lichess tip shows under the button after a copy, not before.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await expect(page.locator('#copyNote')).toBeHidden();
  await page.locator('#copyAll').click();
  await expect(page.locator('#copyNote')).toBeVisible();
  await expect(page.locator('#copyBox')).toBeHidden();
});

test('analyzes a pasted game that ends in checkmate and remembers it after reload', async ({ page }) => {
  await openAnalyzed(page);
  await expect(page.locator('#gsum')).toHaveText('Martin Reyes vs Priya Nair · 1-0 · 44 moves');
  await pasteGame(page, '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
  await expect(page.locator('#gsum')).toHaveText('White vs Black · 1-0 · 4 moves');
  await expect(page.locator('#pmeta')).toHaveText(/^ · 8 positions/, { timeout: 60_000 });
  await expect(page.locator('#ptext')).toHaveText('Analysis complete');
  await expect(page.locator('.pitem .mv')).toContainText(['3… Nf6']);
  await expect(page.locator('#evalNow')).toHaveText('Checkmate · 1-0');
  await page.reload();
  await expect(page.locator('#gsum')).toHaveText('White vs Black · 1-0 · 4 moves');
});

test('a game with no puzzles says so after the analysis, and how to find more', async ({ page }) => {
  await openAnalyzed(page);
  await pasteGame(page, '1. e4 e5 2. Nf3 Nc6 *');
  await expect(page.locator('#prompt')).toHaveText('Finding puzzles…');
  await expect(page.locator('#ptext')).toHaveText('Analysis complete', { timeout: 60_000 });
  await expect(page.locator('#prompt')).toHaveText('No puzzles in this game');
  await expect(page.locator('#fb')).toHaveText('The engine found no blunders or missed mates with these settings. To find more, turn on Include mistakes, allow longer missed mates or choose a greater engine depth.');
  await expect(page.locator('#summary')).toHaveText('No puzzles in this game with these settings.');
  await expect(page.locator('#plist .empty')).toHaveCount(0);
  await page.locator('#mistakes').check(); // a tip that is already on is not given
  await expect(page.locator('#fb')).toHaveText('The engine found no blunders, mistakes or missed mates with these settings. To find more, allow longer missed mates or choose a greater engine depth.');
});

test('remembers the settings, the player and the progress after a reload', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page); // 20... Rb8, a Black puzzle
  await play(page, p.best);
  await expect(page.locator('.pitem[aria-current="true"] .st')).toHaveText('✓ Solved');
  await page.getByRole('button', { name: 'Priya Nair (Black)' }).click();
  await page.locator('#maxMate').selectOption('3');
  await page.locator('#depth').selectOption('10'); // analyzes the game again
  await page.reload();
  await expect(page.locator('#maxMate')).toHaveValue('3');
  await expect(page.locator('#depth')).toHaveValue('10');
  await expect(page.getByRole('button', { name: 'Priya Nair (Black)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ptext')).toHaveText('Analysis complete', { timeout: 90_000 });
  // The analysis ran at depth 10, but the progress belongs to the game, so it stays.
  await expect(page.locator('.pitem', { hasText: '20… Rb8' }).locator('.st')).toHaveText('✓ Solved');
});

test('Copy FEN says Copied even when the browser blocks the Clipboard API', async ({ page }) => {
  await openAnalyzed(page);
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('blocked')) });
  await page.locator('#bFen').click();
  await expect(page.locator('#bFen')).toHaveText('Copied');
  await expect(page.locator('#copyBox')).toBeHidden();
});

test('fits the board and the puzzle actions in a short desktop window', async ({ page }) => {
  await page.setViewportSize({ width: 1265, height: 712 });
  await openAnalyzed(page);
  for (const s of ['#prompt', '#bframe', '#bHint', '#bNext']) await expect(page.locator(s)).toBeInViewport({ ratio: 1 });
  // A prompt that wraps onto three lines makes the board smaller, not the actions go out of view.
  await page.locator('#prompt').evaluate(e => { e.textContent = 'Black to move. This test prompt is long on purpose, so that it wraps onto three lines in the trainer.' });
  expect(await page.locator('#prompt').evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThan(80);
  for (const s of ['#prompt', '#bframe', '#bHint', '#bNext']) await expect(page.locator(s)).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#bNext')).not.toHaveClass(/primary/); // Next is the main action only after the puzzle
  await page.locator('#bSol').click();
  await expect(page.locator('#bNext')).toHaveClass(/primary/);
});

test('a clipboard that does not hold a game shows an error and keeps the current game', async ({ page }) => {
  await openAnalyzed(page);
  await pasteGame(page, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  await expect(page.locator('#err')).toContainText('single position (FEN)');
  await pasteGame(page, '   ');
  await expect(page.locator('#err')).toHaveText('The clipboard is empty. Copy a game in PGN format, then click Paste game.');
  await page.evaluate(() => { navigator.clipboard.readText = () => Promise.reject(new Error('denied')) });
  await page.locator('#paste').click();
  await expect(page.locator('#err')).toContainText('did not let the page read the clipboard');
  await expect(page.locator('#gsum')).toHaveText('Martin Reyes vs Priya Nair · 1-0 · 44 moves');
  await expect(page.locator('.pitem .mv')).toHaveText(SAMPLE_PUZZLES);
  await expect(page.locator('#ptext')).toHaveText('Analysis complete');
  await page.reload(); // the game in storage is still the sample
  await expect(page.locator('#gsum')).toHaveText('Martin Reyes vs Priya Nair · 1-0 · 44 moves');
});

test('Fast · 10 is the default engine depth', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#depth option[selected]')).toHaveAttribute('value', '10');
});

test('keeps keyboard focus on the board, so a move can be made with the keyboard', async ({ page }) => {
  await openAnalyzed(page);
  const p = await current(page);
  const from = p.best.slice(0, 2), to = p.best.slice(2, 4);
  await page.locator(`.sq[data-sq="${from}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`.sq[data-sq="${from}"]`)).toBeFocused();
  await expect(page.locator(`.sq.sel[data-sq="${from}"]`)).toHaveCount(1);
  await page.locator(`.sq[data-sq="${to}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#fb')).toContainText('Found it: ');
  await expect(page.locator(`.sq[data-sq="${to}"]`)).toBeFocused();
});

test('stops cleanly and says so when the engine crashes during analysis', async ({ page }) => {
  // Make the real worker crash at its third search: stop it and fire an error event.
  await page.addInitScript(() => {
    const Real = window.Worker; let searches = 0;
    window.Worker = class extends Real {
      postMessage(m) {
        if (String(m).startsWith('go') && ++searches === 3) { this.terminate(); setTimeout(() => this.onerror && this.onerror(new ErrorEvent('error'))); return }
        super.postMessage(m);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('#engineText')).toHaveText('Engine stopped working', { timeout: 60_000 });
  await expect(page.locator('#err')).toHaveText('Stockfish stopped working. Reload the page to try again.');
  await expect(page.locator('#ptext')).toHaveText(/^Stopped at position 3 of \d+: the engine stopped working\.$/);
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
  await expect(page.locator('.pitem')).toHaveCount(6);
});
