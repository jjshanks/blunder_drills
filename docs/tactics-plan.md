# Blunder Drills: Tactics Checker — Later Motifs Plan

Written 2026-10-31. The v1 code is in the `tactics` section of `index.html`.

## Context

The v1 tactics checker names six core motifs: hanging piece, fork, pin, skewer, discovered attack or check, and double check. Each later motif in this plan plugs into the same function and the same confirmation rule.

**How v1 works.** `findTactics(fen, line)` in `index.html` plays a UCI line with chess.js and looks for a motif at each move of the side that starts the line (its first three moves). It uses only data the app already has, so it makes no engine calls.

- **Missed:** run on the puzzle position with the engine's better line (`p.pv`), or with the solver's line.
- **Allowed:** run on the position after the game move with the engine's answer (`p.refute`).

**Confirmation rule.** A motif counts only if the line pays off within six plies: the attacker captures on a target square and keeps a net gain of 2 or more pawns (1 for a hanging pawn), or the line gives checkmate. This stops false reports, for example a "fork" where the opponent defends both pieces.

Three more rules came from a test on the sample game, where the first version gave wrong advice on 3 of 7 puzzles:

- A recapture in a trade is not a hanging piece.
- A pawn is never a target of a fork, pin, skewer or discovered attack.
- A later mate confirms only a motif that attacks the king.

Each rule has a near-miss test in `tests/logic.spec.js`. The later motifs must keep these rules.

**Where the advice shows.** A second press of Hint gives the motif name ("Look for a knight fork"). After a solve or a solution, the feedback box tells the idea of the better line and what the game move allowed.

**Code shape.** `motifsAt(c, mv, prev)` returns the candidate motifs for one attacker move, best first, each as `{ motif, targets }`. `findTactics` checks the candidates in line order and returns the first one that the line pays off. A later motif adds one candidate in `motifsAt`, one phrase in `tacticWords`, one name in `tacticName` (for the hint) and its tests.

## Mate patterns

Mate patterns are the easiest next step: they look only at the final position of a line that ends in checkmate, so false reports are rare.

| Motif | Detection rule (final position of the line) | Test position to add |
| --- | --- | --- |
| Back-rank mate | The king is on its first rank. The mating piece is a rook or queen on that rank. The king's own pawns or pieces block all squares on the second rank in front of it. | White Re8# with Black pawns f7, g7, h7 and king g8 |
| Smothered mate | The mating piece is a knight. Every square next to the king holds a piece of the king's own side. | Philidor's legacy: Qg8+ Rxg8 Nf7# |
| Mating net (general) | The line ends in mate, and no named pattern above matches. Label only, no extra rule. | Any mate-in-2 puzzle from the existing tests |
| Mate threat allowed | The `refute` line ends in mate. The "allowed" advice says "The game move allowed mate in N". | A game move that drops the back-rank guard |

**Risks.** A mate that starts with a queen sacrifice also matches "hanging piece" for the defender's capture. The advice must name the mate, not the capture: mate patterns must rank above all v1 motifs.

**Hint text.** "Look for a back-rank mate" gives a strong clue. Use it only as the second hint, the same as the v1 motifs.

## Defender tactics

Defender tactics have the highest risk of false reports, because each one is a story over two or more moves, not a shape on one board. Do them last, and keep a strict payoff rule.

| Motif | Detection rule | Main false-report risk |
| --- | --- | --- |
| Removal of the defender | Attacker move A captures piece D. Before A, D defended target T. After A, T has no defender, and the line then captures T. | A normal trade that is followed by a second, unrelated capture |
| Overloaded piece | One enemy piece D is the only defender of two targets T1 and T2. The line captures one target, D recaptures, and the line then captures the other. | A defender with two duties that the line never tests |
| Deflection | Attacker move A (often a check or a sacrifice) forces piece D to leave a square or a line. The next attacker move uses that square or line to mate or to win material. | Any forced reply looks like a deflection; the rule must check that D had a guard duty before |
| Decoy | Attacker sacrifices on square S. The enemy piece that captures on S is then forked, pinned or mated there. | Overlaps with the fork or pin that follows; name both ("decoy into a fork") |

**Detection needs.** These detectors look at two positions (before and after the defender's move). `motifsAt` already gets the opponent's previous move as `prev`; these detectors also need the position before it, so `findTactics` must keep a list of positions. A helper `defenders(chess, square)` (from chess.js `attackers`) is the shared part.

**Test positions.** Take each one from a real puzzle set with a known theme tag (for example the Lichess puzzle database, CC0). Each detector needs at least two true cases and one near-miss case that must not match.

**Open question.** The Lichess puzzle tags could also serve as a test corpus for the v1 motifs: run `findTactics` on a sample of tagged puzzles and measure how often the names agree.

## Trapped piece

A trapped piece is an enemy piece (knight, bishop, rook or queen) that is attacked and has no safe square, and the line then captures it.

**Detection rule.** After attacker move A, for each attacked enemy piece P worth 3 or more:

1. List all legal moves of P (chess.js `moves({ square })`).
2. A move is safe if the destination is not attacked, or if it is a capture that wins material.
3. If P has no safe move and staying is not safe, P is trapped.
4. Confirm with the v1 payoff rule: the line captures P within six plies.

**Cost.** Each check plays every legal move of P and calls `attackers` on the destination. That is about 10 to 30 calls per piece, at most four pieces per position, three positions per line. This is small in the browser, but compute it once per puzzle and cache the result, the same as the v1 motifs.

**Test positions.** A Black bishop trapped on h2 after ...Bxh2 g3, a White bishop trapped on a7 after Bxa7 b6, and a knight trapped on a8 after Nxa8. Near miss: a knight on the rim that can still escape with a check.

**Real case from the sample game.** In puzzles 2 and 3 (13. Qb5+ and 13... Bd7), the real idea is that 13... c6 traps the White queen. v1 names only the smaller fork that comes later in the line (15... Qa5+). The trapped-piece detector must name 13... c6 there; add it as an end-to-end test.

## Order of work

Do the motifs in order of value to the learner and of low false-report risk. Each step is one small PR with its own tests.

1. **Mate patterns** — back-rank and smothered mate, plus "allowed mate in N". Low risk, and many missed mates are back-rank mates.
2. **Trapped piece** — one new detector, a clear payoff rule.
3. **Removal of the defender** — the first two-position detector; it adds the list of positions to `findTactics` for the steps after it.
4. **Overloaded piece**, then **deflection** and **decoy** — the highest risk; ship each one only after the near-miss tests pass.

**How each motif plugs in.** One candidate in `motifsAt` (mate patterns first, so a mate wins over a capture), one phrase in `tacticWords` for the advice after a solve, one name in `tacticName` for the hint, and tests in `tests/logic.spec.js`.

**Open questions**

- Should a line with two motifs (for example a decoy into a fork) name both, or only the first?
- Should we use the Lichess puzzle database (CC0) as an accuracy test for all motifs? It is large, so a fixed sample of about 200 puzzles is enough.
- Should the stepper show a note on the move where the motif happens? This was out of scope for v1.
