// Tests for the pure functions in index.html, called through window.BlunderDrills.
// The engine download is blocked, so these tests do not need Stockfish.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.BlunderDrills);
});

// Run fn in the page with the hooks object as its first argument.
const run = (page, fn, arg) => page.evaluate(([src, a]) => new Function('D', 'a', `return (${src})(D, a)`)(window.BlunderDrills, a), [fn.toString(), arg]);

test.describe('scores', () => {
  test('wc maps centipawns to [-1, 1], symmetric and clamped at 1000', async ({ page }) => {
    const r = await run(page, D => ({
      zero: D.wc({ cp: 0 }),
      sym: D.wc({ cp: 250 }) + D.wc({ cp: -250 }),
      clamp: D.wc({ cp: 5000 }) === D.wc({ cp: 1000 }),
      mateWin: D.wc({ mate: 3 }), mateLoss: D.wc({ mate: -3 }),
      matedNow: D.wc({ mate: 0, lost: true }),
    }));
    expect(r.zero).toBe(0);
    expect(r.sym).toBeCloseTo(0, 10);
    expect(r.clamp).toBe(true);
    expect([r.mateWin, r.mateLoss, r.matedNow]).toEqual([1, -1, -1]);
  });

  test('neg flips the point of view', async ({ page }) => {
    const r = await run(page, D => [D.neg({ cp: 120 }), D.neg({ mate: 2 }), D.neg({ mate: 0, lost: true })]);
    expect(r[0]).toEqual({ cp: -120 });
    expect(r[1]).toMatchObject({ mate: -2 });
    expect(r[2]).toMatchObject({ won: true, lost: false });
  });

  test('fmt formats evaluations from White\'s side', async ({ page }) => {
    const r = await run(page, D => [{ cp: 123 }, { cp: -50 }, { cp: 0 }, { mate: 3 }, { mate: -2 }, { mate: 0, won: true }, { mate: 0, lost: true }].map(D.fmt));
    expect(r).toEqual(['+1.2', '−0.5', '0.0', '#3', '#-2', '1-0', '0-1']);
  });

  test('mateDist is the mate distance for the side to move, else Infinity', async ({ page }) => {
    const r = await run(page, D => [D.mateDist({ mate: 2 }), D.mateDist({ mate: -2 }), D.mateDist({ cp: 900 }), D.mateDist({ mate: 0, won: true })]);
    expect(r).toEqual([2, Infinity, Infinity, 0]);
  });
});

test.describe('PGN input', () => {
  test('cleanPgn removes comments, variations, NAGs and move annotations', async ({ page }) => {
    const r = await run(page, D => D.cleanPgn('[White "A"]\n\n1. e4!? {best by test} e5 (1... c5 (1... e6)) 2. Nf3 $1 ; line comment\nNc6?? *'));
    expect(r).toBe('[White "A"]\n\n1. e4 e5 2. Nf3 Nc6 *');
  });

  test('parseInput reads the sample game', async ({ page }) => {
    const r = await run(page, D => {
      const g = D.parseInput(document.querySelector('#src').value);
      return { moves: g.moves.length, positions: g.positions.length, white: g.headers.White, first: g.moves[0], second: g.moves[1] };
    });
    expect(r.moves).toBe(89);
    expect(r.positions).toBe(90);
    expect(r.white).toBe('Alex Sample');
    expect(r.first).toEqual({ san: 'Nc3', from: 'b1', to: 'c3', uci: 'b1c3', color: 'w', moveNo: 1 });
    expect(r.second).toMatchObject({ san: 'Nf6', color: 'b', moveNo: 1 });
  });

  test('parseInput honours a [FEN] start position and records promotions', async ({ page }) => {
    const r = await run(page, D => D.parseInput('[SetUp "1"]\n[FEN "k7/7P/8/8/8/8/8/K7 w - - 0 40"]\n\n40. h8=Q+ Ka7 *'));
    expect(r.startFen).toBe('k7/7P/8/8/8/8/8/K7 w - - 0 40');
    expect(r.moves.map(m => [m.uci, m.color, m.moveNo])).toEqual([['h7h8q', 'w', 40], ['a8a7', 'b', 40]]);
  });

  test('parseInput rejects empty input, a bare FEN, bad PGN and games with no moves', async ({ page }) => {
    const errs = await run(page, D => ['  ', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', '1. e4 e5 2. Ke3 Ke6 3. Qh9', '[White "A"]\n[Black "B"]\n\n*']
      .map(t => { try { D.parseInput(t); return 'no error' } catch (e) { return e.message } }));
    expect(errs[0]).toMatch(/Paste a PGN/);
    expect(errs[1]).toMatch(/single position \(FEN\)/);
    expect(errs[2]).toMatch(/Could not read that PGN/);
    expect(errs[3]).toMatch(/no moves/);
  });

  test('pvSan writes engine lines with move numbers', async ({ page }) => {
    const r = await run(page, D => [
      D.pvSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5', 'g1f3']),
      D.pvSan('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e7e5', 'g1f3', 'b8c6']),
      D.pvSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e2e4']), // stops at an illegal move
    ]);
    expect(r).toEqual(['1. e4 e5 2. Nf3', '1... e5 2. Nf3 Nc6', '1. e4']);
  });
});

test.describe('detectPuzzles', () => {
  // Game: 1. e4 e5 2. Nf3 Nc6 (4 moves, 5 positions). Each evals entry is the engine result for that
  // position, scored for the side to move. The engine's best move is d2d4 (or d7d5) so it never equals
  // the move that was played.
  const detect = (page, scores, opts = {}) => run(page, (D, a) => {
    const g = D.parseInput('1. e4 e5 2. Nf3 Nc6 *');
    const evals = a.scores.map((s, k) => s && { score: s, best: k % 2 ? 'd7d5' : 'd2d4', pv: [] });
    return D.detectPuzzles(g, evals, { maxMate: 2, withMistakes: false, ...a.opts })
      .map(p => ({ ply: p.ply, type: p.type, color: p.color, mateN: p.mateN }));
  }, { scores, opts });

  test('flags a blunder when the win chance drops by 0.3 or more', async ({ page }) => {
    // 1. e4 takes White from +0.3 to -3.0.
    expect(await detect(page, [{ cp: 30 }, { cp: 300 }, { cp: -300 }, { cp: 300 }, { cp: -300 }]))
      .toEqual([{ ply: 0, type: 'blunder', color: 'w' }]);
  });

  test('flags a mistake (drop 0.2 to 0.3) only when mistakes are included', async ({ page }) => {
    const scores = [{ cp: 0 }, { cp: 140 }, { cp: -140 }, { cp: 140 }, { cp: -140 }];
    expect(await detect(page, scores)).toEqual([]);
    expect(await detect(page, scores, { withMistakes: true })).toEqual([{ ply: 0, type: 'mistake', color: 'w' }]);
  });

  test('ignores small drops', async ({ page }) => {
    expect(await detect(page, [{ cp: 0 }, { cp: 50 }, { cp: -50 }, { cp: 60 }, { cp: -60 }])).toEqual([]);
  });

  test('flags a missed mate within the limit', async ({ page }) => {
    // Black is already lost. White has mate in 2 before 2. Nf3, and 2. Nf3 misses it.
    expect(await detect(page, [{ cp: 0 }, { mate: -3 }, { mate: 2 }, { cp: -100 }, { cp: 100 }]))
      .toEqual([{ ply: 2, type: 'mate', color: 'w', mateN: 2 }]);
  });

  test('does not flag a move that keeps the mate on track', async ({ page }) => {
    // Mate in 2, and after the move Black is mated in 1.
    expect(await detect(page, [{ cp: 0 }, { mate: -3 }, { mate: 2 }, { mate: -1 }, { cp: 0 }])).toEqual([]);
  });

  test('a lost mate beyond the limit counts as a blunder; inside the limit as a mate', async ({ page }) => {
    const scores = [{ cp: 0 }, { mate: -5 }, { mate: 4 }, { cp: -100 }, { cp: 100 }];
    expect(await detect(page, scores)).toEqual([{ ply: 2, type: 'blunder', color: 'w' }]);
    expect(await detect(page, scores, { maxMate: 5 })).toEqual([{ ply: 2, type: 'mate', color: 'w', mateN: 4 }]);
  });

  test('skips moves whose positions are not analysed yet', async ({ page }) => {
    expect(await detect(page, [{ cp: 30 }, null, { cp: -300 }, { cp: 300 }, null])).toEqual([]);
  });
});
