<script lang="ts">
    import { appState, ViewMode } from './lib/state.svelte.js';
    import { inspectBlock } from './lib/inspection.js';
    import { computeSuggestedBlocks, renderBlockThumbnail } from './lib/suggested-blocks.js';
    import { processImage } from './lib/wasm-bridge.js';
    import { untrack } from 'svelte';

    let thumbnailCanvas: HTMLCanvasElement;
    let contextCropCanvas: HTMLCanvasElement;
    let cachedThumbnailCanvas: HTMLCanvasElement | null = null;
    let fullImageCanvas: HTMLCanvasElement | null = null; // Cache for full image source

    // Update fullImageCanvas when image data changes
    $effect(() => {
        if (appState.originalImageData) {
            fullImageCanvas = document.createElement('canvas');
            fullImageCanvas.width = appState.imgWidth;
            fullImageCanvas.height = appState.imgHeight;
            fullImageCanvas.getContext('2d')!.putImageData(appState.originalImageData, 0, 0);
            
            // Invalidate thumbnail cache
            cachedThumbnailCanvas = null;
        }
    });

    // Reactive: re-inspect when inspectedBlock changes (e.g., via arrow key navigation)
    $effect(() => {
        const block = appState.inspectedBlock;
        if (block && appState.wasmReady) {
            inspectBlock(block.x, block.y);
            renderContextCrop(block.x, block.y);
            highlightThumbnailBlock(block.x, block.y);
        }
    });

    // Reactive: recompute suggestions when entering inspector or quality changes
    $effect(() => {
        if (appState.appMode === 'inspector' && appState.wasmReady && appState.originalImageData) {
            computeSuggestedBlocks(document.getElementById('processedCanvas') as HTMLCanvasElement | null);
        }
    });

    // Reactive: re-process when quality/CS changes in inspector
    $effect(() => {
        const q = appState.quality;
        const cs = appState.currentCsMode;
        
        // Only run if we are in inspector mode with data
        if (appState.appMode === 'inspector' && appState.wasmReady && appState.originalImageData) {
            processImage(q, cs);
            renderThumbnailCanvas();
            
            // Re-inspect current block if needed, but DO NOT track inspectedBlock changes here
            const currentBlock = untrack(() => appState.inspectedBlock);
            if (currentBlock) {
                inspectBlock(currentBlock.x, currentBlock.y);
                renderContextCrop(currentBlock.x, currentBlock.y);
            }
            computeSuggestedBlocks(document.getElementById('processedCanvas') as HTMLCanvasElement | null);
        }
    });

    // Render thumbnail on mount
    $effect(() => {
        if (thumbnailCanvas && appState.originalImageData) {
            renderThumbnailCanvas();
        }
    });

    // ===== Thumbnail rendering =====

    function renderThumbnailCanvas() {
        if (!thumbnailCanvas || !appState.originalImageData) return;

        const maxW = 238;
        const aspect = appState.imgHeight / appState.imgWidth;
        const thumbW = Math.min(maxW, appState.imgWidth);
        const thumbH = Math.round(thumbW * aspect);

        thumbnailCanvas.width = thumbW;
        thumbnailCanvas.height = thumbH;

        const ctx = thumbnailCanvas.getContext('2d')!;

        if (!cachedThumbnailCanvas || cachedThumbnailCanvas.width !== thumbW || cachedThumbnailCanvas.height !== thumbH) {
            cachedThumbnailCanvas = document.createElement('canvas');
            cachedThumbnailCanvas.width = thumbW;
            cachedThumbnailCanvas.height = thumbH;
            const cCtx = cachedThumbnailCanvas.getContext('2d')!;
            
            if (fullImageCanvas) {
                cCtx.drawImage(fullImageCanvas, 0, 0, thumbW, thumbH);
            }
        }

        ctx.drawImage(cachedThumbnailCanvas, 0, 0);
    }

    function highlightThumbnailBlock(bx: number, by: number) {
        if (!thumbnailCanvas || !appState.originalImageData) return;
        renderThumbnailCanvas();

        const ctx = thumbnailCanvas.getContext('2d')!;
        const scaleX = thumbnailCanvas.width / appState.imgWidth;
        const scaleY = thumbnailCanvas.height / appState.imgHeight;
        const x = bx * 8 * scaleX;
        const y = by * 8 * scaleY;
        const w = 8 * scaleX;
        const h = 8 * scaleY;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 1;
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, thumbnailCanvas.height);
        ctx.moveTo(0, cy); ctx.lineTo(thumbnailCanvas.width, cy);
        ctx.stroke();
    }

    // ===== Context crop =====

    function renderContextCrop(bx: number, by: number) {
        if (!contextCropCanvas || !appState.originalImageData) return;

        const ctx = contextCropCanvas.getContext('2d')!;
        const cropSize = 64;
        const blockPxX = bx * 8 + 4;
        const blockPxY = by * 8 + 4;

        const sx = Math.max(0, Math.min(appState.imgWidth - cropSize, blockPxX - cropSize / 2));
        const sy = Math.max(0, Math.min(appState.imgHeight - cropSize, blockPxY - cropSize / 2));
        const sw = Math.min(cropSize, appState.imgWidth - sx);
        const sh = Math.min(cropSize, appState.imgHeight - sy);

        contextCropCanvas.width = cropSize;
        contextCropCanvas.height = cropSize;

        contextCropCanvas.width = cropSize;
        contextCropCanvas.height = cropSize;

        ctx.clearRect(0, 0, cropSize, cropSize);
        
        if (fullImageCanvas) {
             ctx.drawImage(fullImageCanvas, sx, sy, sw, sh, 0, 0, cropSize, cropSize);
        }

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx * 8 - sx, by * 8 - sy, 8, 8);
    }

    // ===== Thumbnail click/hover =====

    function getBlockFromEvent(e: MouseEvent): { bx: number; by: number; valid: boolean } {
        if (!thumbnailCanvas) return { bx: 0, by: 0, valid: false };
        const rect = thumbnailCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scaleX = appState.imgWidth / rect.width;
        const scaleY = appState.imgHeight / rect.height;
        const bx = Math.floor(x * scaleX / 8);
        const by = Math.floor(y * scaleY / 8);
        const maxBx = Math.floor(appState.imgWidth / 8) - 1;
        const maxBy = Math.floor(appState.imgHeight / 8) - 1;
        return {
            bx: Math.max(0, Math.min(maxBx, bx)),
            by: Math.max(0, Math.min(maxBy, by)),
            valid: bx >= 0 && bx <= maxBx && by >= 0 && by <= maxBy
        };
    }

    function onThumbnailClick(e: MouseEvent) {
        if (!appState.originalImageData) return;
        const { bx, by, valid } = getBlockFromEvent(e);
        if (valid) {
            appState.inspectedBlock = { x: bx, y: by };
            document.querySelectorAll('.suggested-block-btn').forEach(b => b.classList.remove('active'));
        }
    }

    function onThumbnailMouseMove(e: MouseEvent) {
        if (!appState.originalImageData) return;
        const { bx, by, valid } = getBlockFromEvent(e);
        if (valid) highlightThumbnailBlock(bx, by);
    }

    function onThumbnailMouseLeave() {
        if (!appState.originalImageData) return;
        if (appState.inspectedBlock) {
            highlightThumbnailBlock(appState.inspectedBlock.x, appState.inspectedBlock.y);
        } else {
            renderThumbnailCanvas();
        }
    }

    // Svelte action to render a block thumbnail onto a canvas element
    function blockThumb(node: HTMLCanvasElement, params: { bx: number; by: number }) {
        renderBlockThumbnail(node, params.bx, params.by);
        return {
            update(params: { bx: number; by: number }) {
                renderBlockThumbnail(node, params.bx, params.by);
            }
        };
    }

    // ===== Suggested block selection =====

    function onSuggestedBlockSelect(bx: number, by: number) {
        appState.inspectedBlock = { x: bx, y: by };
        highlightThumbnailBlock(bx, by);
    }

    // ===== Back button =====

    function onBack() {
        appState.appMode = 'viewer';
        appState.isInspectMode = false;
        appState.highlightBlock = null;
        // Button in ViewerMode handles its own active state via class:active
    }

    // ===== Inspector view mode (Y/Cr/Cb only) =====

    const inspViewModes = [
        { id: 'insp_view_y', val: ViewMode.Y, label: 'Y' },
        { id: 'insp_view_cr', val: ViewMode.Cr, label: 'Cr' },
        { id: 'insp_view_cb', val: ViewMode.Cb, label: 'Cb' }
    ];

    const chromaModes = [
        { id: 'insp_cs_444', val: 444, label: '4:4:4' },
        { id: 'insp_cs_422', val: 422, label: '4:2:2' },
        { id: 'insp_cs_420', val: 420, label: '4:2:0' }
    ];

    // Normalize view mode to a channel mode when entering inspector
    $effect(() => {
        if (appState.appMode === 'inspector' &&
            (appState.currentViewMode === ViewMode.RGB || appState.currentViewMode === ViewMode.Artifacts)) {
            appState.currentViewMode = ViewMode.Y;
        }
    });
</script>

<!-- ===== INSPECTOR MODE ===== -->
<div id="inspectorMode">
    <div class="inspector-fullpage">

        <!-- Top Bar -->
        <div class="inspector-topbar">
            <button class="inspector-back-btn" id="inspectorBackBtn" onclick={onBack}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 5 5 12 12 19"></polyline>
                </svg>
                Back
            </button>
            <h2 class="inspector-topbar-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                Block Inspector
            </h2>
            <div class="inspector-topbar-badges">
                <span class="inspector-badge badge-coords">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span id="blockCoords">{appState.inspectedBlock ? `${appState.inspectedBlock.x * 8}, ${appState.inspectedBlock.y * 8} (Block ${appState.inspectedBlock.x},${appState.inspectedBlock.y})` : '—'}</span>
                </span>
                <span class="inspector-badge badge-qtable" id="qTableType">
                    {appState.currentViewMode === ViewMode.Cr || appState.currentViewMode === ViewMode.Cb ? 'Chroma' : 'Luma'}
                </span>
            </div>
            <div class="inspector-topbar-legend">
                <span class="legend-item"><span class="legend-dot dot-positive"></span>Positive</span>
                <span class="legend-item"><span class="legend-dot dot-negative"></span>Negative</span>
                <span class="legend-item"><span class="legend-dot dot-zero"></span>Near Zero</span>
                <span class="legend-item"><span class="legend-dot dot-intensity"></span>Pixel Intensity</span>
            </div>
        </div>

        <!-- Two-column layout -->
        <div class="inspector-layout">

            <!-- Sidebar -->
            <aside class="inspector-sidebar">

                <!-- Thumbnail Navigator -->
                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span>Image Navigator</span></summary>
                    <div class="sidebar-section-body">
                        <div class="thumbnail-container" id="thumbnailContainer">
                            <canvas id="thumbnailCanvas" bind:this={thumbnailCanvas}
                                onclick={onThumbnailClick}
                                onmousemove={onThumbnailMouseMove}
                                onmouseleave={onThumbnailMouseLeave}></canvas>
                        </div>
                    </div>
                </details>

                <!-- Suggested Blocks -->
                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span>Suggested Blocks</span></summary>
                    <div class="sidebar-section-body">
                        <div class="suggested-blocks-list" id="suggestedBlocksList">
                            {#if appState.suggestedBlocks.length === 0}
                                <div class="suggested-blocks-empty">
                                    {appState.originalImageData ? 'No suggestions available' : 'Load an image to see suggestions'}
                                </div>
                            {:else}
                                {#each ['edge', 'texture', 'smooth'] as cat}
                                    {#if appState.suggestedBlocks.some(b => b.category === cat)}
                                        <div class="suggested-category-header">
                                            {cat === 'edge' ? '🔷 Edges' : cat === 'texture' ? '🔶 Textures' : '🟢 Smooth'}
                                        </div>
                                        {#each appState.suggestedBlocks.filter(b => b.category === cat) as block}
                                            {@const isActive = appState.inspectedBlock?.x === block.x && appState.inspectedBlock?.y === block.y}
                                            {@const scoreColor = cat === 'edge' ? '#3b82f6' : cat === 'texture' ? '#f59e0b' : '#10b981'}
                                            <button class="suggested-block-btn" class:active={isActive}
                                                data-bx={block.x} data-by={block.y}
                                                onclick={() => onSuggestedBlockSelect(block.x, block.y)}>
                                                <div class="suggested-block-icon" style="color: {scoreColor}">{block.icon}</div>
                                                <canvas class="suggested-block-thumb"
                                                    use:blockThumb={{ bx: block.x, by: block.y }}></canvas>
                                                <div class="suggested-block-info">
                                                    <span class="suggested-block-label">{block.label}</span>
                                                    <span class="suggested-block-coords">({block.x}, {block.y})</span>
                                                </div>
                                            </button>
                                        {/each}
                                    {/if}
                                {/each}
                            {/if}
                        </div>
                    </div>
                </details>

                <!-- Controls -->
                <details class="sidebar-section sidebar-controls" open>
                    <summary class="sidebar-section-title"><span>Controls</span></summary>
                    <div class="sidebar-section-body">
                        <div class="control-group">
                            <label for="inspQualitySlider">
                                Quality <span id="inspQualityValue">{appState.quality}</span>
                            </label>
                            <div class="preset-group">
                                {#each [{ q: 10, label: 'Low', desc: 'Thumbnails' }, { q: 50, label: 'Medium', desc: 'Web / Social' }, { q: 90, label: 'High', desc: 'Print / Archive' }] as preset}
                                <button class="preset-btn insp-preset-btn"
                                    class:active={appState.quality === preset.q}
                                    data-quality={preset.q}
                                    onclick={() => { appState.quality = preset.q; }}>
                                    <span class="preset-label">{preset.label}</span>
                                    <span class="preset-desc">{preset.desc}</span>
                                </button>
                                {/each}
                            </div>
                            <input type="range" id="inspQualitySlider" min="1" max="100"
                                bind:value={appState.quality}>
                        </div>

                        <div class="control-group">
                            <div class="group-label">View Mode</div>
                            <div class="toggle-group">
                                {#each inspViewModes as mode}
                                <input type="radio" id={mode.id} name="insp_view_mode"
                                    checked={appState.currentViewMode === mode.val}
                                    onchange={() => appState.currentViewMode = mode.val}>
                                <label for={mode.id}>{mode.label}</label>
                                {/each}
                            </div>
                        </div>

                        <div class="control-group">
                            <div class="group-label">Chroma Subsampling</div>
                            <div class="toggle-group">
                                {#each chromaModes as cs}
                                <input type="radio" id={cs.id} name="insp_chroma_subsampling"
                                    checked={appState.currentCsMode === cs.val}
                                    disabled={appState.currentViewMode === ViewMode.Y}
                                    onchange={() => appState.currentCsMode = cs.val}>
                                <label for={cs.id}>{cs.label}</label>
                                {/each}
                            </div>
                        </div>
                    </div>
                </details>

                <!-- Keyboard Shortcuts -->
                <div class="sidebar-shortcuts">
                    <div class="shortcut-row"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Navigate blocks</div>
                    <div class="shortcut-row"><kbd>Esc</kbd> Exit inspector</div>
                    <div class="shortcut-row"><kbd>?</kbd> Show shortcuts</div>
                </div>
            </aside>

            <!-- Main Content -->
            <main class="inspector-main">

                <!-- Placeholder -->
                <div id="inspectorPlaceholder" class="inspector-main-placeholder"
                    style={appState.inspectedBlock ? 'display: none' : ''}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <p>Click a block on the thumbnail to inspect it</p>
                    <p class="placeholder-hint">Or select a suggested block from the sidebar</p>
                </div>

                <!-- Pipeline Content -->
                <div id="inspectorContent" style={appState.inspectedBlock ? '' : 'display: none'}>

                    <!-- Context Crop -->
                    <div class="context-crop-container">
                        <div class="context-crop-label">Block Context</div>
                        <div class="context-crop-canvas-wrap">
                            <canvas id="contextCropCanvas" bind:this={contextCropCanvas} width="64" height="64"></canvas>
                        </div>
                        <div class="context-crop-caption" id="contextCropCaption">
                            {appState.inspectedBlock
                                ? `Block (${appState.inspectedBlock.x}, ${appState.inspectedBlock.y}) — pixel (${appState.inspectedBlock.x * 8}, ${appState.inspectedBlock.y * 8})`
                                : 'Select a block to see its surrounding context'}
                        </div>
                    </div>

                    <!-- Inspector Pipeline -->
                    <div class="inspector-pipeline">

                        <div class="pipeline-row-label">
                            Encoding Pipeline
                            <span class="nav-hint"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> navigate blocks</span>
                        </div>
                        <div class="pipeline-row">
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3>Original</h3></div>
                                <div id="gridOriginal" class="block-grid"></div>
                                <div class="block-label">AxB Pixels</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>Discrete Cosine Transform</strong> Converts pixel data into frequency coefficients.</div>
                                <div class="arrow-line"></div><div class="arrow-label">DCT</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3>DCT Coefficients</h3></div>
                                <div id="gridDCT" class="block-grid"></div>
                                <div class="block-label">Frequencies</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>Quantization</strong> Divides frequencies by the quantization table to reduce data size.</div>
                                <div class="arrow-line"></div><div class="arrow-label">÷ Quant</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3>Quantized</h3></div>
                                <div id="gridQuantized" class="block-grid"></div>
                                <div class="block-label">Integers</div>
                            </div>
                        </div>

                        <div class="pipeline-row-label">Decoding Pipeline</div>
                        <div class="pipeline-row">
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3>Quantized</h3></div>
                                <div id="gridQuantized2" class="block-grid"></div>
                                <div class="block-label">Stored Data</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>Dequantization</strong> Multiplies stored integers by the quantization table.</div>
                                <div class="arrow-line"></div><div class="arrow-label">× Quant</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3>Dequantized</h3></div>
                                <div id="gridDequantized" class="block-grid"></div>
                                <div class="block-label">Approx Freqs</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>Inverse DCT</strong> Converts frequency coefficients back into pixel data.</div>
                                <div class="arrow-line"></div><div class="arrow-label">IDCT</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3>Reconstructed</h3></div>
                                <div id="gridReconstructed" class="block-grid"></div>
                                <div class="block-label">Final Image</div>
                            </div>
                        </div>

                        <div class="pipeline-row-label">Analysis & Statistics</div>
                        <div class="analysis-row">
                            <div class="pipeline-block error-block">
                                <div class="pipeline-block-header"><h3>Error Residual</h3></div>
                                <div class="error-visualizer">
                                    <div id="gridError" class="block-grid"></div>
                                    <div class="error-legend-vertical">
                                        <div class="legend-scale">
                                            <span>+30</span>
                                            <div class="scale-bar"></div>
                                            <span>-30</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="analysis-card stats-card">
                                <div class="analysis-header"><h3>Block Statistics</h3></div>
                                <div class="stats-grid">
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statMSE">—</div>
                                        <div class="stat-label">MSE</div>
                                        <div class="tooltip-content-small"><strong>Mean Squared Error</strong><br><code>(1/64) &times; &Sigma;(orig &minus; recon)&sup2;</code><br>Average squared pixel error across all 64 coefficients.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statPeakError">—</div>
                                        <div class="stat-label">Peak Error</div>
                                        <div class="tooltip-content-small"><strong>Peak Absolute Error</strong><br><code>max |orig &minus; recon|</code><br>Worst-case pixel difference in the block.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statZeros">—</div>
                                        <div class="stat-label">Zeros (Count)</div>
                                        <div class="tooltip-content-small"><strong>Zero Coefficients</strong><br><code>count(|quant[i]| &lt; 0.5)</code><br>Number of quantized DCT coefficients rounded to zero.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statCompression">—</div>
                                        <div class="stat-label">Compression</div>
                                        <div class="tooltip-content-small"><strong>Zero Coefficient Ratio</strong><br><code>(zeros / 64) &times; 100%</code><br>Percentage of quantized DCT coefficients equal to zero.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statEstBits">—</div>
                                        <div class="stat-label">Est. Bits</div>
                                        <div class="tooltip-content-small"><strong>Estimated Bits</strong><br>Calculated via simplified Huffman simulation on Zig-zag scanned runs and symbol magnitudes.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statBpp">—</div>
                                        <div class="stat-label">Bits / Pixel</div>
                                        <div class="tooltip-content-small"><strong>Bits Per Pixel</strong><br><code>(Est. Bits) / 64</code><br>Average number of bits required to store each pixel in this block.</div>
                                    </div>
                                </div>
                                <div id="lossMeterContainer" class="mt-auto"></div>
                            </div>

                            <div class="pipeline-block qtable-block">
                                <div class="pipeline-block-header">
                                    <h3>Quant Table</h3>
                                    <span class="inspector-badge badge-qtable" id="qTableType2">
                                        {appState.currentViewMode === ViewMode.Cr || appState.currentViewMode === ViewMode.Cb ? 'Chroma' : 'Luma'}
                                    </span>
                                </div>
                                <div id="gridQuantTable" class="block-grid"></div>
                            </div>
                        </div>

                    </div><!-- /inspector-pipeline -->

                    <!-- Advanced Data Serialization Section -->
                    <details class="advanced-section">
                        <summary class="advanced-summary">
                            <div class="advanced-summary-content">
                                <span class="advanced-title" style="display: flex; align-items: center; gap: 8px;">
                                    Entropy Encoding
                                    <span class="inspector-badge badge-advanced">Advanced</span>
                                </span>
                                <span class="advanced-subtitle">Zig-zag scan &rarr; RLE &rarr; Huffman coding</span>
                            </div>
                            <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </summary>
                        <div class="advanced-body">
                            <div class="zigzag-header">
                                <div class="zigzag-info">
                                    <strong>Zig-zag Scan &amp; Run-Length Encoding</strong>
                                    <p>
                                        The quantized block is read diagonally — from DC (top-left) to highest frequency (bottom-right). This ordering groups near-zero high-frequency coefficients together so runs of zeros can be encoded compactly with RLE, followed by Huffman coding for the non-zero values.
                                    </p>
                                </div>
                                <button id="btnAnimateZigzag" class="primary-btn play-btn" onclick={() => window.dispatchEvent(new CustomEvent('animate-zigzag'))}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
                                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                    </svg>
                                    Animate Scan
                                </button>
                            </div>
                            
                            <div class="zigzag-visualizer-row">
                                <div class="pipeline-block" style="flex: 0 0 auto; margin-right: 16px;">
                                    <div class="pipeline-block-header"><h3>Quantized</h3></div>
                                    <div id="gridQuantizedAdvanced" class="block-grid"></div>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div id="gridZigzag" class="zigzag-array-container" style="height: 100%;">
                                        <!-- Populated by grid-renderer -->
                                    </div>
                                </div>
                            </div>
                            
                            <div class="entropy-summary-container">
                                <div id="entropySummary" class="entropy-summary-box">
                                    <!-- Populated by grid-renderer -->
                                </div>
                            </div>
                        </div>
                    </details>

                    <!-- Floating Basis Popover -->
                    <div id="basisPopover" class="basis-popover" style="display: none;">
                        <div class="basis-popover-header">
                            <span class="basis-popover-title">
                                <span id="basisCoord">(0,0)</span>
                                <span class="basis-popover-freq" id="basisFreqLabel">DC</span>
                            </span>
                        </div>
                        <div class="basis-popover-body">
                            <div class="basis-popover-canvases">
                                <div class="basis-popover-panel">
                                    <div class="basis-popover-panel-label">Basis</div>
                                    <canvas id="basisCanvas" width="80" height="80"></canvas>
                                </div>
                                <div class="basis-popover-panel">
                                    <div class="basis-popover-panel-label">Contribution</div>
                                    <canvas id="contributionCanvas" width="80" height="80"></canvas>
                                </div>
                            </div>
                            <div class="basis-popover-stats">
                                <span class="bps-item">DCT: <strong id="basisValue">&mdash;</strong></span>
                                <span class="bps-item">Q: <strong id="basisQuantized">&mdash;</strong></span>
                                <span class="bps-item">÷ <strong id="basisDivisor">&mdash;</strong></span>
                            </div>
                        </div>
                    </div>

                </div><!-- /inspectorContent -->
            </main>
        </div><!-- /inspector-layout -->
    </div><!-- /inspector-fullpage -->
</div>
