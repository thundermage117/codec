# Codec Explorer

An interactive lab for transform image compression (DCT vs Haar vs CDF 9/7 wavelets). A C++17 codec core is compiled to WebAssembly and driven by a Svelte 5 + TypeScript web app. Everything runs in the browser.

## Layout

- `core/` — the codec, plain C++17 with no dependencies. `inc/` headers, `src/` sources, `tests/` GoogleTest.
  - `ImageCodec` — colour conversion, chroma subsampling, 8×8 DCT or whole-image wavelet, quantization, bit estimate.
  - `wavelet`, `transform`, `entropy`, `colorspace`, `CodecAnalysis` (PSNR, SSIM, artifact maps).
- `web/cpp/codec_web.cpp` — the WASM binding layer: one global session, C functions exported to JS.
- `web/public/codec.{js,wasm}` — the **checked-in** WASM build. Edit C++, then rebuild it (below), or the app keeps running the old code.
- `web/src/` — the app.
  - `App.svelte` switches between three full-page modes: `ViewerMode`, `InspectorMode` (one 8×8 block through the pipeline), `ArtifactInspectorMode` (error, edge and blocking maps).
  - `lib/state.svelte.ts` — shared reactive state (`appState`, a Svelte 5 `$state` class).
  - `lib/wasm-bridge.ts` — typed wrappers over `Module._*` calls; `types/wasm.d.ts` declares them.
  - `lib/inspection.ts`, `lib/grid-renderer.ts`, `lib/basis-popover.ts` — the Block Inspector's imperative DOM rendering (see "Inspector DOM" below).
  - `lib/components/` — shared UI: `QualityControl`, `CodecSettings` (transform + chroma), `ResultSummary`, `ImageViewer`.
  - `styles/` — global CSS bundled through `app.css`. Colours are tokens in `variables.css`; dark mode is `[data-theme="dark"]`.
- `apps/native/` — an OpenCV desktop app for poking at the core (needs OpenCV).

## Commands

Web, from `web/`:

```bash
npm run dev          # Vite dev server
npm run check        # svelte-check (types)
npm run test         # unit tests (Vitest + jsdom, fast)
npm run test:browser # integration tests in Playwright Chromium
npm run test:all     # both
```

From the repo root:

```bash
make web       # rebuild web/public/codec.{js,wasm} (needs Emscripten 5.0.1, as pinned in CI)
make test      # C++ GoogleTest suite (CMake; configures apps/native too, so needs OpenCV)
make sanitize  # C++ tests under ASan + UBSan (falls back to UBSan where ASan can't start, e.g. macOS 26)
```

Before calling a change done, run `npm run check` and `npm run test:all` (plus `make test` for C++ changes).

## Contracts across the WASM boundary

Nothing links C++ and TypeScript at compile time, so these pairs are kept in sync by hand and **guarded by tests**:

| What | C++ side | TS side | Test |
|---|---|---|---|
| Exported functions | `WEB_EXPORTS` in `Makefile`, or `EMSCRIPTEN_KEEPALIVE` | `web/src/types/wasm.d.ts` | `tests/unit/wasm-exports.test.js` |
| View mode numbers | `enum ViewMode` in `codec_web.cpp` | `ViewMode` in `lib/state.svelte.ts` | `tests/unit/wasm-contracts.test.js` |
| Transform numbers | `map_transform_mode` in `codec_web.cpp` | `Transform` in `lib/transforms.ts` | same |
| Block buffer layout | `BlockDebugData` in `core/inc/ImageCodec.h` | `BLOCK_GRID` in `lib/inspection.ts` | same |
| Histogram bins | `CoefficientStats::NUM_BINS` | `COEFF_BINS` in `lib/wasm-bridge.ts` | same |

Change both sides together. Buffers returned by `malloc` in C++ are freed by the TS caller (see each binding's comment).

## Inspector DOM

The Block Inspector renders its grids imperatively and finds elements by ID. Those lookups skip missing elements **silently**, so:

- Refer to inspector element IDs only through `INSPECTOR_IDS` in `lib/inspector-dom.ts`, never as string literals.
- To add one: give the element an `id` in `InspectorMode.svelte` and add it to `INSPECTOR_IDS`.
- `tests/unit/inspector-dom.test.js` fails if an ID isn't rendered, or if lib code bypasses the list.

## Conventions

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`); mount with `mount()`. Use `untrack` when an effect calls code that reads state it shouldn't depend on.
- Hover help: put explanations in plain `title` attributes (SVG: a `<title>` child). `lib/hover-hint.ts` shows them quickly and styled, app-wide. Add the `has-hint` class to a text label to give it the dotted underline.
- Reuse the shared components (`QualityControl`, `CodecSettings`, `ResultSummary`) instead of copying controls into a mode.
- Tests are `.js` files that import `.ts` sources with a `.js` extension; a small Vite plugin in both Vitest configs resolves them. The WASM `Module` global is mocked in `tests/setup/`.
- `@sveltejs/vite-plugin-svelte` is pinned to `^4` because Vitest 2.1 needs Vite 5. Don't bump it alone.
- Comments explain why, not what. Match the density of the surrounding code.
- Commits: conventional style with a scope, e.g. `feat(inspector): …`, `fix(core): …`, `refactor: …`, `docs: …`. Work on a feature branch and open a PR to `main`; Vercel deploys `main`.

## Related work

Motion estimation lives on the paused `feature/motion-estimation` branch. Its bindings (`*_me_*`, `MotionEstimator.*`) are on `main` too; leave them alone unless working on that feature.
