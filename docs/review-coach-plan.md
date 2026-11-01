# Blunder Drills: Game Review Coach — Future Plan

Written 2026-10-31. **Status: future plan, not scheduled.** We will improve this plan later. It does not change the code.

## Goal

Give the player a game review in the browser, similar to a game review by Claude. For each key moment, the review shows:

- the engine candidates, with evals and lines,
- a verdict on the player's in-game note (right, partly right, missed),
- "what you got right" and "what you got wrong" bullets,
- one habit to build.

The review also gives a whole-game summary: what you do well, and three habits to build.

## Decision: fact card + templates, no language model

All the chess facts in a review must come from code. Small language models cannot read a position (see Appendix A), so they cannot supply the facts. We must build the fact card anyway. When we have the facts, templates can write the text:

- no download (a model is 400 to 650 MB),
- no wait (a model takes 25 to 60 s for each moment on the CPU),
- no invented moves or squares,
- tests can check each output, the same as the tactics checker.

The study of a small in-browser model (SLM) is in Appendix A. It is a possible later step, if the template text is too repetitive. Its first step (the fact layer) is the same as the first step of this plan, so no work is lost.

## What the Claude review does

We divide the 18...Rfb8 moment of the review into parts, and we show where each part can come from in the browser.

| Part of the review | Example | Source in the browser | Exists today? |
| --- | --- | --- | --- |
| Candidates, evals, lines | Rab8 +6.0, Nxa6 +5.7, Rfb8 +5.3, Ne4 +1.8 | Stockfish MultiPV | Partly. The UCI parser reads only line 1 (`index.html:378`). |
| The player's note | "after that Ne4 then Nd2 forks the rooks" | PGN comments | No. `cleanPgn` removes `{...}` comments (`index.html:389`). |
| "Protect first was right" | Ne4 at once drops to +1.8 | Note claim + eval of the named move (`go searchmoves`) | No (note checker) |
| "'White won't play Bd3' was the real miss" | Bd3 is White's best reply | Note claim "X unlikely" + the engine's best reply | No (note checker) |
| "Bd3 covers e4, the fork square" | | Attack map after the reply + the square named in the note | No (feature) |
| "The a8 rook had no job" | | Piece roles: what each piece attacks and defends | No (feature) |
| "f8 rook guards the f-file where f4–f5 is coming" | | Opponent's PV + piece roles | No (feature) |
| Named tactics | knight fork, back-rank mate | `findTactics` | Yes |
| Habit | "Plan against the best reply" | Mistake type → habit (fixed list) | No (taxonomy) |
| Whole-game summary | three habits | Count mistake types over all moments | No |

## Design

```
PGN with the player's notes as {comments}
   │
   ▼
Stockfish (MultiPV, plus searchmoves for moves named in a note)
   │
   ▼
Key moments (exists: detectPuzzles), plus every move that has a note
   │
   ▼
Fact layer (code)
   • candidates, evals, eval drops
   • tactics (exists: findTactics)
   • piece roles: idle piece, sole defender, what a move stops guarding
   • opponent's best reply, and what it attacks or blocks
   • open files, squares around an exposed king
   • note checker: claims in the note → true / false
   │
   ▼
Fact card  { verdict, facts[] with a type and a weight, mistakeType }
   │
   ▼
Templates  → right[], wrong[], habit, and the whole-game summary
```

### Fact card

A fact card is a plain object for one moment. Each fact has a type, its data and a weight. The weight sets the order of the bullets. Example for 18...Rfb8:

```js
{
  ply: 35, played: 'Rfb8', best: 'Rab8', verdict: 'partial',
  facts: [
    { type: 'claimTrue',  claim: 'protectFirst', target: 'b2', alt: 'Ne4', altEval: 1.8, weight: 3 },
    { type: 'betterMove', move: 'Rab8', eval: 6.0, playedEval: 5.3, weight: 3 },
    { type: 'idlePiece',  piece: 'Ra8', weight: 2 },
    { type: 'workingPiece', piece: 'Rf8', guards: ['f-file'], weight: 2 },
    { type: 'claimFalse', claim: 'unlikely', move: 'Bd3', isBestReply: true, covers: ['e4'], weight: 3 },
  ],
  mistakeType: 'ignoredBestReply',
}
```

### Templates

Each fact type has one function that gives a sentence, the same as `tacticWords` for tactics. Each type has two or three phrasings, so the text is not the same at every moment. The choice of phrasing is fixed for each moment (for example, the ply number selects it), so tests are repeatable.

Output of the templates for the card above:

- **Right:** "You protected b2 before you went for the fork. 18...Ne4 at once was only +1.8, because White takes b2."
- **Wrong:** "18...Rab8 was better (+6.0 against +5.3). The a8 rook had no job, but the f8 rook guarded the f-file."
- **Wrong:** "You wrote that White would not play Bd3. It was White's best reply, and it covers e4, the square for your fork."
- **Habit:** "Plan against your opponent's best reply, not the one you hope for."

This is near the Claude text. The difference is style: the Claude text explains more and links the ideas together. The facts are the same.

### Note checker

The note checker is the most difficult new part. The notes are informal ("i think the rook gos to b1"). It must accept bad spelling, lowercase SAN and words for pieces.

| Claim type | Example phrases | Check |
| --- | --- | --- |
| Own plan ("I will play X") | "i play the f8 rook to b8", "Rfb8" | Resolve to a legal move. Compare its eval with the best eval. |
| Opponent move is unlikely | "i don't think white plays Bd3", "they won't play X" | Is X the engine's best reply, or near it? |
| Need to protect first | "i guard it first" | Does the plan move protect the named square or piece? Does the alternative lose it? |
| Move looks good | "Ne4 then Nd2 forks" | Eval of X with `go searchmoves X`. Does `findTactics` confirm the named motif? |
| Move hangs or loses material | "g5 hangs the pawn" | Material change in the PV after X |
| Positional worry | "I don't want to double my pawns" | Eval of the move that the player avoided. Can an enemy piece attack the weakness? |

When the checker cannot read part of a note, it ignores that part. It must not guess. A wrong verdict on the player's own words does more harm than no verdict.

### Verdict rule

- **right:** the played move is within a small eval margin of the best move, and no claim that matters is false.
- **partial:** the move or the note is near the best, but one claim that matters is false, or a clearly better move existed.
- **missed:** the best idea is not in the move and not in the note.

The margins are an open question. Calibrate them on your own annotated games.

### Habits

A fixed list of mistake types. Each type has one habit text. The whole-game summary counts the mistake types over all moments and shows the three most common ones. It also shows the claim types the player got right most often ("what you do well").

| Mistake type | Detected by | Habit |
| --- | --- | --- |
| `stopsGuarding` | A move left a piece or pawn with no defender, and the player did not take it | "When a piece moves, ask what it stopped guarding." |
| `ignoredBestReply` | A `claimFalse` of type "unlikely" for the engine's best reply | "Plan against your opponent's best reply." |
| `materialOverMate` | A mate existed, and the played move took material | "When the enemy king is in the open, look for checks before material." |
| `wrongPiece` | The best move uses the same idea with a different piece (Rab8 against Rfb8) | "Move the idle piece and keep the working one." |
| `tradedKeyPiece` | The player traded the piece that the best line uses | "When you are ahead, trade pieces, but keep the piece your plan needs." |
| `switchedPlan` | A plan move, then a different plan on the next move | "Pick a plan and give it two or three moves." |
| `openFile` | A file opened after a capture, and the best move puts a rook on it | "After a pawn capture, look for a rook on the open file." |

## Order of work

Each step is one small PR with its own tests, the same as `docs/tactics-plan.md`.

1. **Keep the notes.** Read the PGN comments (chess.js 1.4 `getComments()`) before `cleanPgn` removes them. Attach each note to its ply.
2. **MultiPV candidates.** Read MultiPV lines 1–3 at each key moment and at each move with a note. Add `go searchmoves` for the moves that a note names.
3. **Fact layer v1.** "Stops guarding", the opponent's best reply and what it covers, idle and working pieces. Near-miss tests for each detector.
4. **Note checker v1.** The claim types "own plan", "unlikely" and "protect first". Test it on the notes in your own daily games.
5. **Templates, verdict and habits.** Show them in the feedback box after each puzzle. Then add the whole-game summary.
6. **More claim types and detectors**, in order of how often they appear in your notes.

## Open questions

- How do notes get into the app? From chess.com PGN comments, from a text box for each move, or both?
- Should moments with a note but no blunder also become review cards (the Claude review has some), or only puzzles?
- What eval margins should the verdict use, and should they change with the rating?
- Is the template text varied enough after 20 games? If not, see Appendix A.

---

## Appendix A: in-browser SLM study (later option)

This study is kept for later. It answers this question: can a small language model, fine-tuned for chess and run on the CPU, write the review text? **Short answer: yes, it can write text from a fact card, but it cannot find the chess ideas.** It needs the same fact layer as the plan above. Use it only if templates are not good enough.

### A.1 Research

Items marked *preprint* are recent and not peer reviewed. We did not read every paper in full.

**Small models cannot read the board.**

- [ChessQA](https://arxiv.org/abs/2510.23948) (Oct 2025): the best model is GPT-5 with thinking, at 79%. The main error is a wrong reading of the board from the FEN. A piece list helps by 7 to 9 points.
- [Chess-R1](https://arxiv.org/abs/2507.00726) (Jul 2025): RL does not fix missing chess knowledge in base LLMs.
- [C1](https://arxiv.org/abs/2603.20510) (2026, *preprint*): a Qwen3-4B fine-tune goes from near 0 to 48% on puzzles. [A follow-up](https://arxiv.org/abs/2605.17565) (*preprint*) shows that a 25M character model beats it, so the puzzle scores are mostly pattern memory.

**Grounding with facts is what works.**

- [CCC, Concept-guided Chess Commentary](https://arxiv.org/abs/2410.20811) (NAACL 2025). Expert ratings of correctness for GPT-4o:
  - alone: 0.36
  - with engine data: 0.43
  - with engine data plus concept features: 0.60
- [CHSM8](https://arxiv.org/html/2610.25356v1) (Oct 2026, *preprint*): Gemma-3 labelers at 270M and 1B got a "feature card" measured from the board. Their contradiction rate against the card was 4.7 to 5.4%. After the data was cleaned, the distilled student contradicted the card in 0.5% of labels. Without the card, the result was near chance.
- [QUEEN](https://arxiv.org/abs/2610.03695) (Oct 2026, *preprint*): a Leela encoder plus SmolLM3-3B. A judge model rated its explanations only 2.76/5 for coherence, and hallucinated motifs spread through training. It is too large for the browser.

**Data.**

- [MATE](https://huggingface.co/datasets/OutFlankShu/MATE_NAACL2025_Explore-the-Reasoning-Capability-of-LLMs-in-the-Chess-Testbed) (MIT, about 1M positions): explanations from templates. It is useful as a test set for the fact layer.
- Lichess games, puzzles (6.2M, with theme tags) and evaluations (416M positions, MultiPV) are all CC0. The puzzle themes can also test the tactics checker.
- The GameKnot commentary (Jhamtani 2018) and ChessGPT's annotated PGNs have no clear license. Do not use them.
- [Maia-2](https://github.com/CSSLab/maia2) (MIT) predicts what a player of a given rating plays. It can give facts such as "most 1000 players play Rfb8 here", for templates too. We did not check if it can run in the browser.

### A.2 Experiment: small models in Chromium on the CPU

**Setup.**

- Machine: a 16-thread laptop CPU under WSL2, headless Chromium (Playwright).
- Prompt: the 18...Rfb8 moment as a fact card (524 Qwen3 tokens).
- Output: up to 300 tokens of JSON.
- Models: no fine-tune.
- Repeats: one run per row, so the numbers are rough (±20%).
- You can run the harness again. It is in `docs/experiments/slm-bench/`.

| Runtime | Model, quant | Size | Threads | Prefill (524 tok) | Decode |
| --- | --- | --- | --- | --- | --- |
| Transformers.js 4.3 | SmolLM2-360M q4 | 388 MB | 1 | 47 s | 0.8 tok/s |
| Transformers.js 4.3 | SmolLM2-360M int8 | 365 MB | 1 | 34 s | 4.1 tok/s |
| Transformers.js 4.3 | SmolLM2-360M int8 | 365 MB | 8 | **7.3 s** | 7.7 tok/s |
| Transformers.js 4.3 | Qwen3-0.6B int8 | 618 MB | 8 | 13.3 s | 3.2 tok/s |
| wllama 3.8 | Qwen3-0.6B Q4_K_M | 397 MB | 8 | 34 s | **9.2 tok/s** |
| wllama 3.8 | Qwen3-0.6B Q4_0 | 382 MB | 8 | 31 s | 6.7 tok/s |
| wllama 3.8 | Qwen3-0.6B Q8_0 | 639 MB | 8 | 18 s | 6.9 tok/s |
| wllama 3.8 | Qwen3-0.6B Q8_0 | 639 MB | 1 | 144 s | 1.5 tok/s |
| wllama 3.8 | Qwen3-0.6B Q8_0 | 639 MB | 16 | 25 s | 0.3 tok/s |
| wllama 3.8 | Qwen3-1.7B Q4_K_M | 1107 MB | 8 | 46 s | 4.5 tok/s |

What the numbers show:

- **Threads are necessary.** One thread is 4 to 8 times slower. GitHub Pages cannot send COOP/COEP headers, so the page needs [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker). Our test server sent the same headers that coi-serviceworker adds (COEP `credentialless`), and the files still loaded from jsDelivr and Hugging Face. We did not test the service worker itself, or Safari. The same change would also let Stockfish use threads.
- **Do not use all the cores.** At 16 threads, decode fell to 0.3 tok/s. Use about half of `navigator.hardwareConcurrency`. The model and Stockfish must not run at the same time.
- **On WASM, 8-bit is faster than 4-bit** for prefill. Q4 saves download size, not time.
- **Time for each moment** (0.6B, 8 threads): 25 to 60 s. A game with 8 moments takes 3 to 8 minutes. A compact card of 200 to 300 tokens can cut this by about half.
- **The 1.7B model is too slow for the CPU.** It is an option only for WebGPU (published numbers: 40 to 60 tok/s). We did not measure WebGPU.

**Quality with no fine-tune (same prompt).**

| Model | Output |
| --- | --- |
| SmolLM2-360M | Copied the candidate list. It changed "f8 rook" to "a8 rook". No JSON. |
| Qwen3-0.6B (ONNX) | Valid JSON. Every "right" point was "19.Bd3". It invented "19.Nc3". |
| Qwen3-0.6B (wllama, JSON schema) | Verdict "right" (wrong). It listed the best move, Rab8, as "wrong". |
| Qwen3-1.7B (wllama, JSON schema) | Verdict "partial" (correct). The habit had the correct main idea. It listed Ne4 as "right". |

The JSON-schema mode of wllama always gave valid JSON, but the content was not reliable. A fine-tune is necessary, and code must decide the verdict.

### A.3 Design if we add a model

The model replaces only the template step. It gets the fact card as compact text, and it writes `{ right[], wrong[], why, habit }` under a JSON schema. An output checker rejects any text that names a move, square, piece or eval that is not in the card. If the check fails, the model tries once more, and then the page uses the template text. The templates stay as the fallback, and they are the baseline that a model must beat.

### A.4 Training data

We will not use Claude as the teacher. Its Usage Policy forbids training a model on its outputs without prior authorization.

1. **Positions:** key moments from Lichess games (CC0) at 800 to 1600 rating, plus Lichess puzzles.
2. **Notes (synthetic):** code selects claims from the engine facts, some false on purpose. A teacher model writes them as a 1000 player's note. Because code selects the claims, we know which claims are true.
3. **Fact cards:** the fact layer in Node, with native Stockfish.
4. **Target text:** an open-weight teacher, DeepSeek-V3.x (MIT; its license allows distillation) or Qwen3-235B (Apache-2.0). Run it on rented GPUs, or use a host whose terms allow training on the outputs. The template output can also be a training target, with the teacher only rewriting it.
5. **Filter:** the output checker removes any example with a fact that is not in the card.
6. **Size:** 20k to 50k examples. Keep your own annotated games as a separate test set.

### A.5 Cost

| Step | Estimate |
| --- | --- |
| Teacher text, 50k × about 400 output tokens | a few hours to one day on a rented 8-GPU node (rough) |
| Full fine-tune of Qwen3-0.6B, 3 epochs | about 1 to 2 hours on the RTX 5090 (6·N·T ≈ 1.4e17 FLOPs per epoch; fits in 32 GB) |
| Qwen3-1.7B | about 3 to 6 hours on the 5090 |
| Export | minutes: GGUF Q8_0 split into ≤512 MB files (wllama), or ONNX int8 (Transformers.js). Test the exported file. |

### A.6 Licenses

| Item | License | Risk |
| --- | --- | --- |
| Lichess data | CC0 | Low |
| Qwen3, SmolLM2 (student) | Apache-2.0 | Low. Keep the LICENSE and NOTICE with the weights. |
| Gemma 3 (student) | Gemma Terms; restrictions pass on to derivatives | Medium. Avoid it. |
| DeepSeek, Qwen (teacher) | MIT, Apache-2.0 | Low. Check the terms of the host if you use an API. |
| Claude, OpenAI (teacher) | Terms restrict training on outputs | Not used |
| Stockfish output as training data | GPL FAQ: program output is not covered in general; Lichess publishes Stockfish evals as CC0 | Low to medium. There is no court ruling. |
| wllama, Transformers.js | MIT, Apache-2.0 | Low |

The weights would stay on Hugging Face, out of the repository, the same as Stockfish.

### A.7 Risks

- CPU speed on a 4-core laptop can be 2 to 3 times slower than our test.
- The download (400 to 650 MB) must be opt-in and cached.
- coi-serviceworker reloads the page once on the first visit. Safari support for COEP `credentialless` is not verified.

### A.8 Steps if we start this later

1. Freeze the fact card format (from the plan above) and write the output checker.
2. Build the data pipeline in Node. Start with 2k examples and read 100 of them by hand.
3. Fine-tune Qwen3-0.6B and SmolLM2-360M. Target a contradiction rate below 1%. Run a blind comparison against the templates on your own games.
4. Add it to the browser only if it wins: a Web Worker, coi-serviceworker, an opt-in download, the output checker and the template fallback.

## Sources

- Research: ChessQA <https://arxiv.org/abs/2510.23948>; Chess-R1 <https://arxiv.org/abs/2507.00726>; C1 <https://arxiv.org/abs/2603.20510>; memorization study <https://arxiv.org/abs/2605.17565>; CCC <https://arxiv.org/abs/2410.20811>; CHSM8 <https://arxiv.org/html/2610.25356v1>; QUEEN <https://arxiv.org/abs/2610.03695>; MATE <https://arxiv.org/abs/2411.06655>; Maia-2 <https://github.com/CSSLab/maia2>.
- Data: Lichess database <https://database.lichess.org/>.
- Runtimes: wllama <https://github.com/ngxson/wllama>; Transformers.js <https://github.com/huggingface/transformers.js>; coi-serviceworker <https://github.com/gzuidhof/coi-serviceworker>; WebGPU support <https://web.dev/blog/webgpu-supported-major-browsers>.
- Terms: Anthropic Usage Policy <https://www.anthropic.com/legal/aup>; DeepSeek-R1 card <https://huggingface.co/deepseek-ai/DeepSeek-R1>; Gemma terms <https://ai.google.dev/gemma/terms>; GPL FAQ <https://www.gnu.org/licenses/gpl-faq.html#WhatCaseIsOutputGPL>.
