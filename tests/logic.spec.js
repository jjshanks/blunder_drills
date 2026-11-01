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

test('material counts White minus Black in pawns', async ({ page }) => {
  const r = await run(page, D => [
    D.material(new D.Chess()),
    D.material(new D.Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')),
    D.material(new D.Chess('rn2k3/8/8/8/8/8/8/4K3 w - - 0 1')),
  ]);
  expect(r).toEqual([0, 9, -8]);
});

test('studyPgn escapes quotes and backslashes in player names', async ({ page }) => {
  // Checks the text only: chess.js 1.4.0 cannot read \" inside a tag, so it cannot round-trip this.
  const tags = await run(page, D => {
    D.state.game = { headers: { White: 'Ann "The Rook" Lee', Black: 'C:\\chess' } };
    D.state.puzzles = [{ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', pv: ['e2e4'], type: 'blunder', color: 'w', played: { color: 'w', moveNo: 1, san: 'a3' } }];
    return D.studyPgn().split('\n').filter(l => /^\[(White|Black) /.test(l));
  });
  expect(tags).toEqual(['[White "Ann \\"The Rook\\" Lee"]', '[Black "C:\\\\chess"]']);
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
    expect(r.moves).toBe(87);
    expect(r.positions).toBe(88);
    expect(r.white).toBe('Martin Reyes');
    expect(r.first).toEqual({ san: 'e4', from: 'e2', to: 'e4', uci: 'e2e4', color: 'w', moveNo: 1 });
    expect(r.second).toMatchObject({ san: 'e5', color: 'b', moveNo: 1 });
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
    const evals2 = evals.map((e, k) => e && { ...e, pv: [`pv${k}`] });
    return D.detectPuzzles(g, evals2, { maxMate: 2, withMistakes: false, ...a.opts })
      .map(p => ({ ply: p.ply, type: p.type, color: p.color, mateN: p.mateN, refute: p.refute }));
  }, { scores, opts });

  test('flags a blunder when the win chance drops by 0.3 or more', async ({ page }) => {
    // 1. e4 takes White from +0.3 to -3.0.
    expect(await detect(page, [{ cp: 30 }, { cp: 300 }, { cp: -300 }, { cp: 300 }, { cp: -300 }]))
      .toEqual([{ ply: 0, type: 'blunder', color: 'w', refute: ['pv1'] }]);
  });

  test('flags a mistake (drop 0.2 to 0.3) only when mistakes are included', async ({ page }) => {
    const scores = [{ cp: 0 }, { cp: 140 }, { cp: -140 }, { cp: 140 }, { cp: -140 }];
    expect(await detect(page, scores)).toEqual([]);
    expect(await detect(page, scores, { withMistakes: true })).toEqual([{ ply: 0, type: 'mistake', color: 'w', refute: ['pv1'] }]);
  });

  test('ignores small drops', async ({ page }) => {
    expect(await detect(page, [{ cp: 0 }, { cp: 50 }, { cp: -50 }, { cp: 60 }, { cp: -60 }])).toEqual([]);
  });

  test('flags a missed mate within the limit', async ({ page }) => {
    // Black is already lost. White has mate in 2 before 2. Nf3, and 2. Nf3 misses it.
    expect(await detect(page, [{ cp: 0 }, { mate: -3 }, { mate: 2 }, { cp: -100 }, { cp: 100 }]))
      .toEqual([{ ply: 2, type: 'mate', color: 'w', mateN: 2, refute: ['pv3'] }]);
  });

  test('does not flag a move that keeps the mate on track', async ({ page }) => {
    // Mate in 2, and after the move Black is mated in 1.
    expect(await detect(page, [{ cp: 0 }, { mate: -3 }, { mate: 2 }, { mate: -1 }, { cp: 0 }])).toEqual([]);
  });

  test('a lost mate beyond the limit counts as a blunder; inside the limit as a mate', async ({ page }) => {
    const scores = [{ cp: 0 }, { mate: -5 }, { mate: 4 }, { cp: -100 }, { cp: 100 }];
    expect(await detect(page, scores)).toEqual([{ ply: 2, type: 'blunder', color: 'w', refute: ['pv3'] }]);
    expect(await detect(page, scores, { maxMate: 5 })).toEqual([{ ply: 2, type: 'mate', color: 'w', mateN: 4, refute: ['pv3'] }]);
  });

  test('skips moves whose positions are not analysed yet', async ({ page }) => {
    expect(await detect(page, [{ cp: 30 }, null, { cp: -300 }, { cp: 300 }, null])).toEqual([]);
  });
});

test.describe('findTactics', () => {
  // Each case: a position, a line of UCI moves from it, and the words the checker must give (or null).
  const words = (page, fen, line) => run(page, (D, a) => { const t = D.findTactics(a.fen, a.line); return t && `${t.san} ${D.tacticWords(t)}` }, { fen, line });

  test('names each core motif when the line pays it off', async ({ page }) => {
    const cases = [
      ['r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', ['d5c7', 'e8d7', 'c7a8'], 'Nc7+ forks the king and the rook on a8, and wins the rook'],
      ['4k3/7p/8/4n3/8/8/5P2/R5K1 w - - 0 1', ['a1e1', 'h7h6', 'f2f4', 'h6h5', 'f4e5'], 'Re1 pins the knight on e5 to the king, and wins the knight'],
      ['r7/8/8/3k4/8/8/6B1/4K3 w - - 0 1', ['g2f3', 'd5c5', 'f3a8'], 'Bf3+ skewers the king and the rook on a8 behind it, and wins the rook'],
      ['4k3/1q6/8/8/4N3/8/8/4R1K1 w - - 0 1', ['e4c5', 'e8d8', 'c5b7'], 'Nc5+ gives a discovered check from the rook on e1, while the knight attacks the queen on b7, and wins the queen'],
      ['4k2q/8/8/8/3N4/8/1B6/4K3 w - - 0 1', ['d4f5', 'e8d7', 'b2h8'], 'Nf5 uncovers an attack by the bishop on b2 on the queen on h8, and wins the queen'],
      ['3qkb2/3p1p2/8/8/4N3/8/8/4R1K1 w - - 0 1', ['e4d6'], 'Nd6# gives double check, which is mate'],
      ['4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', ['d1d5'], 'Qxd5 takes the knight on d5 for free'],
    ];
    for (const [fen, line, want] of cases) expect(await words(page, fen, line)).toBe(want);
  });

  test('finds a tactic on a later move, for Black too', async ({ page }) => {
    const r = await run(page, D => { const t = D.findTactics('4k3/8/8/4n3/8/8/1R3K2/8 b - - 0 1', ['e8e7', 'f2e3', 'e5c4', 'e3d4', 'c4b2']); return [t.ply, t.color, D.tacticWords(t), D.tacticHint(t)] });
    expect(r).toEqual([2, 'b', 'forks the king and the rook on b2, and wins the rook', 'Look for a knight fork. It comes on your second move.']);
  });

  test('does not name a motif that the line does not pay off', async ({ page }) => {
    // The king takes the forking knight.
    expect(await words(page, 'r2k4/8/8/3N4/8/8/8/4K3 w - - 0 1', ['d5c7', 'd8c7'])).toBeNull();
    // A defended knight is traded for a knight.
    expect(await words(page, '4k3/8/4p3/3n4/8/8/8/3NK3 w - - 0 1', ['d1c3', 'e8e7', 'c3d5', 'e6d5'])).toBeNull();
    // The queen takes a knight that a pawn defends.
    expect(await words(page, '4k3/8/4p3/3n4/8/8/8/3QK3 w - - 0 1', ['d1d5', 'e6d5'])).toBeNull();
    // A recapture is part of a trade, not a free piece: ...Bxd4 Qxd4.
    expect(await words(page, '4k3/8/8/8/3N4/8/P7/3QK1b1 w - - 0 1', ['a2a3', 'g1d4', 'd1d4'])).toBeNull();
  });

  test('a pawn is not a fork target, even when the line then mates', async ({ page }) => {
    // Qb3+ checks and hits the loose b7 pawn; the mate that follows comes from Qf7 and Qf8, not from a fork.
    expect(await words(page, '6k1/1p4pp/8/8/8/8/8/3QK3 w - - 0 1', ['d1b3', 'g8h8', 'b3f7', 'b7b6', 'f7f8'])).toBeNull();
  });

  test('a later mate confirms only a motif that hits the king', async ({ page }) => {
    // Bc3 pins the knight to the queen; the back-rank mate Re8# has nothing to do with the pin.
    expect(await words(page, '6k1/p4ppp/5q2/8/3n4/8/4R3/4B2K w - - 0 1', ['e1c3', 'a7a6', 'e2e8'])).toBeNull();
  });

  test('tacticNotes tells the idea and what the game move allowed', async ({ page }) => {
    // White played Qd2?? instead of Nc7+, and Black takes the queen with the knight.
    const r = await run(page, D => {
      const p = { fen: 'r3k3/8/8/3N4/4n3/8/8/3QK3 w - - 0 1', played: { uci: 'd1d2' }, refute: ['e4d2', 'e1d2'] };
      return D.tacticNotes(p, ['d5c7', 'e8e7', 'c7a8']);
    });
    expect(r).toBe('The idea: 1. Nc7+ forks the king and the rook on a8, and wins the rook. '
      + 'The game move, 1. Qd2, allowed 1... Nxd2, which takes the queen on d2 with a knight.');
  });
});
