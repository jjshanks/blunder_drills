# Blunder Drills: Can a Small Chess Model Write the Game Review in the Browser?

Written 2026-10-31. This is a feasibility study. It does not change the code.

## The question

A game review by Claude of one daily game gives, for each key moment:

- the engine candidates, with evals and lines,
- a verdict on the player's own in-game note (right, partly right, missed),
- "what you got right" and "what you got wrong" bullets,
- one habit to build,
- and a whole-game summary (what you do well, three habits).

Blunder Drills runs only in the browser on GitHub Pages. Can a small language model (SLM), fine-tuned for chess and run on the CPU, give similar results? We assume we can make or find training data.

## Short answer

**Yes, with limits.** A small model can write the text. It cannot find the chess ideas.

1. **The model must not do chess.** Small models cannot read a position from a FEN (see "Research"). Untuned 0.6B and 1.7B models in our test put the best move in the "wrong" list and invented moves. All chess facts must come from code: Stockfish, the tactics checker and new feature detectors. The model only selects facts from a "fact card" and puts them into words.
2. **Most of the work is in the fact layer, not in the model.** The good parts of the Claude review are facts that we can compute. One example: "the a8 rook had no job, the f8 rook guarded the kingside". Another: "you attacked the bishop, so Bd3 was its natural square, and Bd3 covers e4". If we do not compute such facts, no small model will say them.
3. **The verdict must come from code.** Code checks the claims in the player's note against the engine. The model explains the verdict. It does not decide it.
4. **The CPU cost is high but usable.** Measured in Chromium: a 0.6B model takes about 25 to 45 s for each moment with 8 WASM threads. On one thread it takes more than 3 minutes. Threads need cross-origin isolation, so GitHub Pages needs [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker). The model download is 400 to 650 MB, one time.
5. **Training is cheap; data quality is the hard part.** A full fine-tune of a 0.6B model on 50k examples takes less than an hour per epoch on the RTX 5090. The real work is to make teacher data that is true, and a checker that rejects false outputs.

**Recommendation:** Build the fact layer and the note checker first, with template text. That gives most of the value with no download, and every later step needs it. Then train a 0.6B verbalizer and compare it against the templates. Ship it only if it wins in a blind test and does not invent facts. Details are in "Order of work".

## What the Claude review does

We divide the 18...Rfb8 moment of the review into parts, and we show where each part can come from in the browser.

| Part of the review | Example | Source in the browser | Exists today? |
| --- | --- | --- | --- |
| Candidates, evals, lines | Rab8 +6.0, Nxa6 +5.7, Rfb8 +5.3, Ne4 +1.8 | Stockfish multi-PV | Partly. Stockfish supports MultiPV, but the UCI parser reads only line 1 (`index.html:378`). |
| "Protect first was right" | Ne4 at once drops to +1.8 | Compare the eval of a move in the note with the best eval | No (note parser) |
| "'White won't play Bd3' was the real miss" | Bd3 is White's best reply | Note claim "X unlikely" + the engine's best reply | No (note parser) |
| "Bd3 covers e4, the fork square" | | Attack map after the reply + the square named in the note | No (feature) |
| "The a8 rook had no job" | | Piece-role features: what each piece attacks and defends | No (feature) |
| "f8 rook guards the f-file where f4–f5 is coming" | | Engine PV for the opponent + piece roles | No (feature) |
| Named tactics | knight fork, back-rank mate | `findTactics` | Yes |
| Habit | "Plan against the best reply" | A fixed list of mistake types → habit | No (taxonomy) |
| Whole-game summary | three habits | Count mistake types over all moments | No |

Most rows are facts that code can compute. The model is useful for two jobs: it selects the 2 or 3 facts that matter most, and it writes them as clear, kind text for a 1000-rated player.

## Research

The full reports are summarized here. Items marked *preprint* are recent and not peer reviewed. We did not read every paper in full.

**Small models cannot read the board.**

- [ChessQA](https://arxiv.org/abs/2510.23948) (Oct 2025): the best model is GPT-5 with thinking, at 79%. The main error is a wrong reading of the board from the FEN. A piece list helps by 7 to 9 points.
- [Chess-R1](https://arxiv.org/abs/2507.00726) (Jul 2025): RL does not fix missing chess knowledge in base LLMs.
- [C1](https://arxiv.org/abs/2603.20510) (2026, *preprint*): a Qwen3-4B fine-tune goes from near 0 to 48% on puzzles. [A follow-up](https://arxiv.org/abs/2605.17565) (*preprint*) shows that a 25M character model beats it, so the puzzle scores are mostly pattern memory.

**Grounding with facts is what works.**

- [CCC, Concept-guided Chess Commentary](https://arxiv.org/abs/2410.20811) (NAACL 2025). Expert ratings of correctness for GPT-4o:
  - alone: 0.36
  - with engine data: 0.43
  - with engine data plus concept features: 0.60
  
  Engine numbers alone help only a little. Explicit features help a lot.
- [CHSM8](https://arxiv.org/html/2610.25356v1) (Oct 2026, *preprint*) is the closest evidence for our size. Gemma-3 labelers at 270M and 1B got a "feature card" measured from the board. Their contradiction rate against the card was 4.7 to 5.4%. After the data was cleaned, the distilled student contradicted the card in 0.5% of labels. Without the card, the result was near chance. A 70B labeler with no fine-tune contradicted the card in 16.5%.
- [QUEEN](https://arxiv.org/abs/2610.03695) (Oct 2026, *preprint*): a Leela encoder plus SmolLM3-3B. It plays well, but a judge model rated its explanations only 2.76/5 for coherence. The authors say hallucinated motifs spread through training. It is too large for the browser.

**Data with commentary text.**

- [MATE](https://huggingface.co/datasets/OutFlankShu/MATE_NAACL2025_Explore-the-Reasoning-Capability-of-LLMs-in-the-Chess-Testbed) (MIT, about 1M positions): explanations from templates, and a choice between two moves only. It is useful for the fact layer, not for style.
- The GameKnot commentary (Jhamtani 2018) and ChessGPT's annotated PGNs have no clear license. Do not use them.
- Lichess games, puzzles (6.2M, with theme tags) and evaluations (416M positions, multi-PV) are all CC0.

**Human-like moves.** [Maia-2](https://github.com/CSSLab/maia2) (MIT) predicts what a player of a given rating plays. It can supply facts such as "most 1000 players play Rfb8 here". We did not check if it can run in the browser.

## Experiment: small models in Chromium on the CPU

**Setup.**

- Machine: a 16-thread laptop CPU under WSL2, headless Chromium (Playwright).
- Prompt: the 18...Rfb8 moment, written as a fact card (524 Qwen3 tokens, `docs/experiments/slm-bench/prompt.json`).
- Output: up to 300 tokens of JSON.
- Models: no fine-tune.
- Repeats: one run per row, so treat the numbers as rough (±20%).
- You can run the harness again. It is in `docs/experiments/slm-bench/`.

### Speed

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

- **Threads are necessary.** One thread is 4 to 8 times slower. GitHub Pages cannot send the COOP/COEP headers, so the page needs coi-serviceworker. Our `iso` server sent the same headers that coi-serviceworker adds (COEP `credentialless`), and the model, the runtime and the wasm still loaded from jsDelivr and Hugging Face. We did not test the service worker itself, or Safari.
- **Do not use all the cores.** At 16 threads, decode fell to 0.3 tok/s. Use about half of `navigator.hardwareConcurrency`. Stockfish also needs CPU, so the coach and the engine must not run at the same time.
- **On WASM, 8-bit is faster than 4-bit** for prefill. Q4 saves download size, not time.
- **Prefill is the largest cost.** A fine-tuned model can learn a compact card format of about 200 to 300 tokens. That cuts prefill by half or more.
- **Time for each moment, with a 0.6B model and 8 threads:** about 13 to 18 s of prefill, plus 150 output tokens at 3 to 9 tok/s. That is 25 to 60 s in total. A game with 8 moments takes 3 to 8 minutes. With a compact card and a faster runtime, it is about 2 to 4 minutes. This is acceptable only as a background job that shows each moment as it finishes.
- **The 1.7B model is too slow for the CPU.** It is an option only for WebGPU. Published browser numbers give 40 to 60 tok/s on WebGPU for models of this size. We did not measure WebGPU here.

### Quality with no fine-tune (same prompt)

| Model | Output |
| --- | --- |
| SmolLM2-360M | Copied the candidate list. It changed "f8 rook" to "a8 rook". No JSON. |
| Qwen3-0.6B (ONNX) | Valid JSON. Every "right" point was "19.Bd3". It invented "19.Nc3". |
| Qwen3-0.6B (wllama, JSON schema) | Verdict "right" (wrong). It listed the best move, Rab8, as "wrong". |
| Qwen3-1.7B (wllama, JSON schema) | Verdict "partial" (correct). The habit text had the correct main idea ("protect b2 before the fork"). It listed Ne4 as "right". |

The JSON-schema mode of wllama always gave valid JSON. The content was not reliable. This agrees with the research: a fine-tune is necessary, and code must decide the verdict.

## Proposed design

```
PGN + player's notes
   │
   ▼
Stockfish (multi-PV)  ──►  key moments (exists: detectPuzzles)
   │
   ▼
Fact layer (code, no model)
   • candidates, evals, eval drops
   • tactics (exists: findTactics)
   • piece roles: idle piece, sole defender, what a move stops guarding
   • open files, king squares, opponent's best reply and what it attacks
   • note checker: moves and squares in the note → claims → true/false
   • mistake type → habit (fixed list)
   │
   ▼
Fact card (compact text, about 200–300 tokens, verdict included)
   │
   ├──► Templates (always available, no download)
   │
   └──► SLM verbalizer (optional, 0.6B, Web Worker)
            JSON schema: { right[], wrong[], why, habit }
            │
            ▼
        Output checker: every move, square, piece and eval in the
        text must be in the card. If not: retry once, then use the template.
```

**Fact layer.** This extends the tactics checker. The same rules apply: it computes facts only from chess.js and engine data, it must not give false reports, and it has near-miss tests. New detectors in order of value:

1. Note checker. It extracts SAN moves and squares from the note text. It matches phrases such as "unlikely", "need to protect first" and "fork" to claims, and it checks each claim against the engine.
2. "Stops guarding": the pieces and squares that a moved piece defended before the move.
3. Idle and working pieces: pieces that attack or defend nothing important.
4. The opponent's best reply, and what it attacks or blocks.
5. Open files after a capture, and the squares around an exposed king.

**Verdict rule (code).** "right" if the played move is within a small eval margin of the best move, and the note has no false claim that matters. "partial" if the move or the note is near the best but has one important false claim. "missed" if the best idea is not in the move and not in the note. The exact margins are an open question.

**Model job.** Select the 1 to 3 strongest facts for each bullet list, explain them simply, and pick or adapt the habit. The model must not add a fact that is not in the card.

## Training data

We will not use Claude as the teacher. Its Usage Policy forbids training a model on its outputs without prior authorization.

1. **Positions.** Take key moments from Lichess games (CC0) at 800 to 1600 rating, with the same detector that the app uses. Add positions from the Lichess puzzles with theme tags (CC0).
2. **Player notes (synthetic).** Real in-game notes are rare. A teacher model writes a note for each position from a list of claims, as a 1000 player would write it. Code selects the claims from the engine facts, and some claims are false on purpose (for example "Bd3 is unlikely" when Bd3 is the best reply). Because code selects the claims, we know which claims are true.
3. **Fact cards.** The fact layer in Node, with native Stockfish, makes the card and the verdict.
4. **Target text.** An open-weight teacher writes the JSON output from the card. Candidates are DeepSeek-V3.x (MIT; its license allows distillation) or Qwen3-235B (Apache-2.0). Run it on rented GPUs, or use a host whose terms allow training on the outputs.
5. **Filter.** The output checker removes any example that names a move, square or number that is not in the card. CHSM8 reports that this cleaning step brought contradictions down from about 5% to 0.5%.
6. **Size.** 20k to 50k examples. Keep 1k as a test set. Add your own annotated daily games as a separate test set, and never use them for training.

## Training cost

| Step | Estimate | Notes |
| --- | --- | --- |
| Teacher text, 50k examples × about 400 output tokens | a few hours to one day on a rented 8-GPU node | Rough estimate; it depends on the teacher and on vLLM throughput |
| Full fine-tune of Qwen3-0.6B, 50k × 800 tokens, 3 epochs | about 1 to 2 hours on the RTX 5090 | 6·N·T ≈ 1.4e17 FLOPs per epoch. It fits in 32 GB. |
| Same for Qwen3-1.7B (LoRA or full) | about 3 to 6 hours on the 5090 | Only for the WebGPU option |
| Export | minutes | llama.cpp `convert_hf_to_gguf.py` → Q8_0 → split into ≤512 MB files. Or `optimum` → ONNX int8. Test the exported file, because export can lower quality. |

## Licenses

| Item | License | Risk |
| --- | --- | --- |
| Lichess games, puzzles, evals | CC0 | Low |
| Qwen3-0.6B / 1.7B (student) | Apache-2.0 | Low. Keep the LICENSE and NOTICE with the weights. |
| SmolLM2 (student) | Apache-2.0 | Low |
| Gemma 3 (student) | Gemma Terms. The use restrictions pass on to derivatives. | Medium. Avoid it. |
| LFM2 (student) | LFM Open License. It has a revenue limit. | Low for a hobby project |
| DeepSeek / Qwen (teacher) | MIT / Apache-2.0 | Low. Check the terms of the host if you use an API. |
| Claude, OpenAI (teacher) | Their terms restrict training on outputs | Not used |
| Stockfish output as training data | GPL FAQ: the output of a program is not covered in general. Lichess publishes its Stockfish evals as CC0. | Low to medium. There is no court ruling. |
| wllama | MIT | Low |

The weights stay on Hugging Face, out of the repository, the same as Stockfish.

## Risks and open questions

- **The fact layer is the hard part.** If the detectors are weak, the model has nothing good to say. This is the same false-report problem as the tactics checker, with more detectors.
- **CPU speed on typical laptops.** We measured on one 16-thread laptop. A 4-core laptop can be 2 to 3 times slower. Measure on a low-end machine before committing.
- **Download size.** 400 to 650 MB is a lot for a hobby page. The download must be opt-in ("Download the coach, 640 MB"), and cached.
- **coi-serviceworker.** It reloads the page once on the first visit. Safari support for COEP `credentialless` is not verified. We did not test it under the service worker.
- **Note language.** Real notes are informal ("i think the rook gos to b1"). The note checker must accept bad spelling and lowercase SAN. A small model could do this extraction job too, but that is a second model call.
- **Can templates be enough?** A good fact card with templates may give 80% of the value. Measure this before the SLM work. It is the cheapest result to ship.
- **Open:** Should the whole-game summary use the model, or only counts of mistake types with fixed text?
- **Open:** Is WebGPU common enough among your users to target the 1.7B model there?

## Order of work

Each step is useful by itself. Stop at any step if the result is good enough.

1. **Fact layer v1 + note checker + templates** (no model). Multi-PV candidates at each key moment. The note checker. The "stops guarding" and "best reply" detectors. A verdict rule. Template bullets and habits. Near-miss tests as in `docs/tactics-plan.md`.
2. **Card format + output checker.** Freeze a compact text card and the JSON schema. Write the checker that rejects invented moves, squares and numbers.
3. **Data pipeline in Node.** Lichess positions → native Stockfish → fact card → synthetic note → open-weight teacher → filter. Start with 2k examples and read 100 of them by hand.
4. **Train and compare.** Fine-tune Qwen3-0.6B and SmolLM2-360M on the 5090. Measure the contradiction rate (target < 1%), and run a blind comparison against the templates on your own games.
5. **Browser integration** only if step 4 wins. Add wllama (or Transformers.js for faster prefill) in a Web Worker, coi-serviceworker, an opt-in download, the output checker and the template fallback.

## Sources

- Research: ChessQA <https://arxiv.org/abs/2510.23948>; Chess-R1 <https://arxiv.org/abs/2507.00726>; C1 <https://arxiv.org/abs/2603.20510>; memorization study <https://arxiv.org/abs/2605.17565>; CCC <https://arxiv.org/abs/2410.20811>; CHSM8 <https://arxiv.org/html/2610.25356v1>; QUEEN <https://arxiv.org/abs/2610.03695>; MATE <https://arxiv.org/abs/2411.06655>; searchless chess <https://github.com/google-deepmind/searchless_chess>; Maia-2 <https://github.com/CSSLab/maia2>.
- Data: Lichess database <https://database.lichess.org/>.
- Runtimes: wllama <https://github.com/ngxson/wllama>; Transformers.js <https://github.com/huggingface/transformers.js>; coi-serviceworker <https://github.com/gzuidhof/coi-serviceworker>; WebGPU support <https://web.dev/blog/webgpu-supported-major-browsers>.
- Terms: Anthropic Usage Policy <https://www.anthropic.com/legal/aup>; DeepSeek-R1 card <https://huggingface.co/deepseek-ai/DeepSeek-R1>; Gemma terms <https://ai.google.dev/gemma/terms>; GPL FAQ on program output <https://www.gnu.org/licenses/gpl-faq.html#WhatCaseIsOutputGPL>.
