<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade } from 'svelte/transition';
    import { appState, ViewMode } from './lib/state.svelte.js';
    import { processImage, getViewPtr, getStats, free, setArtifactGain } from './lib/wasm-bridge.js';

    let artifactCanvas: HTMLCanvasElement;
    let originalCanvas: HTMLCanvasElement;
    let artifactCtx: CanvasRenderingContext2D | null = null;
    let originalCtx: CanvasRenderingContext2D | null = null;
    let artifactImageData: ImageData | null = null;
    let rawArtifactData: Uint8Array | null = null;

    let blinkTimer: ReturnType<typeof setInterval> | null = null;
    let isBlinking = $state(false);
    let viewType = $state<'artifact' | 'original'>('artifact');
    let blinkPhase = $state<'artifact' | 'original'>('artifact');

    let qualitySliderValue = $state(appState.quality);
    let isSliderInteracting = false;

    const DEFAULT_GAIN = 5.0;
    let gainValue = $state(DEFAULT_GAIN);

    let showHeatmap = $state(true);
    let showBlockGrid = $state(false);
    let tooltip = $state({ visible: false, x: 0, y: 0, px: 0, py: 0, val: 0 });
    let chipTooltip = $state({ visible: false, x: 0, y: 0, text: '' });

    const ARTIFACT_MODES: { val: typeof ViewMode[keyof typeof ViewMode]; label: string; desc: string }[] = [
        { val: ViewMode.Artifacts,      label: 'Absolute Error',  desc: 'Pixel-by-pixel intensity difference. Highlights exact areas of color or luminance loss.' },
        { val: ViewMode.EdgeDistortion, label: 'Edge Distortion', desc: 'Visualizes loss of sharpness and high-frequency ringing artifacts near edges.' },
        { val: ViewMode.BlockingMap,    label: 'Blocking Map',    desc: 'Detects discontinuities at 8×8 block edges, showing where the macroblock structure is visible.' },
    ];

    const CS_MODES = [
        { id: 'art_cs_444', val: 444, label: '4:4:4' },
        { id: 'art_cs_422', val: 422, label: '4:2:2' },
        { id: 'art_cs_420', val: 420, label: '4:2:0' },
    ];

    const QUALITY_PRESETS = [
        { q: 10, label: 'Low',    desc: 'Thumbnails' },
        { q: 50, label: 'Medium', desc: 'Web / Social' },
        { q: 90, label: 'High',   desc: 'Print / Archive' },
    ];

    const currentMode = $derived(
        ARTIFACT_MODES.find(m => m.val === appState.currentViewMode) ?? ARTIFACT_MODES[0]
    );

    type MetricState = 'good' | 'moderate' | 'poor';
    function getPsnrState(v: number): MetricState { return v >= 40 ? 'good' : v >= 30 ? 'moderate' : 'poor'; }
    function getSsimState(v: number): MetricState { return v >= 0.95 ? 'good' : v >= 0.9 ? 'moderate' : 'poor'; }

    // --- Viridis false-colour LUT ---
    // Stops: [intensity 0-255, R, G, B]
    // Black → purple → blue → teal → yellow-green → yellow → white
    const VIRIDIS_STOPS: [number, number, number, number][] = [
        [  0,   0,   0,   0],
        [ 50,  68,   1,  84],
        [100,  59,  82, 139],
        [150,  33, 145, 140],
        [200,  94, 201,  98],
        [235, 253, 231,  37],
        [255, 255, 255, 255],
    ];

    const VIRIDIS_LUT = (() => {
        const lut = new Uint8Array(256 * 3);
        for (let v = 0; v < 256; v++) {
            let i = 0;
            while (i < VIRIDIS_STOPS.length - 2 && v > VIRIDIS_STOPS[i + 1][0]) i++;
            const [t0, r0, g0, b0] = VIRIDIS_STOPS[i];
            const [t1, r1, g1, b1] = VIRIDIS_STOPS[i + 1];
            const t = t1 === t0 ? 0 : (v - t0) / (t1 - t0);
            lut[v * 3    ] = Math.round(r0 + t * (r1 - r0));
            lut[v * 3 + 1] = Math.round(g0 + t * (g1 - g0));
            lut[v * 3 + 2] = Math.round(b0 + t * (b1 - b0));
        }
        return lut;
    })();

    function applyHeatmap(data: Uint8ClampedArray, pixelCount: number) {
        for (let i = 0; i < pixelCount; i++) {
            const v = data[i * 4]; // R channel (WASM outputs grayscale: R=G=B)
            data[i * 4    ] = VIRIDIS_LUT[v * 3    ];
            data[i * 4 + 1] = VIRIDIS_LUT[v * 3 + 1];
            data[i * 4 + 2] = VIRIDIS_LUT[v * 3 + 2];
        }
    }

    function drawBlockGrid() {
        if (!artifactCtx) return;
        const w = artifactCanvas.width;
        const h = artifactCanvas.height;
        artifactCtx.save();
        artifactCtx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        artifactCtx.lineWidth = 0.5;
        artifactCtx.beginPath();
        for (let x = 8; x < w; x += 8) {
            artifactCtx.moveTo(x + 0.5, 0);
            artifactCtx.lineTo(x + 0.5, h);
        }
        for (let y = 8; y < h; y += 8) {
            artifactCtx.moveTo(0, y + 0.5);
            artifactCtx.lineTo(w, y + 0.5);
        }
        artifactCtx.stroke();
        artifactCtx.restore();
    }

    function onArtifactMouseMove(e: MouseEvent) {
        if (!rawArtifactData || !artifactCanvas) { tooltip.visible = false; return; }
        const rect = artifactCanvas.getBoundingClientRect();
        const scaleX = artifactCanvas.width / rect.width;
        const scaleY = artifactCanvas.height / rect.height;
        const px = Math.floor((e.clientX - rect.left) * scaleX);
        const py = Math.floor((e.clientY - rect.top) * scaleY);
        if (px < 0 || py < 0 || px >= artifactCanvas.width || py >= artifactCanvas.height) {
            tooltip.visible = false;
            return;
        }
        tooltip.visible = true;
        tooltip.x = e.clientX;
        tooltip.y = e.clientY;
        tooltip.px = px;
        tooltip.py = py;
        tooltip.val = rawArtifactData[py * artifactCanvas.width + px];
    }

    function onChipMouseEnter(e: MouseEvent, desc: string) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        chipTooltip.visible = true;
        chipTooltip.text = desc;
        chipTooltip.x = rect.left + rect.width / 2;
        chipTooltip.y = rect.bottom + 8;
    }

    function onChipMouseLeave() {
        chipTooltip.visible = false;
    }

    onMount(() => {
        artifactCtx = artifactCanvas.getContext('2d');
        originalCtx = originalCanvas.getContext('2d');
        if (!ARTIFACT_MODES.some(m => m.val === appState.currentViewMode)) {
            appState.currentViewMode = ViewMode.Artifacts;
        }
        renderOriginal();
        renderArtifact();
    });

    onDestroy(stopBlink);

    function renderOriginal() {
        if (!originalCtx || !appState.originalImageData) return;
        originalCanvas.width = appState.imgWidth;
        originalCanvas.height = appState.imgHeight;
        originalCtx.putImageData(appState.originalImageData, 0, 0);
    }

    function renderArtifact() {
        if (!artifactCtx || !appState.originalImageData || !appState.wasmReady) return;
        const w = appState.imgWidth;
        const h = appState.imgHeight;
        if (artifactCanvas.width !== w || artifactCanvas.height !== h) {
            artifactCanvas.width = w;
            artifactCanvas.height = h;
            artifactImageData = null;
            rawArtifactData = null;
        }
        if (!artifactImageData) artifactImageData = new ImageData(w, h);
        if (!rawArtifactData || rawArtifactData.length !== w * h) rawArtifactData = new Uint8Array(w * h);
        let ptr = 0;
        try {
            ptr = getViewPtr(appState.currentViewMode);
            if (!ptr) return;
            // @ts-ignore
            const src = new Uint8ClampedArray(Module.HEAPU8.buffer, ptr, artifactImageData.data.length);
            artifactImageData.data.set(src);
            // Stash raw grayscale values before colour-mapping (used by tooltip)
            for (let i = 0; i < w * h; i++) rawArtifactData[i] = artifactImageData.data[i * 4];
            if (showHeatmap) applyHeatmap(artifactImageData.data, w * h);
            artifactCtx.putImageData(artifactImageData, 0, 0);
            if (showBlockGrid) drawBlockGrid();
        } catch (err) {
            console.error('Artifact render error:', err);
        } finally {
            if (ptr) free(ptr);
        }
    }

    // Re-render when view mode changes
    $effect(() => {
        const _vm = appState.currentViewMode;
        if (!artifactCtx || !appState.wasmReady || !appState.originalImageData) return;
        renderArtifact();
    });

    // Re-render when heatmap or grid overlay is toggled
    $effect(() => {
        const _hm = showHeatmap;
        const _grid = showBlockGrid;
        if (!artifactCtx || !appState.wasmReady || !appState.originalImageData) return;
        renderArtifact();
    });

    // Re-process and re-render when quality or chroma subsampling changes.
    // ViewerMode is unmounted while we're here, so we own the processImage call.
    $effect(() => {
        const q = appState.quality;
        const cs = appState.currentCsMode;
        if (!appState.wasmReady || !appState.originalImageData) return;
        processImage(q, cs);
        const stats = getStats();
        appState.psnr = { y: stats.psnr.y, cr: stats.psnr.cr, cb: stats.psnr.cb };
        appState.ssim = { y: stats.ssim.y, cr: stats.ssim.cr, cb: stats.ssim.cb };
        if (!isSliderInteracting) qualitySliderValue = q;
        if (artifactCtx) renderArtifact();
    });

    function onQualityInput(e: Event) {
        isSliderInteracting = true;
        qualitySliderValue = Number((e.target as HTMLInputElement).value);
    }

    function commitQuality() {
        isSliderInteracting = false;
        if (appState.quality !== qualitySliderValue) appState.quality = qualitySliderValue;
    }

    function onGainInput(e: Event) {
        gainValue = Number((e.target as HTMLInputElement).value);
        if (appState.wasmReady) {
            setArtifactGain(gainValue);
            if (appState.currentViewMode === ViewMode.Artifacts && artifactCtx && appState.originalImageData) {
                renderArtifact();
            }
        }
    }

    function resetGain() {
        gainValue = DEFAULT_GAIN;
        if (appState.wasmReady) {
            setArtifactGain(DEFAULT_GAIN);
            if (appState.currentViewMode === ViewMode.Artifacts && artifactCtx && appState.originalImageData) {
                renderArtifact();
            }
        }
    }

    function startBlink() {
        isBlinking = true;
        blinkPhase = 'artifact';
        blinkTimer = setInterval(() => {
            if (blinkPhase === 'artifact') {
                blinkPhase = 'original';
                viewType = 'original';
            } else {
                blinkPhase = 'artifact';
                viewType = 'artifact';
                renderArtifact();
            }
        }, 500);
    }

    function stopBlink() {
        isBlinking = false;
        blinkPhase = 'artifact';
        viewType = 'artifact';
        if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
        renderArtifact();
    }

    function toggleBlink() {
        isBlinking ? stopBlink() : startBlink();
    }

    function onBack() {
        appState.appMode = 'viewer';
        appState.currentViewMode = ViewMode.RGB;
    }
</script>

<div id="artifactInspector">
    <div class="inspector-fullpage">

        <!-- Topbar: same global classes as Block Inspector -->
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
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Artifact Analyzer
            </h2>
            <div class="artifact-chips">
                {#each ARTIFACT_MODES as mode}
                <button class="artifact-chip" class:active={appState.currentViewMode === mode.val}
                    onclick={() => appState.currentViewMode = mode.val}
                    onmouseenter={(e) => onChipMouseEnter(e, mode.desc)}
                    onmouseleave={onChipMouseLeave}>
                    {mode.label}
                </button>
                {/each}
            </div>
        </div>

        <!-- Two-column layout: same global class as Block Inspector -->
        <div class="inspector-layout">

            <!-- Sidebar: same global classes as Block Inspector -->
            <aside class="inspector-sidebar">

                <!-- sidebar-controls activates the compact preset/slider sizing -->
                <details class="sidebar-section sidebar-controls" open>
                    <summary class="sidebar-section-title"><span>Controls</span></summary>
                    <div class="sidebar-section-body">
                        <div class="control-group">
                            <label>
                                Quality
                                <span>{qualitySliderValue}</span>
                            </label>
                            <div class="preset-group">
                                {#each QUALITY_PRESETS as p}
                                <button class="preset-btn" class:active={appState.quality === p.q}
                                    onclick={() => { appState.quality = p.q; }}>
                                    <span class="preset-label">{p.label}</span>
                                    <span class="preset-desc">{p.desc}</span>
                                </button>
                                {/each}
                            </div>
                            <input type="range" min="1" max="100" value={qualitySliderValue}
                                oninput={onQualityInput}
                                onchange={commitQuality}
                                onblur={commitQuality}>
                        </div>
                        {#if appState.currentViewMode === ViewMode.Artifacts}
                        <div class="control-group" transition:fade={{duration: 150}}>
                            <label class="gain-label">
                                Error Gain
                                <span class="gain-value-display">{gainValue.toFixed(1)}×</span>
                                {#if gainValue !== DEFAULT_GAIN}
                                <button class="gain-reset-btn" onclick={resetGain} title="Reset to default (5.0×)">↺</button>
                                {/if}
                            </label>
                            <input type="range" min="1" max="20" step="0.5" value={gainValue}
                                oninput={onGainInput}>
                            <p class="gain-hint">Amplifies pixel error before clamping to 255. Higher = faint errors more visible.</p>
                        </div>
                        {/if}

                        <div class="control-group">
                            <div class="group-label">Chroma Subsampling</div>
                            <div class="toggle-group">
                                {#each CS_MODES as cs}
                                <input type="radio" id={cs.id} name="art_chroma"
                                    checked={appState.currentCsMode === cs.val}
                                    onchange={() => appState.currentCsMode = cs.val}>
                                <label for={cs.id}>{cs.label}</label>
                                {/each}
                            </div>
                        </div>
                    </div>
                </details>

                <details class="sidebar-section visual-tools-section" open>
                    <summary class="sidebar-section-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                        <span>Visual Tools</span>
                    </summary>
                    <div class="sidebar-section-body">
                        <div class="tools-grid">
                            <button class="tool-btn" class:active={isBlinking} onclick={toggleBlink} title="Blink Test">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                                <span>Blink</span>
                            </button>

                            <button class="tool-btn" class:active={showHeatmap} onclick={() => showHeatmap = !showHeatmap} title="Toggle Heat Map">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
                                </svg>
                                <span>Heat Map</span>
                            </button>

                            <button class="tool-btn" class:active={showBlockGrid} onclick={() => showBlockGrid = !showBlockGrid} title="8×8 Block Grid">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="3" width="7" height="7"/>
                                    <rect x="14" y="3" width="7" height="7"/>
                                    <rect x="14" y="14" width="7" height="7"/>
                                    <rect x="3" y="14" width="7" height="7"/>
                                </svg>
                                <span>Grid</span>
                            </button>
                        </div>

                        {#if showHeatmap}
                        <div class="heatmap-scale-container" transition:fade={{duration: 150}}>
                            <div class="heatmap-scale-label">Error Magnitude</div>
                            <div class="heatmap-scale-bar"></div>
                            <div class="heatmap-scale-range">
                                <span>0</span>
                                <span>127</span>
                                <span>255</span>
                            </div>
                        </div>
                        {/if}

                        <div class="info-box">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                            <p>Hover map for per-pixel error values. Mode chips have descriptions on hover.</p>
                        </div>
                    </div>
                </details>

                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span>Metrics</span></summary>
                    <div class="sidebar-section-body">
                        <div class="compact-metrics-grid">
                            <div class="metric-header-row">
                                <div class="metric-col-label">Channel</div>
                                <div class="metric-col-label">PSNR (dB)</div>
                                <div class="metric-col-label">SSIM</div>
                            </div>
                            {#each [
                                { channel: 'Y',  psnr: appState.psnr.y,  ssim: appState.ssim.y  },
                                { channel: 'Cr', psnr: appState.psnr.cr, ssim: appState.ssim.cr },
                                { channel: 'Cb', psnr: appState.psnr.cb, ssim: appState.ssim.cb },
                            ] as row}
                            {@const ps = getPsnrState(row.psnr)}
                            {@const ss = getSsimState(row.ssim)}
                            <div class="metric-row">
                                <div class="metric-channel-name">{row.channel}</div>
                                <div class="metric-cell psnr-cell"
                                    class:stat-good={ps==='good'} class:stat-moderate={ps==='moderate'} class:stat-poor={ps==='poor'}>
                                    {row.psnr.toFixed(2)}
                                </div>
                                <div class="metric-cell"
                                    class:stat-good={ss==='good'} class:stat-moderate={ss==='moderate'} class:stat-poor={ss==='poor'}>
                                    {row.ssim.toFixed(4)}
                                </div>
                            </div>
                            {/each}
                        </div>
                    </div>
                </details>

            </aside>

            <!-- Main Content Area -->
            <main class="artifact-content">

                <!-- Single View Toggle -->
                <div class="view-toggle-container">
                    <div class="view-toggle">
                        <button class:active={viewType === 'original'}
                            onclick={() => viewType = 'original'}>
                            Original
                        </button>
                        <button class:active={viewType === 'artifact'}
                            onclick={() => viewType = 'artifact'}>
                            {currentMode.label}
                        </button>
                    </div>
                </div>

                <div class="art-canvas-outer">
                    <div class="art-canvas-container">
                        <!-- We keep both canvases but toggle visibility/z-index to avoid re-renders or context loss -->
                        <div class="art-canvas-wrap" class:visible={viewType === 'original'}>
                            <canvas bind:this={originalCanvas}></canvas>
                        </div>
                        <div class="art-canvas-wrap" class:visible={viewType === 'artifact'}>
                            <canvas bind:this={artifactCanvas}
                                onmousemove={onArtifactMouseMove}
                                onmouseleave={() => tooltip.visible = false}></canvas>
                        </div>
                    </div>
                </div>



            </main>

        </div><!-- /inspector-layout -->
    </div><!-- /inspector-fullpage -->

    <!-- Pixel hover tooltip -->
    {#if tooltip.visible && viewType === 'artifact'}
    <div class="pixel-tooltip" style="left: {tooltip.x}px; top: {tooltip.y}px">
        <div class="tooltip-header">
            <span class="tooltip-coord">X:{tooltip.px} Y:{tooltip.py}</span>
            <span class="tooltip-type">{currentMode.label}</span>
        </div>
        <div class="tooltip-val">
            <span class="val-number">{tooltip.val}</span>
            <span class="val-scale">/ 255</span>
            <span class="val-percent">({((tooltip.val / 255) * 100).toFixed(1)}%)</span>
        </div>
    </div>
    {/if}

    <!-- Chip description tooltip -->
    {#if chipTooltip.visible}
    <div class="chip-tooltip" transition:fade={{duration: 100}}
        style="left: {chipTooltip.x}px; top: {chipTooltip.y}px">
        {chipTooltip.text}
    </div>
    {/if}

</div>

<style>
    /* Scoped to this component only.
       Shell, sidebar, controls, and metrics use global CSS classes shared with Block Inspector. */

    /* ===== Topbar mode chips ===== */

    .artifact-chips {
        display: flex;
        gap: 0.4rem;
        margin-left: auto;
        flex-wrap: wrap;
    }

    .artifact-chip {
        padding: 0.35rem 0.9rem;
        border-radius: 99px;
        border: 1px solid var(--border);
        background: var(--card-bg);
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .artifact-chip:hover {
        background: var(--primary-subtle);
        color: var(--text);
        border-color: var(--primary);
    }

    .artifact-chip.active {
        background: var(--primary);
        color: white;
        border-color: var(--primary);
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
    }



    /* ===== Canvas split view ===== */

    .artifact-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 1.25rem;
        background: var(--viewer-bg, #0d0d0d);
        overflow: hidden;
        min-width: 0;
        min-height: 0;
        gap: 1rem;
    }

    /* ===== View Toggle ===== */
    .view-toggle-container {
        display: flex;
        justify-content: center;
        flex-shrink: 0;
    }

    .view-toggle {
        display: flex;
        background: rgba(255, 255, 255, 0.05);
        padding: 3px;
        border-radius: 8px;
        border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
        gap: 2px;
    }

    .view-toggle button {
        padding: 0.45rem 1.25rem;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        min-width: 100px;
    }

    .view-toggle button:hover {
        color: var(--text);
        background: rgba(255, 255, 255, 0.03);
    }

    .view-toggle button.active {
        background: var(--primary);
        color: white;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    }

    /* ===== Canvas Area ===== */
    .art-canvas-outer {
        flex: 1;
        position: relative;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .art-canvas-container {
        position: relative;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
    }

    .art-canvas-wrap {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--viewer-bg, #111);
        border-radius: 12px;
        border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.07));
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.3s ease, visibility 0.3s ease, border-color 0.2s, box-shadow 0.2s;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }

    .art-canvas-wrap.visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }



    .art-canvas-wrap canvas {
        max-width: 100%;
        max-height: 100%;
        display: block;
        image-rendering: pixelated;
        cursor: crosshair;
    }

    .indicator-blink {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.2);
    }

    /* ===== Error Gain slider ===== */

    .gain-label {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .gain-value-display {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        color: var(--primary);
    }

    .gain-reset-btn {
        background: none;
        border: none;
        padding: 0 2px;
        cursor: pointer;
        font-size: 0.85rem;
        color: var(--text-muted);
        line-height: 1;
        border-radius: 3px;
        transition: color 0.15s;
    }

    .gain-reset-btn:hover {
        color: var(--primary);
    }

    .gain-hint {
        margin: 4px 0 0;
        font-size: 0.72rem;
        line-height: 1.45;
        color: var(--text-muted);
    }

    /* ===== Visual Tools Improvements ===== */
    .tools-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin-bottom: 12px;
    }

    .tools-grid .tool-btn {
        flex-direction: column;
        padding: 8px 4px;
        height: auto;
        gap: 4px;
    }

    .tools-grid .tool-btn span {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.02em;
    }

    .tools-grid .tool-btn svg {
        width: 14px;
        height: 14px;
    }

    .heatmap-scale-container {
        margin: 12px 0;
        padding: 10px;
        background: rgba(0, 0, 0, 0.15);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-subtle);
    }

    [data-theme="dark"] .heatmap-scale-container {
        background: rgba(0, 0, 0, 0.3);
    }

    .heatmap-scale-label {
        font-size: 0.65rem;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 8px;
    }

    .heatmap-scale-bar {
        height: 10px;
        width: 100%;
        border-radius: 4px;
        background: linear-gradient(to right,
            rgb(0,0,0),
            rgb(68,1,84),
            rgb(59,82,139),
            rgb(33,145,140),
            rgb(94,201,98),
            rgb(253,231,37),
            rgb(255,255,255)
        );
        box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);
        margin-bottom: 5px;
    }

    .heatmap-scale-range {
        display: flex;
        justify-content: space-between;
        font-size: 0.6rem;
        font-weight: 600;
        color: var(--text-muted);
        font-family: var(--font-mono);
    }

    .info-box {
        margin-top: 12px;
        padding: 10px 12px;
        background: var(--primary-subtle);
        border-radius: var(--radius-md);
        border: 1px solid color-mix(in srgb, var(--primary) 15%, transparent);
        display: flex;
        gap: 10px;
        align-items: flex-start;
    }

    .info-box svg {
        flex-shrink: 0;
        color: var(--primary);
        margin-top: 2px;
    }

    .info-box p {
        margin: 0;
        font-size: 0.72rem;
        line-height: 1.45;
        color: var(--text);
    }

    .info-box strong {
        color: var(--primary);
    }

    /* ===== Pixel hover tooltip ===== */

    .pixel-tooltip {
        position: fixed;
        transform: translate(14px, calc(-50% - 4px));
        background: rgba(10, 10, 16, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 10px 14px;
        pointer-events: none;
        z-index: 9999;
        backdrop-filter: blur(12px);
        white-space: nowrap;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .tooltip-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 6px;
    }

    .tooltip-coord {
        font-size: 0.65rem;
        font-family: var(--font-mono);
        color: var(--text-muted);
        font-weight: 600;
    }

    .tooltip-type {
        font-size: 0.65rem;
        font-weight: 800;
        text-transform: uppercase;
        color: var(--primary);
        letter-spacing: 0.04em;
    }

    .tooltip-val {
        display: flex;
        align-items: baseline;
        gap: 4px;
        font-family: var(--font-mono);
    }

    .val-number {
        font-size: 1.1rem;
        font-weight: 700;
        color: #fde725;
    }

    .val-scale {
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.3);
    }

    .val-percent {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.6);
        margin-left: 4px;
    }

    .chip-tooltip {
        position: fixed;
        transform: translateX(-50%);
        background: var(--card-bg);
        border: 1px solid var(--primary);
        color: var(--text);
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.78rem;
        z-index: 10000;
        pointer-events: none;
        max-width: 240px;
        line-height: 1.4;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
        text-align: center;
    }

</style>
