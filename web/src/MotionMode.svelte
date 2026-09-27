<script lang="ts">
    import { onDestroy } from 'svelte';
    import { appState } from './lib/state.svelte.js';
    import { motionState, type MotionViewKind } from './lib/motion/motion-state.svelte.js';
    import { prepareFrames, runSearch, compareAlgorithms } from './lib/motion/controller.js';
    import { readMotionView, MotionView } from './lib/motion/me-bridge.js';
    import { defaultScenario, type ScenarioKind } from './lib/motion/synthetic.js';
    import { blockVerdict } from './lib/motion/metrics.js';
    import {
        drawVectorField, drawBlockFill, drawBlockOutline, sadHeatColor, VERDICT_COLORS,
    } from './lib/motion/mv-render.js';
    import ImageViewer from './lib/components/ImageViewer.svelte';
    import ScenarioControls from './lib/components/motion/ScenarioControls.svelte';
    import SearchControls from './lib/components/motion/SearchControls.svelte';
    import OverlayControls from './lib/components/motion/OverlayControls.svelte';
    import MotionMetrics from './lib/components/motion/MotionMetrics.svelte';
    import BlockSearchPanel from './lib/components/motion/BlockSearchPanel.svelte';

    const SCENARIOS: { kind: ScenarioKind; label: string }[] = [
        { kind: 'pan', label: 'Camera pan' },
        { kind: 'zoom', label: 'Zoom' },
        { kind: 'rotate', label: 'Rotation' },
        { kind: 'object', label: 'Moving object' },
    ];

    const VIEWS: { kind: MotionViewKind; label: string; caption: string }[] = [
        { kind: 'reference', label: 'Reference',
          caption: 'Frame 1: the frame the decoder already has.' },
        { kind: 'current', label: 'Current',
          caption: 'Frame 2: the frame we want to send.' },
        { kind: 'prediction', label: 'Prediction',
          caption: 'Frame 2 rebuilt only from blocks copied out of frame 1 along the motion vectors. Apart from the vectors, this costs nothing to send.' },
        { kind: 'residual', label: 'Residual',
          caption: 'Current minus prediction (grey = no error). This is what the encoder still has to code: the flatter it is, the fewer bits.' },
        { kind: 'difference', label: 'No MC',
          caption: 'Current minus reference without motion compensation, for comparison: everything that moved shows up as error.' },
    ];

    // Overlay canvas is drawn at a multiple of the image resolution so arrows
    // stay crisp when zoomed.
    const OVERLAY_SCALE = 2;
    const RUN_DEBOUNCE_MS = 120;
    const ZOOM_LEVEL = 3;

    let currentCanvas: HTMLCanvasElement | undefined = $state();
    let viewCanvas: HTMLCanvasElement | undefined = $state();
    let overlayCanvas: HTMLCanvasElement | undefined = $state();

    let isZoomMode = $state(false);
    let zoom = $state(1);
    let zoomOriginX = $state(50);
    let zoomOriginY = $state(50);

    let jobId = 0;
    let runTimer: ReturnType<typeof setTimeout> | null = null;
    let needFrames = true;

    const activeView = $derived(VIEWS.find((v) => v.kind === motionState.view) ?? VIEWS[3]);

    // ===== Pipeline =====

    function scheduleRun(regenerateFrames: boolean): void {
        if (regenerateFrames) needFrames = true;
        motionState.computing = true;
        const id = ++jobId;
        if (runTimer) clearTimeout(runTimer);
        runTimer = setTimeout(() => {
            runTimer = null;
            if (id === jobId) execute();
        }, RUN_DEBOUNCE_MS);
    }

    function execute(): void {
        try {
            const image = appState.originalImageData;
            if (!appState.wasmReady || !image) return;
            const scenario = $state.snapshot(motionState.scenario);

            if (needFrames || !motionState.frames) {
                const frames = prepareFrames(image, scenario);
                if (!frames) {
                    motionState.error = 'Could not load the frame pair into the motion estimator.';
                    return;
                }
                motionState.frames = frames;
                needFrames = false;
            }

            const run = runSearch(motionState.frames, scenario, {
                blockSize: motionState.blockSize,
                searchRange: motionState.searchRange,
                algorithm: motionState.algorithm,
            });
            motionState.run = run;
            motionState.comparison = null;
            motionState.error = run ? '' : 'Motion search rejected these parameters.';
        } finally {
            motionState.computing = false;
        }
    }

    function onCompare(): void {
        const frames = motionState.frames;
        if (!frames || motionState.comparing) return;
        motionState.comparing = true;
        // Let "Comparing…" paint before the synchronous searches.
        setTimeout(() => {
            try {
                motionState.comparison = compareAlgorithms(frames, $state.snapshot(motionState.scenario), {
                    blockSize: motionState.blockSize,
                    searchRange: motionState.searchRange,
                    algorithm: motionState.algorithm,
                });
            } finally {
                motionState.comparing = false;
            }
        }, 0);
    }

    // New image or scenario: rebuild the frame pair, then search.
    $effect(() => {
        const _image = appState.originalImageData;
        const _scenario = JSON.stringify(motionState.scenario);
        scheduleRun(true);
    });

    // Search parameters: same frames, new search.
    $effect(() => {
        const _params = [motionState.blockSize, motionState.searchRange, motionState.algorithm];
        scheduleRun(false);
    });

    onDestroy(() => {
        jobId++;
        if (runTimer) clearTimeout(runTimer);
        motionState.computing = false;
    });

    // ===== Drawing =====

    function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): void {
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
    }

    // Base canvases: current frame (left of the comparison) and the selected view.
    $effect(() => {
        const frames = motionState.frames;
        const run = motionState.run;
        const view = motionState.view;
        if (!frames || !currentCanvas || !viewCanvas) return;

        const { width, height } = frames.current;
        sizeCanvas(currentCanvas, width, height);
        sizeCanvas(viewCanvas, width, height);
        currentCanvas.getContext('2d')?.putImageData(frames.current, 0, 0);

        const ctx = viewCanvas.getContext('2d');
        if (!ctx) return;
        if (view === 'reference') {
            ctx.putImageData(frames.reference, 0, 0);
        } else if (view === 'current') {
            ctx.putImageData(frames.current, 0, 0);
        } else if (run) {
            const kind = view === 'prediction' ? MotionView.Prediction
                : view === 'residual' ? MotionView.Residual : MotionView.FrameDifference;
            const out = new ImageData(width, height);
            if (readMotionView(kind, out)) ctx.putImageData(out, 0, 0);
        }
    });

    // Overlay: accuracy / cost fills, then vectors on top.
    $effect(() => {
        const run = motionState.run;
        const frames = motionState.frames;
        const showVectors = motionState.showVectors;
        const showCost = motionState.showCost;
        const showAccuracy = motionState.showAccuracy;
        const selected = motionState.selectedBlock;
        if (!overlayCanvas || !frames) return;

        sizeCanvas(overlayCanvas, frames.current.width * OVERLAY_SCALE, frames.current.height * OVERLAY_SCALE);
        const ctx = overlayCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        if (!run) return;

        const { grid, mvs, truths } = run;
        if (showCost) {
            const area = grid.blockSize * grid.blockSize;
            const maxMad = mvs.reduce((m, mv) => Math.max(m, mv.sad / area), 0);
            drawBlockFill(ctx, grid, OVERLAY_SCALE, (i) => sadHeatColor(mvs[i], grid.blockSize, maxMad));
        }
        if (showAccuracy) {
            drawBlockFill(ctx, grid, OVERLAY_SCALE, (i) => VERDICT_COLORS[blockVerdict(mvs[i], truths[i])]);
            drawExcludedHatching(ctx, run);
        }
        if (showVectors) {
            const maxLength = mvs.reduce((m, mv) => Math.max(m, Math.hypot(mv.dx, mv.dy)), 0);
            drawVectorField(ctx, grid, mvs, OVERLAY_SCALE, maxLength);
        }
        if (selected && selected.col < grid.cols && selected.row < grid.rows) {
            // Selected block (solid) and the reference block it is predicted from (dashed).
            const mv = mvs[selected.row * grid.cols + selected.col];
            const x = selected.col * grid.blockSize;
            const y = selected.row * grid.blockSize;
            drawBlockOutline(ctx, x + mv.dx, y + mv.dy, grid.blockSize, OVERLAY_SCALE, '#22c55e', true);
            drawBlockOutline(ctx, x, y, grid.blockSize, OVERLAY_SCALE, '#facc15');
        }
    });

    // Drop a selection that no longer fits the grid (e.g. after a block size change).
    $effect(() => {
        const run = motionState.run;
        const sel = motionState.selectedBlock;
        if (run && sel && (sel.col >= run.grid.cols || sel.row >= run.grid.rows)) {
            motionState.selectedBlock = null;
        }
    });

    function drawExcludedHatching(ctx: CanvasRenderingContext2D, run: NonNullable<typeof motionState.run>): void {
        const size = run.grid.blockSize * OVERLAY_SCALE;
        ctx.save();
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
        ctx.lineWidth = OVERLAY_SCALE;
        for (let i = 0; i < run.truths.length; i++) {
            if (!run.truths[i].excluded) continue;
            const x = (i % run.grid.cols) * size;
            const y = Math.floor(i / run.grid.cols) * size;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, size, size);
            ctx.clip();
            ctx.beginPath();
            for (let d = -size; d < size; d += 5 * OVERLAY_SCALE) {
                ctx.moveTo(x + d, y + size);
                ctx.lineTo(x + d + size, y);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }

    // ===== UI actions =====

    function setScenario(kind: ScenarioKind): void {
        if (motionState.scenario.kind === kind) return;
        const noise = motionState.scenario.noise;
        motionState.scenario = { ...defaultScenario(kind), noise };
    }

    function onBack(): void {
        appState.appMode = 'viewer';
    }

    function onViewerClick(e: MouseEvent): void {
        if (!viewCanvas) return;
        if (!isZoomMode) {
            selectBlockAt(e);
            return;
        }
        if (zoom > 1) {
            zoom = 1;
        } else {
            const rect = viewCanvas.getBoundingClientRect();
            zoomOriginX = ((e.clientX - rect.left) / rect.width) * 100;
            zoomOriginY = ((e.clientY - rect.top) / rect.height) * 100;
            zoom = ZOOM_LEVEL;
        }
    }

    function selectBlockAt(e: MouseEvent): void {
        const run = motionState.run;
        if (!run || !viewCanvas) return;
        const rect = viewCanvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * viewCanvas.width;
        const y = ((e.clientY - rect.top) / rect.height) * viewCanvas.height;
        const col = Math.floor(x / run.grid.blockSize);
        const row = Math.floor(y / run.grid.blockSize);
        if (col < 0 || row < 0 || col >= run.grid.cols || row >= run.grid.rows) return;
        motionState.selectedBlock = { col, row };
    }

    function toggleZoomMode(): void {
        isZoomMode = !isZoomMode;
        if (!isZoomMode) zoom = 1;
    }
</script>

{#snippet overlay()}
    <canvas class="me-overlay" bind:this={overlayCanvas} aria-hidden="true"></canvas>
{/snippet}

<div id="motionExplorer">
    <div class="inspector-fullpage">

        <div class="inspector-topbar">
            <button class="inspector-back-btn" onclick={onBack}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"/>
                    <polyline points="12 5 5 12 12 19"/>
                </svg>
                Back
            </button>
            <h2 class="inspector-topbar-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6"/>
                    <path d="M3 6h4M3 18h4" opacity="0.6"/>
                </svg>
                Motion Explorer
            </h2>
            <div class="mode-chips">
                {#each SCENARIOS as s}
                <button class="mode-chip" class:active={motionState.scenario.kind === s.kind}
                    onclick={() => setScenario(s.kind)}>
                    {s.label}
                </button>
                {/each}
            </div>
        </div>

        <div class="inspector-layout">
            <aside class="inspector-sidebar">
                <details class="sidebar-section sidebar-controls" open>
                    <summary class="sidebar-section-title"><span>Motion</span></summary>
                    <div class="sidebar-section-body">
                        <ScenarioControls />
                    </div>
                </details>

                <details class="sidebar-section sidebar-controls" open>
                    <summary class="sidebar-section-title"><span>Search</span></summary>
                    <div class="sidebar-section-body">
                        <SearchControls />
                    </div>
                </details>

                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span>Overlays</span></summary>
                    <div class="sidebar-section-body">
                        <OverlayControls />
                    </div>
                </details>

                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span>Metrics</span></summary>
                    <div class="sidebar-section-body">
                        <MotionMetrics {onCompare} />
                    </div>
                </details>
            </aside>

            <main class="mode-content">
                <div class="mode-toggle-row">
                    <div class="mode-view-toggle me-views">
                        {#each VIEWS as v}
                        <button class:active={motionState.view === v.kind} onclick={() => motionState.view = v.kind}>
                            {v.label}
                        </button>
                        {/each}
                    </div>
                    <div class="mode-zoom-controls">
                        <button class="zoom-ctrl-btn" class:active={motionState.compareWithCurrent}
                            onclick={() => motionState.compareWithCurrent = !motionState.compareWithCurrent}
                            title="Split view against the current frame">
                            Split
                        </button>
                        <button class="zoom-ctrl-btn" class:active={isZoomMode || zoom > 1}
                            onclick={zoom > 1 ? () => (zoom = 1) : toggleZoomMode}
                            title={zoom > 1 ? 'Reset zoom' : 'Zoom mode — click image to zoom in'}>
                            {zoom > 1 ? `${zoom}× · Reset` : isZoomMode ? 'Zoom ON' : 'Zoom'}
                        </button>
                    </div>
                </div>

                <div class="mode-viewer-wrap">
                    <ImageViewer
                        id="motion"
                        bind:originalCanvas={currentCanvas}
                        bind:processedCanvas={viewCanvas}
                        viewType={motionState.compareWithCurrent ? 'comparison' : 'processed'}
                        bind:isZoomMode
                        bind:zoom
                        bind:zoomOriginX
                        bind:zoomOriginY
                        showBlockGrid={motionState.showGrid}
                        gridSize={motionState.blockSize}
                        {overlay}
                        zoomHint="Click image to zoom in &nbsp;·&nbsp; Esc to exit"
                        onViewerClick={onViewerClick}
                    />
                </div>

                <BlockSearchPanel />

                <div class="me-caption" aria-live="polite">
                    {#if motionState.error}
                    <span class="me-error">{motionState.error}</span>
                    {:else}
                    <strong>{activeView.label}.</strong> {activeView.caption}
                    {#if motionState.compareWithCurrent}<em>Left of the split: current frame.</em>{/if}
                    {#if !motionState.selectedBlock}<em>Click a block to see how it was searched.</em>{/if}
                    {#if motionState.computing}<span class="me-busy">Estimating…</span>{/if}
                    {/if}
                </div>
            </main>
        </div>
    </div>
</div>

<style>
    .me-overlay {
        width: 100%;
        height: 100%;
        display: block;
    }

    .me-views button {
        min-width: 0;
        padding: 0.45rem 0.9rem;
    }

    .me-caption {
        flex-shrink: 0;
        max-width: 760px;
        margin: 0 auto;
        text-align: center;
        font-size: 0.76rem;
        line-height: 1.5;
        color: rgba(203, 213, 225, 0.85);
    }

    .me-caption strong {
        color: #f8fafc;
    }

    .me-caption em {
        margin-left: 4px;
        color: rgba(203, 213, 225, 0.65);
    }

    .me-busy {
        margin-left: 8px;
        color: #93c5fd;
    }

    .me-error {
        color: #fca5a5;
    }
</style>
