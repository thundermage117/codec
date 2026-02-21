<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { appState, ViewMode } from './lib/state.svelte.js';
    import { processImage, getViewPtr, getStats, free } from './lib/wasm-bridge.js';

    let artifactCanvas: HTMLCanvasElement;
    let originalCanvas: HTMLCanvasElement;
    let artifactCtx: CanvasRenderingContext2D | null = null;
    let originalCtx: CanvasRenderingContext2D | null = null;
    let artifactImageData: ImageData | null = null;

    let blinkTimer: ReturnType<typeof setInterval> | null = null;
    let isBlinking = $state(false);
    let blinkPhase = $state<'artifact' | 'original'>('artifact');

    let qualitySliderValue = $state(appState.quality);
    let isSliderInteracting = false;

    const ARTIFACT_MODES: { val: typeof ViewMode[keyof typeof ViewMode]; label: string; desc: string }[] = [
        { val: ViewMode.Artifacts,      label: 'Absolute Error',  desc: 'Pixel-level difference heatmap between original and reconstructed.' },
        { val: ViewMode.EdgeDistortion, label: 'Edge Distortion', desc: 'Highlights loss of sharpness and ringing near high-contrast edges.' },
        { val: ViewMode.BlockingMap,    label: 'Blocking Map',    desc: 'Discontinuities at 8×8 block boundaries — a signature of heavy compression.' },
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
        }
        if (!artifactImageData) artifactImageData = new ImageData(w, h);
        let ptr = 0;
        try {
            ptr = getViewPtr(appState.currentViewMode);
            if (!ptr) return;
            // @ts-ignore
            const src = new Uint8ClampedArray(Module.HEAPU8.buffer, ptr, artifactImageData.data.length);
            artifactImageData.data.set(src);
            artifactCtx.putImageData(artifactImageData, 0, 0);
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

    function startBlink() {
        isBlinking = true;
        blinkPhase = 'artifact';
        blinkTimer = setInterval(() => {
            if (blinkPhase === 'artifact') {
                blinkPhase = 'original';
                if (artifactCtx && appState.originalImageData) {
                    if (artifactCanvas.width !== appState.imgWidth || artifactCanvas.height !== appState.imgHeight) {
                        artifactCanvas.width = appState.imgWidth;
                        artifactCanvas.height = appState.imgHeight;
                    }
                    artifactCtx.putImageData(appState.originalImageData, 0, 0);
                }
            } else {
                blinkPhase = 'artifact';
                renderArtifact();
            }
        }, 500);
    }

    function stopBlink() {
        isBlinking = false;
        blinkPhase = 'artifact';
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
                    onclick={() => appState.currentViewMode = mode.val}>
                    {mode.label}
                </button>
                {/each}
            </div>
        </div>

        <!-- Two-column layout: same global class as Block Inspector -->
        <div class="inspector-layout">

            <!-- Sidebar: same global classes as Block Inspector -->
            <aside class="inspector-sidebar">

                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span>Analysis Mode</span></summary>
                    <div class="sidebar-section-body">
                        <strong class="art-mode-name">{currentMode.label}</strong>
                        <p class="art-mode-desc">{currentMode.desc}</p>
                    </div>
                </details>

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

                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span>Visual Tools</span></summary>
                    <div class="sidebar-section-body">
                        <button class="tool-btn" class:active={isBlinking} onclick={toggleBlink}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                            {isBlinking ? 'Stop Blink Test' : 'Blink Test'}
                        </button>
                        <p class="advanced-hint">Alternates the right panel between the artifact map and the original image.</p>
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

            <!-- Canvas split view (scoped layout) -->
            <main class="artifact-content">

                <div class="art-panel">
                    <div class="art-canvas-outer">
                        <div class="art-canvas-wrap">
                            <canvas bind:this={originalCanvas}></canvas>
                        </div>
                    </div>
                    <span class="art-panel-label">Original</span>
                </div>

                <div class="art-divider"></div>

                <div class="art-panel">
                    <div class="art-canvas-outer">
                        <div class="art-canvas-wrap" class:blinking={isBlinking}>
                            <canvas bind:this={artifactCanvas}></canvas>
                            {#if isBlinking}
                            <div class="art-blink-badge" class:is-orig={blinkPhase === 'original'}>
                                {blinkPhase === 'original' ? 'Original' : currentMode.label}
                            </div>
                            {/if}
                        </div>
                    </div>
                    <span class="art-panel-label">
                        {isBlinking && blinkPhase === 'original' ? 'Original' : currentMode.label}
                    </span>
                </div>

            </main>

        </div><!-- /inspector-layout -->
    </div><!-- /inspector-fullpage -->
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

    /* ===== Sidebar mode description ===== */

    .art-mode-name {
        font-size: 0.9rem;
        color: var(--primary);
        font-weight: 700;
        display: block;
        margin-bottom: 4px;
    }

    .art-mode-desc {
        font-size: 0.82rem;
        line-height: 1.55;
        margin: 0;
        color: var(--text);
    }

    /* ===== Canvas split view ===== */

    .artifact-content {
        flex: 1;
        display: flex;
        padding: 1.25rem;
        background: var(--viewer-bg, #0d0d0d);
        overflow: hidden;
        min-width: 0;
        min-height: 0;
    }

    .art-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
        min-height: 0;
        padding: 0 0.625rem;
    }

    /* Reliable canvas sizing via absolute fill */
    .art-canvas-outer {
        flex: 1;
        position: relative;
        min-height: 0;
    }

    .art-canvas-wrap {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--viewer-bg, #111);
        border-radius: 10px;
        border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.07));
        overflow: hidden;
        transition: border-color 0.2s, box-shadow 0.2s;
    }

    .art-canvas-wrap.blinking {
        border-color: var(--primary);
        box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25);
    }

    .art-canvas-wrap canvas {
        max-width: 100%;
        max-height: 100%;
        display: block;
        image-rendering: pixelated;
    }

    .art-divider {
        width: 1px;
        background: var(--border-subtle, rgba(255, 255, 255, 0.06));
        flex-shrink: 0;
        align-self: stretch;
    }

    .art-panel-label {
        text-align: center;
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.09em;
        flex-shrink: 0;
    }

    .art-blink-badge {
        position: absolute;
        bottom: 0.65rem;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.3rem 0.8rem;
        border-radius: 4px;
        background: #ef4444;
        color: white;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        white-space: nowrap;
        pointer-events: none;
        transition: background 0.1s;
    }

    .art-blink-badge.is-orig {
        background: #10b981;
    }
</style>
