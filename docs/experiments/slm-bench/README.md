# Browser SLM benchmark

This harness measures how fast a small language model runs in Chromium on the CPU (WASM). It also shows the raw output of the model for one coaching prompt. The results are in `docs/coach-slm-feasibility.md`.

- `prompt.json`: the test prompt. It is the 18...Rfb8 moment from a real game review, written as a fact card (524 Qwen3 tokens).
- `page.html` + `bench.mjs`: Transformers.js 4.3.2 (ONNX Runtime Web, WASM).
- `wpage.html` + `wbench.mjs`: wllama 3.8.1 (llama.cpp WASM, GGUF), CPU only (`n_gpu_layers: 0`).
- `serve.mjs`: serves the pages in two modes.
  - `plain` (port 8810) sends no headers, the same as GitHub Pages.
  - `iso` (port 8811) sends COOP and COEP `credentialless`, the same as coi-serviceworker. With these headers, WASM can use threads.

## Run

Run from the repository root. The scripts use the Playwright that `npm install` gives.

```sh
node docs/experiments/slm-bench/serve.mjs plain &
node docs/experiments/slm-bench/serve.mjs iso &

# Transformers.js: model, dtype, plain|iso, threads
node docs/experiments/slm-bench/bench.mjs onnx-community/Qwen3-0.6B-ONNX int8 iso 8

# wllama: repo, file, plain|iso, threads, [schema]
node docs/experiments/slm-bench/wbench.mjs unsloth/Qwen3-0.6B-GGUF Qwen3-0.6B-Q8_0.gguf iso 8 schema
```

The first run of each model downloads it (0.4 to 1.1 GB) into `profile/`. Git ignores that folder. Each port is a different origin, so each port has its own cache.
