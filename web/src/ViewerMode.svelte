<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { appState, ViewMode } from './lib/state.svelte.js';
    import { processImage, getViewPtr, getStats, free, setViewTint, inspectBlockData } from './lib/wasm-bridge.js';
    import { handleFileSelect } from './lib/image-manager.js';
    import { inspectBlock } from './lib/inspection.js';
    import ImageViewer from './lib/components/ImageViewer.svelte';

    let originalCanvas: HTMLCanvasElement;
    let processedCanvas: HTMLCanvasElement;
    let dropZoneVisible = $state(!appState.originalImageData);
    type RdPoint = {
        quality: number;
        psnr: number;
        bitrate: number;
        estimatedBytes: number;
    };
    let rdPoints = $state<RdPoint[]>([]);
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
    let qualitySliderValue = $state(appState.quality);
    let isQualitySliderInteracting = false;

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
        const viewerModes = [ViewMode.RGB, ViewMode.Artifacts, ViewMode.Y, ViewMode.Cr, ViewMode.Cb];
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

    // Process + render on quality or CS change.
    $effect(() => {
        const q = appState.quality;
        const cs = appState.currentCsMode;
        if (!appState.wasmReady || !appState.originalImageData) return;
        processImage(q, cs);
        render();
        updateFileSizeEstimate();
        if (appState.inspectedBlock && appState.appMode === 'inspector') {
            inspectBlock(appState.inspectedBlock.x, appState.inspectedBlock.y);
        }
    });

    // Keep slider UI in sync with committed quality changes from non-slider actions.
    $effect(() => {
        const q = appState.quality;
        if (!isQualitySliderInteracting) qualitySliderValue = q;
    });

    // Just re-render on view mode change (no reprocessing)
    $effect(() => {
        const _vm = appState.currentViewMode;
        if (appState.wasmReady && appState.originalImageData) {
            render();
            if (appState.inspectedBlock && appState.appMode === 'inspector') {
                inspectBlock(appState.inspectedBlock.x, appState.inspectedBlock.y);
            }
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
        handleFileSelect(file, originalCanvas, processedCanvas, () => {
            appState.quality = 50;
            processImage(50, appState.currentCsMode);
            appState.comparisonPercent = 50;
            render();
            updateFileSizeEstimate();
            dropZoneVisible = false;
        });
    }

    function onFileInput(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) loadFile(file);
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        dropZoneVisible = false;
        const file = e.dataTransfer?.files[0];
        if (file) loadFile(file);
    }

    function openFilePicker() {
        document.getElementById('fileInput')?.click();
    }

    function onDropZoneKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFilePicker();
        }
    }

    // ===== Comparison slider =====

    function updateComparisonView(percent: number) {
        appState.comparisonPercent = Math.max(0, Math.min(100, percent));
    }

    function onQualitySliderInput(event: Event): void {
        const nextValue = Number((event.target as HTMLInputElement).value);
        qualitySliderValue = nextValue;
        isQualitySliderInteracting = true;
    }

    function commitQualitySlider(): void {
        isQualitySliderInteracting = false;
        if (appState.quality !== qualitySliderValue) {
            appState.quality = qualitySliderValue;
        }
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
        if (isDraggingComparison) {
            handleViewerInteraction(e.clientX);
        }
        // In zoom mode, allow comparison slider via drag even while zoomed
        if (isZoomMode && !isDraggingComparison && hasDraggedSinceDown &&
            !appState.isInspectMode && e.buttons === 1) {
            isDraggingComparison = true;
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
        const rect = processedCanvas.getBoundingClientRect();
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
        }
    }


    function enterInspectorMode() {
        appState.appMode = 'inspector';
        appState.isInspectMode = true;
    }

    function onViewerMouseLeave() {
        if (!appState.highlightBlock) return;
        appState.highlightBlock = null;
        if (appState.isInspectMode) scheduleOverlayDraw(null);
    }

    // ===== Inspect toggle =====

    function onInspectToggle(e: Event) {
        const checked = (e.target as HTMLInputElement).checked;
        if (checked) {
            appState.isInspectMode = true;
            drawOriginalBaseImage(true);
            applyOverlayBlock(appState.highlightBlock);
        } else {
            appState.isInspectMode = false;
            appState.highlightBlock = null;
            appState.inspectedBlock = null;
            cancelOverlayDraw();
            drawOriginalBaseImage(true);
        }
    }

    // ===== File size estimate =====

    function formatBytes(bytes: number): string {
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    }

    function estimateFileSizeBytesForQuality(quality: number): number | null {
        if (!appState.wasmReady || !appState.originalImageData) return null;

        const w = appState.imgWidth;
        const h = appState.imgHeight;
        const blocksX = Math.floor(w / 8);
        const blocksY = Math.floor(h / 8);
        const totalBlocks = blocksX * blocksY;
        if (totalBlocks === 0) return null;

        const sampleCount = Math.min(16, totalBlocks);
        let totalZeros = 0;
        const sampledIndices = new Set<number>();

        for (let i = 0; i < sampleCount; i++) {
            const idx = Math.floor((i / sampleCount) * totalBlocks);
            if (sampledIndices.has(idx)) continue;
            sampledIndices.add(idx);
            try {
                const ptr = inspectBlockData(idx % blocksX, Math.floor(idx / blocksX), 0, quality);
                if (!ptr) continue;
                const blockSize = 64;
                const startBytes = ptr + (3 * blockSize * 8);
                const dataView = new DataView(Module.HEAPU8.buffer);
                let zeros = 0;
                for (let j = 0; j < blockSize; j++) {
                    if (Math.abs(dataView.getFloat64(startBytes + (j * 8), true)) < 0.5) zeros++;
                }
                totalZeros += zeros;
            } catch { /* skip */ }
        }

        const actualSampled = sampledIndices.size;
        if (actualSampled === 0) return null;

        const avgZeroRatio = totalZeros / (actualSampled * 64);
        const bitsPerNonZero = 4.5;
        const totalCoefficients = totalBlocks * 64 * 3;
        const estimatedBits = totalCoefficients * (1 - avgZeroRatio) * bitsPerNonZero;
        const headerOverhead = 600;
        let estimatedBytes = Math.round(estimatedBits / 8) + headerOverhead;

        if (appState.currentCsMode === 422) estimatedBytes = Math.round(estimatedBytes * 0.75);
        else if (appState.currentCsMode === 420) estimatedBytes = Math.round(estimatedBytes * 0.6);
        estimatedBytes = Math.max(estimatedBytes, headerOverhead + 100);
        return estimatedBytes;
    }

    function updateFileSizeEstimate() {
        if (!appState.wasmReady || !appState.originalImageData) return;

        const w = appState.imgWidth;
        const h = appState.imgHeight;
        const totalPixels = w * h;
        const originalBytes = totalPixels * 3;
        const estimatedBytes = estimateFileSizeBytesForQuality(appState.quality);
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

        const points: RdPoint[] = [];
        try {
            for (let i = 0; i < RD_QUALITIES.length; i++) {
                if (jobId !== rdJobId) return;

                const quality = RD_QUALITIES[i];
                processImage(quality, appState.currentCsMode);
                const stats = getStats();
                const estimatedBytes = estimateFileSizeBytesForQuality(quality);
                if (estimatedBytes) {
                    points.push({
                        quality,
                        psnr: stats.psnr.y,
                        estimatedBytes,
                        bitrate: (estimatedBytes * 8) / (appState.imgWidth * appState.imgHeight)
                    });
                }

                // Yield after every encode so the event loop can process slider/UI events
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (jobId === rdJobId) {
                rdPoints = points.sort((a, b) => a.bitrate - b.bitrate);
            }
        } catch (error) {
            console.error('RD curve generation error:', error);
            if (jobId === rdJobId) {
                rdError = 'Unable to generate RD curve.';
                rdPoints = [];
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
        rdPoints = [];
        rdLoading = false;
        rdError = '';
    });

    type MetricState = 'good' | 'moderate' | 'poor';

    function getPsnrState(value: number): MetricState {
        if (value >= 40) return 'good';
        if (value >= 30) return 'moderate';
        return 'poor';
    }

    function getSsimState(value: number): MetricState {
        if (value >= 0.95) return 'good';
        if (value >= 0.9) return 'moderate';
        return 'poor';
    }

    function getStateLabel(state: MetricState): string {
        if (state === 'good') return 'Strong';
        if (state === 'moderate') return 'Fair';
        return 'Weak';
    }

    function getStateTrend(state: MetricState): string {
        if (state === 'good') return '↑';
        if (state === 'moderate') return '→';
        return '↓';
    }

    function smoothSvgPath(pts: {x: number, y: number}[]): string {
        if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x},${pts[0].y}` : '';
        let d = `M ${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            const cpx = (p0.x + p1.x) / 2;
            d += ` C ${cpx},${p0.y} ${cpx},${p1.y} ${p1.x},${p1.y}`;
        }
        return d;
    }

    // ===== Keyboard shortcuts =====

    function onDocumentKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            if (zoom > 1) { zoom = 1; }
            if (isZoomMode) { isZoomMode = false; }
        }
    }

    // ===== Theme toggle =====

    let isDarkTheme = $state(
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'dark'
    );

    function toggleTheme() {
        if (isDarkTheme) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
        isDarkTheme = !isDarkTheme;
    }
</script>

<svelte:document onmousemove={onDocumentMouseMove} onmouseup={onDocumentMouseUp} onkeydown={onDocumentKeyDown} />

<!-- ===== VIEWER MODE ===== -->
<div id="viewerMode">

    <header>
        <h1>WASM Codec Explorer</h1>
        <div class="header-badges">
            <div class="privacy-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>Processed locally on your device</span>
            </div>
            <a href="https://github.com/thundermage117/codec" class="github-link" target="_blank" rel="noopener noreferrer">
                <img src="/assets/GitHub_Invertocat_Black.svg" alt="GitHub Logo" width="16" height="16">
                <span>View Source on GitHub</span>
            </a>
            <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" onclick={toggleTheme}>
                <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"
                    style={isDarkTheme ? 'display:none' : 'display:block'}>
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"
                    style={isDarkTheme ? 'display:block' : 'display:none'}>
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
            </button>
        </div>
    </header>

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

        <div class="card rd-card">
            <section class="rd-chart-panel" aria-live="polite">
                <div class="rd-chart-header">
                    <div>
                        <h3>Rate-Distortion Curve</h3>
                        <p>Quality tradeoff: higher bitrate usually improves PSNR.</p>
                    </div>
                    {#if rdLoading}
                    <span class="rd-chart-status">Sampling…</span>
                    {:else if rdPoints.length > 0}
                    <span class="rd-chart-status">{rdPoints.length} points</span>
                    {/if}
                    {#if appState.originalImageData && !rdLoading}
                    <button class="tool-btn" onclick={() => void rebuildRdCurve()} style="margin-left: auto;">
                        {rdPoints.length > 0 ? 'Regenerate' : 'Generate'}
                    </button>
                    {/if}
                </div>

                {#if !appState.originalImageData}
                <div class="rd-chart-empty">Load an image to generate an RD plot.</div>
                {:else if rdError}
                <div class="rd-chart-empty">{rdError}</div>
                {:else if rdLoading && rdPoints.length === 0}
                <div class="rd-chart-empty">Sampling {RD_QUALITIES.length} quality levels…</div>
                {:else if rdPoints.length === 0}
                <div class="rd-chart-empty">Click Generate to compute the rate-distortion curve.</div>
                {:else if rdPoints.length >= 2}
                {@const svgW = 700}
                {@const svgH = 280}
                {@const padL = 64}
                {@const padR = 20}
                {@const padT = 18}
                {@const padB = 52}
                {@const xMinRaw = Math.min(...rdPoints.map((p) => p.bitrate))}
                {@const xMaxRaw = Math.max(...rdPoints.map((p) => p.bitrate))}
                {@const yMinRaw = Math.min(...rdPoints.map((p) => p.psnr))}
                {@const yMaxRaw = Math.max(...rdPoints.map((p) => p.psnr))}
                {@const xPad = Math.max(0.05, (xMaxRaw - xMinRaw) * 0.08)}
                {@const yPad = Math.max(0.5, (yMaxRaw - yMinRaw) * 0.12)}
                {@const xMin = xMinRaw - xPad}
                {@const xMax = xMaxRaw + xPad}
                {@const yMin = yMinRaw - yPad}
                {@const yMax = yMaxRaw + yPad}
                {@const chartW = svgW - padL - padR}
                {@const chartH = svgH - padT - padB}
                {@const mapX = (v: number) => padL + ((v - xMin) / (xMax - xMin || 1)) * chartW}
                {@const mapY = (v: number) => svgH - padB - ((v - yMin) / (yMax - yMin || 1)) * chartH}
                {@const xTicks = Array.from({length: 5}, (_, i) => xMinRaw + i * (xMaxRaw - xMinRaw) / 4)}
                {@const yTicks = Array.from({length: 5}, (_, i) => yMinRaw + i * (yMaxRaw - yMinRaw) / 4)}
                {@const pts = rdPoints.map(p => ({ x: mapX(p.bitrate), y: mapY(p.psnr) }))}
                {@const curvePath = smoothSvgPath(pts)}
                {@const fillPath = curvePath + ` L ${pts[pts.length - 1].x},${svgH - padB} L ${pts[0].x},${svgH - padB} Z`}
                {@const currentPoint = rdPoints.reduce((best, p) =>
                    Math.abs(p.quality - appState.quality) < Math.abs(best.quality - appState.quality) ? p : best
                )}
                {@const cpx = mapX(currentPoint.bitrate)}
                {@const cpy = mapY(currentPoint.psnr)}
                <div class="rd-chart-svg-wrap">
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Rate-distortion curve">
                        <defs>
                            <linearGradient id="rdFillGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" style="stop-color: var(--primary); stop-opacity: 0.2;"/>
                                <stop offset="100%" style="stop-color: var(--primary); stop-opacity: 0.01;"/>
                            </linearGradient>
                            <clipPath id="rdClip">
                                <rect x={padL} y={padT} width={chartW} height={chartH + 1}/>
                            </clipPath>
                        </defs>
                        {#each yTicks as tick}
                        <line x1={padL} y1={mapY(tick)} x2={svgW - padR} y2={mapY(tick)} class="rd-grid-line"/>
                        {/each}
                        {#each xTicks as tick}
                        <line x1={mapX(tick)} y1={padT} x2={mapX(tick)} y2={svgH - padB} class="rd-grid-line"/>
                        {/each}
                        <line x1={padL} y1={svgH - padB} x2={svgW - padR} y2={svgH - padB} class="rd-axis-line"/>
                        <line x1={padL} y1={padT} x2={padL} y2={svgH - padB} class="rd-axis-line"/>
                        <path d={fillPath} class="rd-fill" clip-path="url(#rdClip)"/>
                        <path d={curvePath} class="rd-curve-path" clip-path="url(#rdClip)"/>
                        <line x1={cpx} y1={padT} x2={cpx} y2={svgH - padB} class="rd-crosshair"/>
                        <line x1={padL} y1={cpy} x2={svgW - padR} y2={cpy} class="rd-crosshair"/>
                        {#each rdPoints as point}
                        <circle
                            cx={mapX(point.bitrate)}
                            cy={mapY(point.psnr)}
                            r={point.quality === currentPoint.quality ? 5.5 : 3.5}
                            class="rd-point"
                            class:rd-point-current={point.quality === currentPoint.quality}
                            role="button"
                            tabindex="0"
                            aria-label="Set quality to {point.quality}"
                            onclick={() => { appState.quality = point.quality; }}
                            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') appState.quality = point.quality; }}>
                            <title>Q{point.quality} · {point.psnr.toFixed(2)} dB · {point.bitrate.toFixed(2)} bpp</title>
                        </circle>
                        {/each}
                        <text x={cpx} y={Math.max(padT + 12, cpy - 10)} class="rd-point-label rd-axis-text-middle">Q{currentPoint.quality}</text>
                        {#each xTicks as tick}
                        <text x={mapX(tick)} y={svgH - padB + 14} class="rd-axis-text rd-axis-text-middle">{tick.toFixed(2)}</text>
                        {/each}
                        {#each yTicks as tick}
                        <text x={padL - 6} y={mapY(tick) + 4} class="rd-axis-text rd-axis-text-end">{tick.toFixed(1)}</text>
                        {/each}
                        <text x={(padL + svgW - padR) / 2} y={svgH - 4} class="rd-axis-title rd-axis-text-middle">Bitrate (bits per pixel)</text>
                        <text x={14} y={(padT + svgH - padB) / 2} transform={`rotate(-90 14 ${(padT + svgH - padB) / 2})`} class="rd-axis-title rd-axis-text-middle">PSNR Y (dB)</text>
                    </svg>
                </div>

                <div class="rd-current-callout">
                    <div class="rd-callout-item">
                        <span class="rd-callout-label">Quality</span>
                        <span class="rd-callout-value">Q{currentPoint.quality}</span>
                    </div>
                    <div class="rd-callout-sep"></div>
                    <div class="rd-callout-item">
                        <span class="rd-callout-label">Bitrate</span>
                        <span class="rd-callout-value">{currentPoint.bitrate.toFixed(2)} bpp</span>
                    </div>
                    <div class="rd-callout-sep"></div>
                    <div class="rd-callout-item">
                        <span class="rd-callout-label">PSNR Y</span>
                        <span class="rd-callout-value">{currentPoint.psnr.toFixed(2)} dB</span>
                    </div>
                    <div class="rd-callout-sep"></div>
                    <div class="rd-callout-item">
                        <span class="rd-callout-label">Est. size</span>
                        <span class="rd-callout-value">~{formatBytes(currentPoint.estimatedBytes)}</span>
                    </div>
                </div>
                {:else}
                <div class="rd-chart-empty">Need more samples to render an RD curve.</div>
                {/if}
            </section>
        </div>
        </div>
        <div class="card controls controls-card">
            <!-- Drop Zone / Onboarding -->
            <input type="file" id="fileInput" accept="image/*"
                disabled={!appState.wasmReady}
                onchange={onFileInput}
                style="display:none">
            <details class="viewer-section" open>
                <summary class="viewer-section-title">Basic</summary>
                <div class="viewer-section-body">
                    {#if !appState.wasmReady}
                    <div class="stats">
                        <span id="status">{appState.status}</span>
                    </div>
                    {/if}

                    {#if dropZoneVisible}
                    <div class="drop-zone" id="dropZone"
                        role="button"
                        tabindex="0"
                        aria-label="Upload image"
                        onclick={openFilePicker}
                        onkeydown={onDropZoneKeyDown}
                        ondragover={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('drag-over'); }}
                        ondragleave={(e) => (e.currentTarget as HTMLElement).classList.remove('drag-over')}
                        ondrop={onDrop}>
                        <svg class="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <path d="M21 15l-5-5L5 21"></path>
                        </svg>
                        <div class="drop-zone-text">Drop an image here</div>
                        <div class="drop-zone-hint">or <span class="browse-link">browse to upload</span></div>
                    </div>
                    {:else}
                    <button class="tool-btn" onclick={openFilePicker}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="16 16 12 12 8 16"></polyline>
                            <line x1="12" y1="12" x2="12" y2="21"></line>
                            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
                        </svg>
                        Load new image
                    </button>
                    {/if}

                    <div class="control-group">
                        <label for="qualitySlider">
                            Quality <span id="qualityValue">{qualitySliderValue}</span>
                        </label>
                        <div class="preset-group">
                            {#each [{ q: 10, label: 'Low', desc: 'Thumbnails' }, { q: 50, label: 'Medium', desc: 'Web / Social' }, { q: 90, label: 'High', desc: 'Print / Archive' }] as preset}
                            <button class="preset-btn" data-quality={preset.q}
                                class:active={appState.quality === preset.q}
                                disabled={!appState.wasmReady}
                                onclick={() => { appState.quality = preset.q; }}>
                                <span class="preset-label">{preset.label}</span>
                                <span class="preset-desc">{preset.desc}</span>
                            </button>
                            {/each}
                        </div>
                        <input type="range" id="qualitySlider" min="1" max="100"
                            value={qualitySliderValue}
                            oninput={onQualitySliderInput}
                            onchange={commitQualitySlider}
                            onblur={commitQualitySlider}
                            disabled={!appState.wasmReady}>
                    </div>

                    <div class="control-group">
                        <div class="group-label">View Mode</div>
                        <div class="toggle-group">
                            {#each [
                                { id: 'view_rgb', val: ViewMode.RGB, label: 'RGB' },
                                { id: 'view_artifacts', val: ViewMode.Artifacts, label: 'Error' },
                                { id: 'view_y', val: ViewMode.Y, label: 'Y' },
                                { id: 'view_cr', val: ViewMode.Cr, label: 'Cr' },
                                { id: 'view_cb', val: ViewMode.Cb, label: 'Cb' }
                            ] as mode}
                            <input type="radio" id={mode.id} name="view_mode"
                                checked={appState.currentViewMode === mode.val}
                                onchange={() => appState.currentViewMode = mode.val}>
                            <label for={mode.id}>{mode.label}</label>
                            {/each}
                        </div>
                        {#if appState.currentViewMode === ViewMode.Cr || appState.currentViewMode === ViewMode.Cb}
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div class="toggle-group tint-toggle-group" style="flex: 1;">
                                <input type="radio" id="tint_color" name="tint_mode"
                                    checked={appState.tintEnabled}
                                    onchange={() => appState.tintEnabled = true}>
                                <label for="tint_color">Color</label>
                                <input type="radio" id="tint_gray" name="tint_mode"
                                    checked={!appState.tintEnabled}
                                    onchange={() => appState.tintEnabled = false}>
                                <label for="tint_gray">Grayscale</label>
                            </div>
                            <div class="tooltip-container">
                                <span class="info-icon">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="16" x2="12" y2="12"></line>
                                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                    </svg>
                                </span>
                                <div class="tooltip-content">
                                    <strong>Why remove the tint?</strong><br>
                                    The human eye is biologically wired to detect changes in brightness (Luminance) far
                                    better than changes in color (Chrominance). Viewing these channels in grayscale
                                    helps you see fine details and artifacts that get lost in the color tint.
                                </div>
                            </div>
                        </div>
                        {/if}
                    </div>

                    <div class="control-group">
                        <div class="group-label">Chroma Subsampling</div>
                        <div class="toggle-group">
                            {#each [{ id: 'cs_444', val: 444, label: '4:4:4' }, { id: 'cs_422', val: 422, label: '4:2:2' }, { id: 'cs_420', val: 420, label: '4:2:0' }] as cs}
                            <input type="radio" id={cs.id} name="chroma_subsampling"
                                checked={appState.currentCsMode === cs.val}
                                onchange={() => appState.currentCsMode = cs.val}>
                            <label for={cs.id}>{cs.label}</label>
                            {/each}
                        </div>
                    </div>
                </div>
            </details>

            <details class="viewer-section" open>
                <summary class="viewer-section-title">Analysis</summary>
                <div class="viewer-section-body">
                    {#if appState.originalImageData}
                    <div class="compact-metrics-grid">
                        <div class="metric-header-row">
                            <div class="metric-col-label">Channel</div>
                            <div class="metric-col-label">PSNR (dB)</div>
                            <div class="metric-col-label">SSIM</div>
                        </div>
                        {#each [
                            { channel: 'Y', psnr: appState.psnr.y, ssim: appState.ssim.y },
                            { channel: 'Cr', psnr: appState.psnr.cr, ssim: appState.ssim.cr },
                            { channel: 'Cb', psnr: appState.psnr.cb, ssim: appState.ssim.cb }
                        ] as metric}
                        {@const psnrState = getPsnrState(metric.psnr)}
                        {@const ssimState = getSsimState(metric.ssim)}
                        <div class="metric-row">
                            <div class="metric-channel-name">{metric.channel}</div>
                            <div class="metric-cell psnr-cell" class:stat-good={psnrState === 'good'} class:stat-moderate={psnrState === 'moderate'} class:stat-poor={psnrState === 'poor'}>
                                {metric.psnr.toFixed(2)}
                            </div>
                            <div class="metric-cell ssim-cell" class:stat-good={ssimState === 'good'} class:stat-moderate={ssimState === 'moderate'} class:stat-poor={ssimState === 'poor'}>
                                {metric.ssim.toFixed(4)}
                            </div>
                        </div>
                        {/each}
                    </div>

                    {:else}
                    <div class="analysis-placeholder">Load an image to see quality metrics and compression analysis.</div>
                    {/if}

                    {#if appState.fileSizeInfo}
                    <div class="file-size-bar-container" id="fileSizeContainer">
                        <div class="file-size-header">
                            <span class="file-size-title">File Size Comparison</span>
                            <span class="reduction-badge">-{appState.fileSizeInfo.reduction}%</span>
                        </div>
                        <div class="file-size-main">
                            <div class="size-comparison-flow">
                                <span class="size-val secondary">{appState.fileSizeInfo.original}</span>
                                <span class="size-arrow">→</span>
                                <span class="size-val primary highlight">~{appState.fileSizeInfo.estimated}</span>
                            </div>
                        </div>
                        <div class="file-size-track">
                            <div class="file-size-fill" id="fileSizeFill" style="width: {appState.fileSizeInfo.fillPercent}%"></div>
                        </div>
                        <div class="file-size-footer">
                            <span class="compression-ratio-label">{appState.fileSizeInfo.ratio}× compression ratio</span>
                        </div>
                    </div>
                    {/if}
                </div>
            </details>

            <details class="viewer-section" open>
                <summary class="viewer-section-title">Advanced</summary>
                <div class="viewer-section-body">
                    <div class="control-group">
                        <div class="group-label">Tools</div>
                        <button id="inspect_mode_btn" class="tool-btn"
                            class:active={appState.isInspectMode}
                            onclick={enterInspectorMode}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            Inspect Block
                        </button>
                        <button id="artifact_inspector_btn" class="tool-btn"
                            onclick={() => appState.appMode = 'artifact_inspector'}
                            disabled={!appState.originalImageData}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            Artifact Inspector
                        </button>
                        <p class="advanced-hint">Dive deep into compression artifacts, error heatmaps, and edge distortion analysis.</p>
                    </div>
                </div>
            </details>
        </div>

    </div>
</div>
