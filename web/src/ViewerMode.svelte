<script lang="ts">
    import { onMount } from 'svelte';
    import { appState, ViewMode } from './lib/state.svelte.js';
    import { processImage, getViewPtr, getStats, free, setViewTint, inspectBlockData } from './lib/wasm-bridge.js';
    import { handleFileSelect } from './lib/image-manager.js';
    import { inspectBlock } from './lib/inspection.js';

    let originalCanvas: HTMLCanvasElement;
    let processedCanvas: HTMLCanvasElement;
    let dropZoneVisible = $state(!appState.originalImageData);

    onMount(() => {
        if (appState.wasmReady && appState.originalImageData) {
            // Ensure drop zone is hidden
            dropZoneVisible = false;

            // Render to the new canvas elements
            render();

            // Update UI state
            updateFileSizeEstimate();
            updatePresetHighlight(appState.quality);
        }
    });

    // ===== Render =====

    function render() {
        if (!appState.wasmReady || !appState.originalImageData || !processedCanvas) return;

        // Ensure canvas dimensions match image
        if (processedCanvas.width !== appState.imgWidth || processedCanvas.height !== appState.imgHeight) {
            processedCanvas.width = appState.imgWidth;
            processedCanvas.height = appState.imgHeight;
        }
        if (originalCanvas && (originalCanvas.width !== appState.imgWidth || originalCanvas.height !== appState.imgHeight)) {
            originalCanvas.width = appState.imgWidth;
            originalCanvas.height = appState.imgHeight;
        }

        const rgbaSize = appState.imgWidth * appState.imgHeight * 4;
        let outputPtr = 0;
        try {
            outputPtr = getViewPtr(appState.currentViewMode);
            if (!outputPtr) throw new Error('WASM get_view_ptr returned null');

            const dataView = new Uint8ClampedArray(Module.HEAPU8.buffer, outputPtr, rgbaSize);
            const imageData = new ImageData(dataView, appState.imgWidth, appState.imgHeight);
            processedCanvas.getContext('2d', { willReadFrequently: true })!.putImageData(imageData, 0, 0);

            const stats = getStats();
            appState.psnr = { y: stats.psnr.y, cr: stats.psnr.cr, cb: stats.psnr.cb };
            appState.ssim = { y: stats.ssim.y, cr: stats.ssim.cr, cb: stats.ssim.cb };

            // Highlight block overlay on original canvas
            if (originalCanvas) {
                const origCtx = originalCanvas.getContext('2d')!;
                origCtx.putImageData(appState.originalImageData, 0, 0);
                if (appState.isInspectMode && appState.highlightBlock) {
                    origCtx.strokeStyle = '#ff0000';
                    origCtx.lineWidth = 1;
                    origCtx.strokeRect(appState.highlightBlock.x * 8, appState.highlightBlock.y * 8, 8, 8);
                }
            }
        } catch (err) {
            console.error('Render error:', err);
        } finally {
            if (outputPtr) free(outputPtr);
        }
    }

    // ===== Reactive effects =====

    // Process + render on quality or CS change
    $effect(() => {
        const q = appState.quality;
        const cs = appState.currentCsMode;
        if (appState.wasmReady && appState.originalImageData) {
            processImage(q, cs);
            render();
            updateFileSizeEstimate();
            if (appState.inspectedBlock && appState.appMode === 'inspector') {
                inspectBlock(appState.inspectedBlock.x, appState.inspectedBlock.y);
            }
        }
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

    // ===== Comparison slider =====

    function updateComparisonView(percent: number) {
        const clamped = Math.max(0, Math.min(100, percent));
        appState.comparisonPercent = clamped;
        if (processedCanvas) {
            processedCanvas.style.clipPath = `polygon(${clamped}% 0, 100% 0, 100% 100%, ${clamped}% 100%)`;
        }
    }

    function onComparisonSliderInput(e: Event) {
        updateComparisonView(parseFloat((e.target as HTMLInputElement).value));
    }

    let isDraggingComparison = false;

    function onViewerMouseDown(e: MouseEvent) {
        if (appState.isInspectMode) return;
        isDraggingComparison = true;
        handleViewerInteraction(e.clientX);
    }

    function onDocumentMouseMove(e: MouseEvent) {
        if (isDraggingComparison) {
            handleViewerInteraction(e.clientX);
        }
        if (appState.isInspectMode && appState.originalImageData && processedCanvas) {
            const rect = processedCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const imgX = Math.floor(x * (appState.imgWidth / rect.width));
            const imgY = Math.floor(y * (appState.imgHeight / rect.height));
            if (imgX < 0 || imgX >= appState.imgWidth || imgY < 0 || imgY >= appState.imgHeight) {
                appState.highlightBlock = null;
            } else {
                appState.highlightBlock = { x: Math.floor(imgX / 8), y: Math.floor(imgY / 8) };
            }
            render();
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
        if (appState.isInspectMode && appState.highlightBlock && appState.wasmReady) {
            appState.inspectedBlock = { ...appState.highlightBlock };
            appState.appMode = 'inspector';
            appState.isInspectMode = true;
        }
    }

    function onViewerMouseLeave() {
        appState.highlightBlock = null;
        if (appState.isInspectMode) render();
    }

    // ===== Inspect toggle =====

    function onInspectToggle(e: Event) {
        const checked = (e.target as HTMLInputElement).checked;
        if (checked) {
            appState.isInspectMode = true;
        } else {
            appState.isInspectMode = false;
            appState.highlightBlock = null;
            appState.inspectedBlock = null;
            render();
        }
    }

    // ===== Preset highlight =====

    function updatePresetHighlight(quality: number) {
        document.querySelectorAll('.preset-btn:not(.insp-preset-btn)').forEach(btn => {
            const bq = parseInt((btn as HTMLElement).dataset.quality ?? '0');
            btn.classList.toggle('active', bq === quality);
        });
    }

    $effect(() => {
        updatePresetHighlight(appState.quality);
    });

    // ===== File size estimate =====

    function updateFileSizeEstimate() {
        if (!appState.wasmReady || !appState.originalImageData) return;

        const w = appState.imgWidth;
        const h = appState.imgHeight;
        const totalPixels = w * h;
        const originalBytes = totalPixels * 3;
        const blocksX = Math.floor(w / 8);
        const blocksY = Math.floor(h / 8);
        const totalBlocks = blocksX * blocksY;
        if (totalBlocks === 0) return;

        const quality = appState.quality;
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
        if (actualSampled === 0) return;

        const avgZeroRatio = totalZeros / (actualSampled * 64);
        const bitsPerNonZero = 4.5;
        const totalCoefficients = totalBlocks * 64 * 3;
        const estimatedBits = totalCoefficients * (1 - avgZeroRatio) * bitsPerNonZero;
        const headerOverhead = 600;
        let estimatedBytes = Math.round(estimatedBits / 8) + headerOverhead;

        if (appState.currentCsMode === 422) estimatedBytes = Math.round(estimatedBytes * 0.75);
        else if (appState.currentCsMode === 420) estimatedBytes = Math.round(estimatedBytes * 0.6);
        estimatedBytes = Math.max(estimatedBytes, headerOverhead + 100);

        const fmt = (bytes: number) => {
            if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
            if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return bytes + ' B';
        };

        const reduction = Math.max(0, Math.round((1 - estimatedBytes / originalBytes) * 100));
        const ratio = (originalBytes / estimatedBytes).toFixed(1);

        appState.fileSizeInfo = {
            original: fmt(originalBytes),
            estimated: fmt(estimatedBytes),
            reduction,
            ratio,
            fillPercent: Math.max(2, 100 - reduction)
        };
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

<svelte:document onmousemove={onDocumentMouseMove} onmouseup={onDocumentMouseUp} />

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
        <div class="card">
            <div class="canvas-wrapper" id="viewer-container">
                {#if appState.originalImageData && !appState.isInspectMode}
                <div class="viewer-info">
                    {appState.imgWidth} × {appState.imgHeight} px · Click and drag to compare
                </div>
                {/if}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="comparison-viewer"
                    style={appState.isInspectMode ? 'cursor: crosshair' : 'cursor: col-resize'}
                    onmousedown={onViewerMouseDown}
                    onclick={onViewerClick}
                    onmouseleave={onViewerMouseLeave}>
                    <canvas bind:this={originalCanvas} id="originalCanvas"></canvas>
                    <canvas bind:this={processedCanvas} id="processedCanvas"></canvas>
                </div>
                <div class="slider-container" class:disabled={appState.isInspectMode}>
                    <span class="slider-label">Original</span>
                    <input type="range" id="comparisonSlider" class="comparison-slider-input" min="0" max="100"
                        value={appState.comparisonPercent}
                        disabled={appState.isInspectMode}
                        oninput={onComparisonSliderInput}>
                    <span class="slider-label">Processed</span>
                </div>
            </div>
        </div>

        <div class="card controls">
            <!-- Drop Zone / Onboarding -->
            <input type="file" id="fileInput" accept="image/*"
                disabled={!appState.wasmReady}
                onchange={onFileInput}
                style="display:none">
            {#if dropZoneVisible}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="drop-zone" id="dropZone"
                onclick={() => document.getElementById('fileInput')?.click()}
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
            <button class="tool-btn" onclick={() => document.getElementById('fileInput')?.click()}>
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
                    Quality <span id="qualityValue">{appState.quality}</span>
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
                    bind:value={appState.quality}
                    disabled={!appState.wasmReady}>
            </div>

            <div class="control-group">
                <label class="group-label">View Mode</label>
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
                <label class="group-label">Tools</label>
                    <button id="inspect_mode_btn" class="tool-btn"
                        class:active={appState.isInspectMode}
                        onclick={() => {
                            appState.appMode = 'inspector';
                            appState.isInspectMode = true;
                        }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        Inspect Block
                    </button>
            </div>

            <div class="control-group">
                <label class="group-label">Chroma Subsampling</label>
                <div class="toggle-group">
                    {#each [{ id: 'cs_444', val: 444, label: '4:4:4' }, { id: 'cs_422', val: 422, label: '4:2:2' }, { id: 'cs_420', val: 420, label: '4:2:0' }] as cs}
                    <input type="radio" id={cs.id} name="chroma_subsampling"
                        checked={appState.currentCsMode === cs.val}
                        onchange={() => appState.currentCsMode = cs.val}>
                    <label for={cs.id}>{cs.label}</label>
                    {/each}
                </div>
            </div>

            {#if !appState.wasmReady}
            <div class="stats">
                <span id="status">{appState.status}</span>
            </div>
            {/if}
            {#if appState.originalImageData}
            <table class="metrics-table">
                <thead><tr>
                    <th>Channel</th>
                    <th><span class="tooltip-container">
                        PSNR (dB)
                        <span class="info-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                        <div class="tooltip-content"><strong>Peak Signal-to-Noise Ratio</strong><br>Higher is better. Measures how much noise compression introduced. Above 40 dB is excellent; 30–40 dB is acceptable.</div>
                    </span></th>
                    <th><span class="tooltip-container">
                        SSIM
                        <span class="info-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                        <div class="tooltip-content"><strong>Structural Similarity Index</strong><br>Closer to 1.0 is better. Measures perceived quality by comparing luminance, contrast, and structure. Above 0.95 is high quality.</div>
                    </span></th>
                </tr></thead>
                <tbody>
                    <tr><td>Y</td><td><span id="psnrY">{appState.psnr.y.toFixed(2)}</span></td><td><span id="ssimY">{appState.ssim.y.toFixed(4)}</span></td></tr>
                    <tr><td>Cr</td><td><span id="psnrCr">{appState.psnr.cr.toFixed(2)}</span></td><td><span id="ssimCr">{appState.ssim.cr.toFixed(4)}</span></td></tr>
                    <tr><td>Cb</td><td><span id="psnrCb">{appState.psnr.cb.toFixed(2)}</span></td><td><span id="ssimCb">{appState.ssim.cb.toFixed(4)}</span></td></tr>
                </tbody>
            </table>
            {/if}

            {#if appState.fileSizeInfo}
            <div class="file-size-bar-container" id="fileSizeContainer">
                <div class="file-size-header">
                    <span class="file-size-title">Estimated File Size</span>
                    <span class="file-size-values" id="fileSizeValues">{appState.fileSizeInfo.original} → ~{appState.fileSizeInfo.estimated}</span>
                </div>
                <div class="file-size-track">
                    <div class="file-size-fill" id="fileSizeFill" style="width: {appState.fileSizeInfo.fillPercent}%"></div>
                </div>
                <div class="file-size-labels">
                    <span class="file-size-label-left" id="fileSizeOrigLabel">Original: {appState.fileSizeInfo.original}</span>
                    <span class="file-size-label-right" id="fileSizeReduction">~{appState.fileSizeInfo.reduction}% smaller ({appState.fileSizeInfo.ratio}× compression)</span>
                </div>
            </div>
            {/if}
        </div>
    </div>
</div>
