<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { appState, ViewMode, type ViewModeValue } from './lib/state.svelte.js';
    import { processImage, getViewPtr, getStats, free, setViewTint, getLastBitEstimate } from './lib/wasm-bridge.js';
    import { handleFileSelect, loadImageFromUrl } from './lib/image-manager.js';
    import { formatBytes } from './lib/format.js';
    import ImageViewer from './lib/components/ImageViewer.svelte';
    import AppHeader from './lib/components/viewer/AppHeader.svelte';
    import RdChart, { type RdPoint } from './lib/components/viewer/RdChart.svelte';
    import CoeffHistogram from './lib/components/viewer/CoeffHistogram.svelte';
    import ImageSourcePanel from './lib/components/viewer/ImageSourcePanel.svelte';
    import CodecControls from './lib/components/viewer/CodecControls.svelte';
    import MetricsPanel from './lib/components/viewer/MetricsPanel.svelte';
    import ToolsPanel from './lib/components/viewer/ToolsPanel.svelte';

    let originalCanvas: HTMLCanvasElement | undefined = $state();
    let processedCanvas: HTMLCanvasElement | undefined = $state();
    let dropZoneVisible = $state(!appState.originalImageData);
    let rdPointsDct = $state<RdPoint[]>([]);
    let rdPointsDwt = $state<RdPoint[]>([]);
    let rdLoading = $state(false);
    let rdError = $state('');
    let rdJobId = 0;
    const RD_QUALITIES = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
    const RD_REBUILD_DEFER_MS = 250;

    type BlockCoord = { x: number; y: number } | null;
    let originalCtx: CanvasRenderingContext2D | null = null;
    let processedCtx: CanvasRenderingContext2D | null = null;
    let processedImageData: ImageData | null = null;
    let renderedOriginalImageRef: ImageData | null = null;
    let lastOverlayBlock: BlockCoord = null;
    let overlayRafId = 0;
    let pendingOverlayBlock: BlockCoord = null;
    let rdDeferTimer: ReturnType<typeof setTimeout> | null = null;
    let rdIdleHandle: number | null = null;

    // ===== Zoom =====
    const ZOOM_LEVEL = 3;
    let isZoomMode = $state(false);
    let zoom = $state(1);
    let zoomOriginX = $state(50); // % of canvas
    let zoomOriginY = $state(50);
    let viewerToggle = $state<'comparison' | 'original' | 'processed'>('comparison');

    // Keep comparisonPercent in sync with toggle
    $effect(() => {
        if (viewerToggle === 'original') {
            appState.comparisonPercent = 100;
        } else if (viewerToggle === 'processed') {
            appState.comparisonPercent = 0;
        } else if (viewerToggle === 'comparison') {
            // Restore center split by default when switching back to comparison
            // or we could keep its last dragged value. User said "Set default view to comparison mode"
            // so we set it to 50 when first entering or switching.
            if (appState.comparisonPercent === 100 || appState.comparisonPercent === 0) {
                appState.comparisonPercent = 50;
            }
        }
    });

    // Handle view toggle dragging vs clicking
    // If user drags the slider, we should switch to 'comparison' mode automatically
    $effect(() => {
        const p = appState.comparisonPercent;
        if (p > 0 && p < 100 && viewerToggle !== 'comparison') {
            viewerToggle = 'comparison';
        }
    });

    function toggleZoomMode() {
        isZoomMode = !isZoomMode;
        if (!isZoomMode) { zoom = 1; }
    }

    function resetZoom() {
        zoom = 1;
    }

    onMount(() => {
        // Ensure we're in a view mode supported by the viewer UI
        const viewerModes: ViewModeValue[] = [ViewMode.RGB, ViewMode.Artifacts, ViewMode.Y, ViewMode.Cr, ViewMode.Cb];
        if (!viewerModes.includes(appState.currentViewMode)) {
            appState.currentViewMode = ViewMode.RGB;
        }

        if (appState.wasmReady && appState.originalImageData) {
            // Ensure drop zone is hidden
            dropZoneVisible = false;

            // Reset toggle when returning
            viewerToggle = 'comparison';

            // Render to the new canvas elements
            render();

            // Update UI state
            updateFileSizeEstimate();
        }
    });

    onDestroy(() => {
        rdJobId++;
        cancelOverlayDraw();
        clearRdScheduling();
    });

    // ===== Render =====

    function isSameBlock(a: BlockCoord, b: BlockCoord): boolean {
        return !!a && !!b && a.x === b.x && a.y === b.y;
    }

    function ensureCanvasResources(): boolean {
        if (!originalCanvas || !processedCanvas || !appState.originalImageData) return false;

        const width = appState.imgWidth;
        const height = appState.imgHeight;
        const resized = processedCanvas.width !== width || processedCanvas.height !== height ||
            originalCanvas.width !== width || originalCanvas.height !== height;

        if (resized) {
            processedCanvas.width = width;
            processedCanvas.height = height;
            originalCanvas.width = width;
            originalCanvas.height = height;
            renderedOriginalImageRef = null;
            lastOverlayBlock = null;
        }

        if (!originalCtx) originalCtx = originalCanvas.getContext('2d');
        if (!processedCtx) processedCtx = processedCanvas.getContext('2d', { willReadFrequently: true });
        if (!originalCtx || !processedCtx) return false;

        if (!processedImageData || processedImageData.width !== width || processedImageData.height !== height) {
            processedImageData = new ImageData(width, height);
        }
        return true;
    }

    function drawOriginalBaseImage(force = false): void {
        if (!originalCtx || !appState.originalImageData) return;
        if (!force && renderedOriginalImageRef === appState.originalImageData) return;
        originalCtx.putImageData(appState.originalImageData, 0, 0);
        renderedOriginalImageRef = appState.originalImageData;
        lastOverlayBlock = null;
    }

    function restoreBlock(block: BlockCoord): void {
        if (!block || !originalCtx || !appState.originalImageData) return;
        originalCtx.putImageData(appState.originalImageData, 0, 0, block.x * 8, block.y * 8, 8, 8);
    }

    function applyOverlayBlock(block: BlockCoord): void {
        if (!originalCtx || !appState.originalImageData) return;

        if (isSameBlock(block, lastOverlayBlock)) return;
        if (lastOverlayBlock) restoreBlock(lastOverlayBlock);
        if (block) {
            restoreBlock(block);
            originalCtx.strokeStyle = '#ff0000';
            originalCtx.lineWidth = 1;
            originalCtx.strokeRect(block.x * 8, block.y * 8, 8, 8);
        }
        lastOverlayBlock = block ? { ...block } : null;
    }

    function cancelOverlayDraw(): void {
        if (overlayRafId) cancelAnimationFrame(overlayRafId);
        overlayRafId = 0;
        pendingOverlayBlock = null;
    }

    function scheduleOverlayDraw(block: BlockCoord): void {
        pendingOverlayBlock = block ? { ...block } : null;
        if (overlayRafId) return;
        overlayRafId = requestAnimationFrame(() => {
            overlayRafId = 0;
            if (!appState.isInspectMode) return;
            applyOverlayBlock(pendingOverlayBlock);
        });
    }

    function render() {
        if (!appState.wasmReady || !appState.originalImageData || !processedCanvas) return;
        if (!ensureCanvasResources() || !processedCtx || !processedImageData) return;

        let outputPtr = 0;
        try {
            outputPtr = getViewPtr(appState.currentViewMode);
            if (!outputPtr) throw new Error('WASM get_view_ptr returned null');

            const targetBuffer = processedImageData.data;
            const rgbaSize = targetBuffer.length;
            const sourceView = new Uint8ClampedArray(Module.HEAPU8.buffer, outputPtr, rgbaSize);
            targetBuffer.set(sourceView);
            processedCtx.putImageData(processedImageData, 0, 0);

            const stats = getStats();
            appState.psnr = { y: stats.psnr.y, cr: stats.psnr.cr, cb: stats.psnr.cb };
            appState.ssim = { y: stats.ssim.y, cr: stats.ssim.cr, cb: stats.ssim.cb };

            drawOriginalBaseImage();
            if (appState.isInspectMode) applyOverlayBlock(appState.highlightBlock);
        } catch (err) {
            console.error('Render error:', err);
        } finally {
            if (outputPtr) free(outputPtr);
        }
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

    // ===== File loading =====

    function loadFile(file: File) {
        if (!file || !file.type.startsWith('image/')) return;
        if (!originalCanvas || !processedCanvas) return;
        handleFileSelect(file, originalCanvas, processedCanvas, () => {
            activeTestImageIndex = null;
            appState.quality = 50;
            processImage(50, appState.currentCsMode);
            appState.comparisonPercent = 50;
            render();
            updateFileSizeEstimate();
            dropZoneVisible = false;
        });
    }

    let activeTestImageIndex = $state<number | null>(null);

    function loadTestImage(index: number) {
        if (!appState.wasmReady || !originalCanvas || !processedCanvas) return;
        loadImageFromUrl(`/test-images/${index}.png`, originalCanvas, processedCanvas, () => {
            activeTestImageIndex = index;
            appState.quality = 50;
            processImage(50, appState.currentCsMode);
            appState.comparisonPercent = 50;
            render();
            updateFileSizeEstimate();
            dropZoneVisible = false;
        });
    }

    // ===== Comparison slider =====

    function updateComparisonView(percent: number) {
        appState.comparisonPercent = Math.max(0, Math.min(100, percent));
    }

    let isDraggingComparison = false;
    // Track whether the pointer moved enough to count as a drag vs. a click
    let mouseDownClientX = 0;
    let hasDraggedSinceDown = false;

    function onViewerMouseDown(e: MouseEvent) {
        mouseDownClientX = e.clientX;
        hasDraggedSinceDown = false;
        if (appState.isInspectMode || isZoomMode) return;
        isDraggingComparison = true;
        handleViewerInteraction(e.clientX);
    }

    function onDocumentMouseMove(e: MouseEvent) {
        if (Math.abs(e.clientX - mouseDownClientX) > 4) hasDraggedSinceDown = true;
        // In zoom mode, start comparison drag as soon as the threshold is met
        if (isZoomMode && !isDraggingComparison && hasDraggedSinceDown &&
            !appState.isInspectMode && e.buttons === 1) {
            isDraggingComparison = true;
        }
        if (isDraggingComparison) {
            handleViewerInteraction(e.clientX);
        }
        if (appState.isInspectMode && appState.originalImageData && processedCanvas) {
            const rect = processedCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const imgX = Math.floor(x * (appState.imgWidth / rect.width));
            const imgY = Math.floor(y * (appState.imgHeight / rect.height));
            let nextBlock: BlockCoord = null;
            if (imgX < 0 || imgX >= appState.imgWidth || imgY < 0 || imgY >= appState.imgHeight) {
                nextBlock = null;
            } else {
                nextBlock = { x: Math.floor(imgX / 8), y: Math.floor(imgY / 8) };
            }
            if (isSameBlock(nextBlock, appState.highlightBlock)) return;
            appState.highlightBlock = nextBlock ? { ...nextBlock } : null;
            scheduleOverlayDraw(nextBlock);
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
        updateComparisonView((x / rect.width) * 100);
    }

    function onViewerClick(e: MouseEvent) {
        if (isZoomMode && !hasDraggedSinceDown) {
            if (zoom > 1) {
                resetZoom();
            } else if (originalCanvas) {
                const rect = originalCanvas.getBoundingClientRect();
                zoomOriginX = ((e.clientX - rect.left) / rect.width) * 100;
                zoomOriginY = ((e.clientY - rect.top) / rect.height) * 100;
                zoom = ZOOM_LEVEL;
            }
            return;
        }
        if (appState.isInspectMode && appState.highlightBlock && appState.wasmReady) {
            appState.inspectedBlock = { ...appState.highlightBlock };
            appState.appMode = 'inspector';
            appState.isInspectMode = true;
            appState.transformType = 0;
        }
    }

    function enterInspectorMode() {
        appState.appMode = 'inspector';
        appState.isInspectMode = true;
        appState.transformType = 0;
    }

    function onViewerMouseLeave() {
        if (!appState.highlightBlock) return;
        appState.highlightBlock = null;
        if (appState.isInspectMode) scheduleOverlayDraw(null);
    }

    // ===== File size estimate =====

    function updateFileSizeEstimate() {
        if (!appState.wasmReady || !appState.originalImageData) return;

        const w = appState.imgWidth;
        const h = appState.imgHeight;
        const totalPixels = w * h;
        const originalBytes = totalPixels * 3;
        
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

    async function rebuildRdCurve() {
        if (!appState.wasmReady || !appState.originalImageData) return;

        const jobId = ++rdJobId;
        rdLoading = true;
        rdError = '';

        const pointsDct: RdPoint[] = [];
        const pointsDwt: RdPoint[] = [];

        try {
            // Process DCT (0) and DWT (1)
            for (const tType of [0, 1]) {
                for (let i = 0; i < RD_QUALITIES.length; i++) {
                    if (jobId !== rdJobId) return;

                    const quality = RD_QUALITIES[i];
                    processImage(quality, appState.currentCsMode, tType);
                    const stats = getStats();
                    const bits = getLastBitEstimate();
                    const estimatedBytes = bits > 0 ? Math.max(64, Math.round(bits / 8)) : null;
                    if (estimatedBytes) {
                        const pt = {
                            quality,
                            psnr: stats.psnr.y,
                            estimatedBytes,
                            bitrate: (estimatedBytes * 8) / (appState.imgWidth * appState.imgHeight)
                        };
                        if (tType === 0) pointsDct.push(pt);
                        else pointsDwt.push(pt);
                    }

                    // Yield after every encode so the event loop can process slider/UI events
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            if (jobId === rdJobId) {
                rdPointsDct = pointsDct.sort((a, b) => a.bitrate - b.bitrate);
                rdPointsDwt = pointsDwt.sort((a, b) => a.bitrate - b.bitrate);
            }
        } catch (error) {
            console.error('RD curve generation error:', error);
            if (jobId === rdJobId) {
                rdError = 'Unable to generate RD curve.';
                rdPointsDct = [];
                rdPointsDwt = [];
            }
        } finally {
            if (jobId === rdJobId) {
                processImage(appState.quality, appState.currentCsMode);
                render();
                updateFileSizeEstimate();
                rdLoading = false;
            }
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

    // Reset RD curve when image changes (but don't auto-generate — user must click)
    $effect(() => {
        const _ready = appState.wasmReady;
        const _image = appState.originalImageData;
        clearRdScheduling();
        rdJobId++;
        rdPointsDct = [];
        rdPointsDwt = [];
        rdLoading = false;
        rdError = '';
    });

    // ===== Keyboard shortcuts =====

    function onDocumentKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            if (zoom > 1) { zoom = 1; }
            if (isZoomMode) { isZoomMode = false; }
        }
    }

</script>

<svelte:document onmousemove={onDocumentMouseMove} onmouseup={onDocumentMouseUp} onkeydown={onDocumentKeyDown} />

<!-- ===== VIEWER MODE ===== -->
<div id="viewerMode">

    <AppHeader />

    <div class="container">
        <div class="main-column">
            <div class="card viewer-card">
            <div class="canvas-wrapper" id="viewer-container">
                {#if appState.originalImageData && !appState.isInspectMode}
                <div class="viewer-canvas-header">
                    <div class="canvas-header-left">
                        <div class="img-dim-info">
                            <span class="dim-val">{appState.imgWidth}</span>
                            <span class="dim-sep">×</span>
                            <span class="dim-val">{appState.imgHeight}</span>
                            <span class="dim-unit">px</span>
                        </div>
                    </div>

                    <div class="canvas-header-center">
                        <div class="view-mode-toggle">
                            <button class:active={viewerToggle === 'comparison'} onclick={() => viewerToggle = 'comparison'}>
                                Comparison
                            </button>
                            <button class:active={viewerToggle === 'original'} onclick={() => viewerToggle = 'original'}>
                                Original
                            </button>
                            <button class:active={viewerToggle === 'processed'} onclick={() => viewerToggle = 'processed'}>
                                Processed
                            </button>
                        </div>
                    </div>

                    <div class="canvas-header-right">
                        <div class="viewer-zoom-controls">
                            {#if zoom > 1}
                            <span class="zoom-level-chip">{zoom.toFixed(0)}×</span>
                            <button class="zoom-ctrl-btn zoom-out-btn" onclick={resetZoom} title="Reset zoom (Esc)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="11" cy="11" r="8"/>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                    <line x1="8" y1="11" x2="14" y2="11"/>
                                </svg>
                                Zoom out
                            </button>
                            {:else}
                            <button class="zoom-ctrl-btn" class:active={isZoomMode}
                                onclick={toggleZoomMode}
                                title={isZoomMode ? 'Exit zoom mode (Esc)' : 'Zoom mode — click image to zoom in'}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="11" cy="11" r="8"/>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                    {#if !isZoomMode}<line x1="11" y1="8" x2="11" y2="14"/>{/if}
                                    <line x1="8" y1="11" x2="14" y2="11"/>
                                </svg>
                                {isZoomMode ? 'Zoom ON' : 'Zoom'}
                            </button>
                            {/if}
                        </div>
                    </div>
                </div>
                {/if}


                <ImageViewer
                    id="viewer"
                    style="width: 100%"
                    bind:originalCanvas
                    bind:processedCanvas
                    viewType={viewerToggle}
                    bind:comparisonPercent={appState.comparisonPercent}
                    bind:isZoomMode
                    bind:zoom
                    bind:zoomOriginX
                    bind:zoomOriginY
                    isInspectMode={appState.isInspectMode}
                    bind:highlightBlock={appState.highlightBlock}
                    showInspectorBanner={true}
                    showQuickstart={true}
                    zoomHint="Click image to zoom in &nbsp;·&nbsp; drag to use comparison slider &nbsp;·&nbsp; Esc to exit"
                    onViewerMouseDown={onViewerMouseDown}
                    onViewerClick={onViewerClick}
                    onViewerMouseLeave={onViewerMouseLeave}
                    onEnterInspector={enterInspectorMode}
                />
            </div>
        </div>

        <RdChart {rdPointsDct} {rdPointsDwt} {rdLoading} {rdError}
            sampleCount={RD_QUALITIES.length}
            onGenerate={() => void rebuildRdCurve()} />

        <CoeffHistogram />
        </div>
        <div class="card controls controls-card">
            <!-- Drop Zone / Onboarding -->
            <details class="viewer-section" open>
                <summary class="viewer-section-title">Basic</summary>
                <div class="viewer-section-body">
                    <ImageSourcePanel bind:dropZoneVisible {activeTestImageIndex}
                        onFile={loadFile} onTestImage={loadTestImage} />
                    <CodecControls />
                </div>
            </details>

            <MetricsPanel />

            <ToolsPanel onEnterInspector={enterInspectorMode} />
        </div>

    </div>
</div>
