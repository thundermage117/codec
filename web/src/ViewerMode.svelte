<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { appState, ViewMode, type ViewModeValue } from './lib/state.svelte.js';
    import { processImage, previewImage, rdEncode, getViewPtr, getStats, free, setViewTint, getLastBitEstimate } from './lib/wasm-bridge.js';
    import { TRANSFORMS, isWavelet, nextTransform, transformInfo } from './lib/transforms.js';
    import { parseUrlState, writeUrlState } from './lib/url-state.js';
    import { handleFileSelect, loadImageFromUrl } from './lib/image-manager.js';
    import { formatBytes } from './lib/format.js';
    import ImageViewer from './lib/components/ImageViewer.svelte';
    import QualityControl from './lib/components/QualityControl.svelte';
    import CodecSettings from './lib/components/CodecSettings.svelte';
    import ResultSummary from './lib/components/ResultSummary.svelte';
    import AppHeader from './lib/components/viewer/AppHeader.svelte';
    import CompareCard from './lib/components/viewer/CompareCard.svelte';
    import type { RdPoint } from './lib/components/viewer/RdChart.svelte';
    import ImageSourcePanel from './lib/components/viewer/ImageSourcePanel.svelte';

    /** Kodak image shown on first visit, so the app opens on a result rather than an empty frame. */
    const DEFAULT_TEST_IMAGE = 3;

    let originalCanvas: HTMLCanvasElement | undefined = $state();
    let processedCanvas: HTMLCanvasElement | undefined = $state();
    let isDraggingFile = $state(false);
    let rdSeries = $state<Record<number, RdPoint[]>>({});
    let rdLoading = $state(false);
    let rdError = $state('');
    let rdJobId = 0;
    const RD_QUALITIES = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
    const RD_REBUILD_DEFER_MS = 250;

    let processedCtx: CanvasRenderingContext2D | null = null;
    let processedImageData: ImageData | null = null;
    let renderedOriginal: ImageData | null = null; // what originalCanvas currently shows
    let rdDeferTimer: ReturnType<typeof setTimeout> | null = null;
    let rdIdleHandle: number | null = null;

    const VIEW_MODES: { val: ViewModeValue; label: string; title: string }[] = [
        { val: ViewMode.RGB, label: 'Image', title: 'The decoded image' },
        { val: ViewMode.Y, label: 'Y', title: 'Luma: brightness, kept at full resolution' },
        { val: ViewMode.Cr, label: 'Cr', title: 'Red-difference chroma' },
        { val: ViewMode.Cb, label: 'Cb', title: 'Blue-difference chroma' }
    ];
    const SUBBAND_MODE = { val: ViewMode.Subbands, label: 'Subbands', title: 'Wavelet coefficient pyramid' };

    // The subband pyramid only exists for wavelet transforms.
    const wavelet = $derived(isWavelet(appState.transformType));
    const viewModes = $derived(wavelet ? [...VIEW_MODES, SUBBAND_MODE] : VIEW_MODES);
    const isChroma = $derived(appState.currentViewMode === ViewMode.Cr || appState.currentViewMode === ViewMode.Cb);

    const processedCaption = $derived([
        appState.currentViewMode === ViewMode.RGB ? null
            : `${viewModes.find(m => m.val === appState.currentViewMode)?.label} channel`,
        transformInfo(appState.transformType).label,
        `Q${appState.quality}`
    ].filter(Boolean).join(' · '));

    // The pyramid isn't pixel-aligned with the image, so a comparison split
    // would just hide half of it: show it full-frame.
    const viewType = $derived(appState.currentViewMode === ViewMode.Subbands ? 'processed' : 'comparison');

    // ===== Zoom =====
    const ZOOM_LEVEL = 3;
    let isZoomMode = $state(false);
    let zoom = $state(1);
    let zoomOriginX = $state(50); // % of canvas
    let zoomOriginY = $state(50);

    function toggleZoomMode() {
        isZoomMode = !isZoomMode;
        if (!isZoomMode) { zoom = 1; }
    }

    function resetZoom() {
        zoom = 1;
    }

    onMount(() => {
        // Ensure we're in a view mode the viewer offers
        const viewerModes: ViewModeValue[] = [ViewMode.RGB, ViewMode.Y, ViewMode.Cr, ViewMode.Cb, ViewMode.Subbands];
        if (!viewerModes.includes(appState.currentViewMode)) {
            appState.currentViewMode = ViewMode.RGB;
        }

        if (appState.wasmReady && appState.originalImageData) {
            render();
            updateFileSizeEstimate();
        }
    });

    onDestroy(() => {
        rdJobId++;
        clearRdScheduling();
    });

    // ===== Render =====

    function ensureCanvasResources(): boolean {
        if (!originalCanvas || !processedCanvas || !appState.originalImageData) return false;

        const width = appState.imgWidth;
        const height = appState.imgHeight;
        if (processedCanvas.width !== width || processedCanvas.height !== height ||
            originalCanvas.width !== width || originalCanvas.height !== height) {
            processedCanvas.width = width;
            processedCanvas.height = height;
            originalCanvas.width = width;
            originalCanvas.height = height;
            renderedOriginal = null;
        }

        if (!processedCtx) processedCtx = processedCanvas.getContext('2d', { willReadFrequently: true });
        if (!processedCtx) return false;

        if (!processedImageData || processedImageData.width !== width || processedImageData.height !== height) {
            processedImageData = new ImageData(width, height);
        }
        return true;
    }

    function render() {
        if (!appState.wasmReady || !appState.originalImageData || !processedCanvas) return;
        if (!ensureCanvasResources() || !processedCtx || !processedImageData) return;

        let outputPtr = 0;
        try {
            outputPtr = getViewPtr(appState.currentViewMode);
            if (!outputPtr) throw new Error('WASM get_view_ptr returned null');

            const targetBuffer = processedImageData.data;
            const sourceView = new Uint8ClampedArray(Module.HEAPU8.buffer, outputPtr, targetBuffer.length);
            targetBuffer.set(sourceView);
            processedCtx.putImageData(processedImageData, 0, 0);

            const stats = getStats();
            appState.psnr = { y: stats.psnr.y, cr: stats.psnr.cr, cb: stats.psnr.cb };
            appState.ssim = { y: stats.ssim.y, cr: stats.ssim.cr, cb: stats.ssim.cb };

            if (renderedOriginal !== appState.originalImageData) {
                originalCanvas?.getContext('2d')?.putImageData(appState.originalImageData, 0, 0);
                renderedOriginal = appState.originalImageData;
            }
        } catch (err) {
            console.error('Render error:', err);
        } finally {
            if (outputPtr) free(outputPtr);
        }
    }

    // Live preview while the quality slider is dragged: re-encode without
    // metrics and redraw; the effect below does the full encode on release.
    function previewQuality(q: number): void {
        if (!appState.wasmReady || !appState.originalImageData) return;
        previewImage(q, appState.currentCsMode);
        render();
        updateFileSizeEstimate();
    }

    // ===== Reactive effects =====

    // Process + render on quality, CS, or transform type change.
    $effect(() => {
        const q = appState.quality;
        const cs = appState.currentCsMode;
        const _t = appState.transformType; // track for reactivity
        if (!appState.wasmReady || !appState.originalImageData) return;
        processImage(q, cs);
        render();
        updateFileSizeEstimate();
    });

    // Just re-render on view mode change (no reprocessing)
    $effect(() => {
        const _vm = appState.currentViewMode;
        if (appState.wasmReady && appState.originalImageData) {
            render();
        }
    });

    // Tint toggle
    $effect(() => {
        const tint = appState.tintEnabled;
        if (appState.wasmReady) {
            setViewTint(tint ? 1 : 0);
            if (appState.originalImageData) render();
        }
    });

    // ===== Image loading =====

    function onImageLoaded(testImage: number | null) {
        appState.activeTestImage = testImage;
        processImage(appState.quality, appState.currentCsMode);
        appState.comparisonPercent = 50;
        render();
        updateFileSizeEstimate();
    }

    function loadFile(file: File) {
        if (!file || !file.type.startsWith('image/')) return;
        if (!originalCanvas || !processedCanvas) return;
        handleFileSelect(file, originalCanvas, processedCanvas, () => onImageLoaded(null));
    }

    function loadTestImage(index: number) {
        if (!appState.wasmReady || !originalCanvas || !processedCanvas) return;
        loadImageFromUrl(`/test-images/${index}.png`, originalCanvas, processedCanvas, () => onImageLoaded(index));
    }

    // Drop an image file anywhere on the viewer.
    function onViewerDragOver(e: DragEvent) {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        isDraggingFile = true;
    }

    function onViewerDrop(e: DragEvent) {
        e.preventDefault();
        isDraggingFile = false;
        const file = e.dataTransfer?.files[0];
        if (file) loadFile(file);
    }

    // ===== Comparison slider =====

    let isDraggingComparison = false;
    // Track whether the pointer moved enough to count as a drag vs. a click
    let mouseDownClientX = 0;
    let hasDraggedSinceDown = false;

    function onViewerMouseDown(e: MouseEvent) {
        mouseDownClientX = e.clientX;
        hasDraggedSinceDown = false;
        if (isZoomMode || viewType !== 'comparison') return;
        isDraggingComparison = true;
        handleViewerInteraction(e.clientX);
    }

    function onDocumentMouseMove(e: MouseEvent) {
        if (Math.abs(e.clientX - mouseDownClientX) > 4) hasDraggedSinceDown = true;
        // In zoom mode, start comparison drag as soon as the threshold is met
        if (isZoomMode && !isDraggingComparison && hasDraggedSinceDown &&
            viewType === 'comparison' && e.buttons === 1) {
            isDraggingComparison = true;
        }
        if (isDraggingComparison) {
            handleViewerInteraction(e.clientX);
        }
    }

    function onDocumentMouseUp() {
        isDraggingComparison = false;
    }

    function handleViewerInteraction(clientX: number) {
        if (!processedCanvas) return;
        // When zoomed, the canvas CSS transform inflates its bounding rect by the zoom factor,
        // making 1px of mouse movement produce only 1/zoom change in percent. Use the
        // unscaled viewport container so comparisonPercent always tracks mouse 1:1.
        const viewportEl = processedCanvas.closest('.zoom-viewport');
        const refEl = (zoom > 1 && viewportEl) ? viewportEl : processedCanvas;
        const rect = refEl.getBoundingClientRect();
        const x = clientX - rect.left;
        appState.comparisonPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    }

    function onViewerClick(e: MouseEvent) {
        if (!isZoomMode || hasDraggedSinceDown) return;
        if (zoom > 1) {
            resetZoom();
        } else if (originalCanvas) {
            const rect = originalCanvas.getBoundingClientRect();
            zoomOriginX = ((e.clientX - rect.left) / rect.width) * 100;
            zoomOriginY = ((e.clientY - rect.top) / rect.height) * 100;
            zoom = ZOOM_LEVEL;
        }
    }

    function enterInspectorMode() {
        appState.appMode = 'inspector';
        appState.isInspectMode = true;
    }

    // ===== File size estimate =====

    function updateFileSizeEstimate() {
        if (!appState.wasmReady || !appState.originalImageData) return;

        const originalBytes = appState.imgWidth * appState.imgHeight * 3;

        // Use the actual bit estimate from the last encode
        const bits = getLastBitEstimate();
        const estimatedBytes = Math.max(64, Math.round(bits / 8));

        if (!estimatedBytes) return;

        const reduction = Math.max(0, Math.round((1 - estimatedBytes / originalBytes) * 100));
        const ratio = (originalBytes / estimatedBytes).toFixed(1);

        appState.fileSizeInfo = {
            original: formatBytes(originalBytes),
            estimated: formatBytes(estimatedBytes),
            reduction,
            ratio,
            fillPercent: Math.max(2, 100 - reduction)
        };
    }

    // ===== Rate–distortion curves =====

    async function rebuildRdCurve() {
        if (!appState.wasmReady || !appState.originalImageData) return;

        const jobId = ++rdJobId;
        rdLoading = true;
        rdError = '';

        const series: Record<number, RdPoint[]> = {};
        const pixels = appState.imgWidth * appState.imgHeight;

        try {
            for (const t of TRANSFORMS) {
                const points: RdPoint[] = [];
                for (const quality of RD_QUALITIES) {
                    if (jobId !== rdJobId) return;

                    const { psnrY, bits } = rdEncode(quality, appState.currentCsMode, t.value);
                    if (bits > 0) {
                        const estimatedBytes = Math.max(64, Math.round(bits / 8));
                        points.push({ quality, psnr: psnrY, estimatedBytes, bitrate: (estimatedBytes * 8) / pixels });
                    }

                    // Yield after every encode so the event loop can process slider/UI events
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                series[t.value] = points.sort((a, b) => a.bitrate - b.bitrate);
            }

            if (jobId === rdJobId) rdSeries = series;
        } catch (error) {
            console.error('RD curve generation error:', error);
            if (jobId === rdJobId) {
                rdError = 'Unable to generate RD curve.';
                rdSeries = {};
            }
        } finally {
            // rdEncode never touches the displayed image, so nothing to restore.
            if (jobId === rdJobId) rdLoading = false;
        }
    }

    function clearRdScheduling(): void {
        if (rdDeferTimer) clearTimeout(rdDeferTimer);
        rdDeferTimer = null;
        if (rdIdleHandle !== null && typeof cancelIdleCallback !== 'undefined') {
            cancelIdleCallback(rdIdleHandle);
        }
        rdIdleHandle = null;
    }

    function scheduleRdCurveRebuild(): void {
        clearRdScheduling();
        rdDeferTimer = setTimeout(() => {
            rdDeferTimer = null;
            if (typeof requestIdleCallback !== 'undefined') {
                rdIdleHandle = requestIdleCallback(() => {
                    rdIdleHandle = null;
                    void rebuildRdCurve();
                }, { timeout: 900 });
                return;
            }
            void rebuildRdCurve();
        }, RD_REBUILD_DEFER_MS);
    }

    // The curves depend on the image and the chroma mode (not on quality or
    // transform, which only move the marker): rebuild them in the background.
    $effect(() => {
        const _cs = appState.currentCsMode;
        const ready = appState.wasmReady && !!appState.originalImageData;
        clearRdScheduling();
        rdJobId++;
        rdSeries = {};
        rdLoading = false;
        rdError = '';
        if (ready) scheduleRdCurveRebuild();
    });

    // ===== Keyboard shortcuts =====

    function isTypingTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        if (target.isContentEditable) return true;
        if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
        // Range sliders and radios don't consume [, ] or T, so shortcuts stay live there.
        return target instanceof HTMLInputElement && !['range', 'radio', 'checkbox', 'button'].includes(target.type);
    }

    function onDocumentKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            if (zoom > 1) { zoom = 1; }
            if (isZoomMode) { isZoomMode = false; }
            return;
        }

        if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
        if (!appState.wasmReady || !appState.originalImageData) return;

        if (e.key === '[' || e.key === ']') {
            e.preventDefault();
            const step = e.key === ']' ? 5 : -5;
            appState.quality = Math.max(1, Math.min(100, appState.quality + step));
        } else if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            appState.transformType = nextTransform(appState.transformType);
        }
    }

    // ===== Download =====

    function downloadProcessed(): void {
        if (!processedCanvas || !appState.originalImageData) return;
        const t = transformInfo(appState.transformType).slug;
        const filename = `codec-q${appState.quality}-${t}-${appState.currentCsMode}.png`;
        processedCanvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        }, 'image/png');
    }

    // ===== Wavelet-only views =====

    // The subband pyramid doesn't exist for DCT; fall back to the image when switching away.
    $effect(() => {
        if (!wavelet && appState.currentViewMode === ViewMode.Subbands) {
            appState.currentViewMode = ViewMode.RGB;
        }
    });

    // ===== Shareable URL state =====

    // Load the test image named in the URL, or a default one, once WASM is ready.
    let pendingTestImage: number | null = parseUrlState(location.hash).testImage ?? DEFAULT_TEST_IMAGE;
    $effect(() => {
        if (pendingTestImage === null || !appState.wasmReady || !originalCanvas || !processedCanvas) return;
        if (!appState.originalImageData) loadTestImage(pendingTestImage);
        pendingTestImage = null;
    });

    // Mirror codec settings into the URL hash (debounced) so they can be shared.
    $effect(() => {
        const state = {
            quality: appState.quality,
            transformType: appState.transformType,
            csMode: appState.currentCsMode,
            viewMode: appState.currentViewMode,
            testImage: appState.activeTestImage ?? undefined
        };
        const timer = setTimeout(() => writeUrlState(state), 300);
        return () => clearTimeout(timer);
    });

</script>

<svelte:document onmousemove={onDocumentMouseMove} onmouseup={onDocumentMouseUp} onkeydown={onDocumentKeyDown} />

<!-- ===== VIEWER MODE ===== -->
<div id="viewerMode">

    <AppHeader />

    <div class="container">
        <div class="main-column">
            <div class="card viewer-card" class:drag-over={isDraggingFile}
                role="region" aria-label="Image viewer. Drop an image file here to load it."
                ondragover={onViewerDragOver}
                ondragleave={() => isDraggingFile = false}
                ondrop={onViewerDrop}>
            <div class="canvas-wrapper" id="viewer-container">
                <div class="viewer-canvas-header">
                    <div class="view-mode-toggle" role="group" aria-label="What to show">
                        {#each viewModes as mode}
                        <button class:active={appState.currentViewMode === mode.val} aria-pressed={appState.currentViewMode === mode.val}
                            title={mode.title}
                            disabled={!appState.originalImageData}
                            onclick={() => appState.currentViewMode = mode.val}>
                            {mode.label}
                        </button>
                        {/each}
                    </div>
                    {#if isChroma}
                    <button class="zoom-ctrl-btn" class:active={appState.tintEnabled} aria-pressed={appState.tintEnabled}
                        title="Colour the chroma channel. Off shows it in grayscale, where fine detail is easier to see."
                        onclick={() => appState.tintEnabled = !appState.tintEnabled}>
                        Tint
                    </button>
                    {/if}

                    <div class="viewer-zoom-controls">
                        {#if zoom > 1}
                        <button class="zoom-ctrl-btn zoom-out-btn" onclick={resetZoom} title="Reset zoom (Esc)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                <line x1="8" y1="11" x2="14" y2="11"/>
                            </svg>
                            {zoom.toFixed(0)}×
                        </button>
                        {:else}
                        <button class="zoom-ctrl-btn" class:active={isZoomMode} aria-pressed={isZoomMode}
                            onclick={toggleZoomMode}
                            disabled={!appState.originalImageData}
                            title={isZoomMode ? 'Exit zoom mode (Esc)' : 'Zoom: click the image to zoom in'}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                {#if !isZoomMode}<line x1="11" y1="8" x2="11" y2="14"/>{/if}
                                <line x1="8" y1="11" x2="14" y2="11"/>
                            </svg>
                            Zoom
                        </button>
                        {/if}
                        <button class="zoom-ctrl-btn" onclick={downloadProcessed}
                            disabled={!appState.originalImageData}
                            title="Download the compressed image as PNG" aria-label="Download PNG">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <ImageViewer
                    id="viewer"
                    style="width: 100%"
                    bind:originalCanvas
                    bind:processedCanvas
                    originalLabel="Original image"
                    processedLabel="Compressed image, {transformInfo(appState.transformType).label} at quality {appState.quality}"
                    {viewType}
                    bind:comparisonPercent={appState.comparisonPercent}
                    bind:isZoomMode
                    bind:zoom
                    bind:zoomOriginX
                    bind:zoomOriginY
                    zoomHint="Click image to zoom in &nbsp;·&nbsp; drag to use comparison slider &nbsp;·&nbsp; Esc to exit"
                    onViewerMouseDown={onViewerMouseDown}
                    onViewerClick={onViewerClick}
                />

                {#if appState.originalImageData}
                {#if viewType === 'comparison'}
                <div class="split-labels" aria-hidden="true">
                    <span>Original</span>
                    <span>{processedCaption}</span>
                </div>
                {:else}
                <p class="viewer-note">
                    Wavelet pyramid of the luma channel: the top-left thumbnail is the coarse
                    approximation; each ring of quadrants holds detail at one scale. Black was quantized to zero.
                </p>
                {/if}
                {/if}

                <div class="go-deeper">
                    {#if !wavelet}
                    <button class="go-deeper-btn" onclick={enterInspectorMode} disabled={!appState.originalImageData}>
                        <strong>Inspect a block</strong>
                        <span>Follow one 8×8 block through DCT, quantization and back</span>
                    </button>
                    {/if}
                    <button class="go-deeper-btn" onclick={() => appState.appMode = 'artifact_inspector'} disabled={!appState.originalImageData}>
                        <strong>Analyze artifacts</strong>
                        <span>Map where detail was lost: error, ringing, blocking</span>
                    </button>
                </div>
            </div>
        </div>

        <CompareCard series={rdSeries} {rdLoading} {rdError} sampleCount={RD_QUALITIES.length} />
        </div>

        <aside class="card controls controls-card">
            <section class="viewer-section">
                <h2 class="viewer-section-title">Image</h2>
                <div class="viewer-section-body">
                    <ImageSourcePanel activeTestImageIndex={appState.activeTestImage}
                        onFile={loadFile} onTestImage={loadTestImage} />
                </div>
            </section>

            <section class="viewer-section">
                <h2 class="viewer-section-title">Compression</h2>
                <div class="viewer-section-body">
                    <QualityControl idPrefix="quality" onPreview={previewQuality} />
                    <CodecSettings idPrefix="v" />
                </div>
            </section>

            <section class="viewer-section">
                <h2 class="viewer-section-title">Result</h2>
                <div class="viewer-section-body">
                    <ResultSummary />
                </div>
            </section>

            <p class="kbd-hint"><kbd>[</kbd> <kbd>]</kbd> quality ±5 · <kbd>T</kbd> next transform</p>
        </aside>

    </div>
</div>
