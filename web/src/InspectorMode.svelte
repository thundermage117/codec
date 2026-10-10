<script lang="ts">
    import { appState, ViewMode, leaveCurrentMode } from './lib/state.svelte.js';
    import { inspectBlock } from './lib/inspection.js';
    import { computeSuggestedBlocks, renderBlockThumbnail } from './lib/suggested-blocks.js';
    import { processImage } from './lib/wasm-bridge.js';
    import QualityControl from './lib/components/QualityControl.svelte';
    import { coeffEdit } from './lib/coeff-edit.svelte.js';
    import { renderInspectedBlock, droppedNonZeroCount } from './lib/inspection.js';
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
            // Individual toggles belong to one block; keep-first-N persists.
            untrack(() => { coeffEdit.dropped = []; });
            inspectBlock(block.x, block.y);
            renderContextCrop(block.x, block.y);
            highlightThumbnailBlock(block.x, block.y);
        }
    });

    // Reactive: recompute suggestions when entering inspector or quality changes
    $effect(() => {
        if (appState.appMode === 'inspector' && appState.wasmReady && appState.originalImageData) {
            computeSuggestedBlocks();
        }
    });

    // Opened without a block (from the viewer): start on the top suggestion
    // rather than an empty page.
    $effect(() => {
        const first = appState.suggestedBlocks[0];
        if (first && !untrack(() => appState.inspectedBlock)) {
            appState.inspectedBlock = { x: first.x, y: first.y };
        }
    });

    // Reactive: re-process when quality/CS/transform changes in inspector
    $effect(() => {
        const q = appState.quality;
        const cs = appState.currentCsMode;
        const _t = appState.transformType; // track for reactivity

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
            computeSuggestedBlocks();
        }
    });

    // Re-render the inspected block when coefficient edits change.
    $effect(() => {
        const _k = coeffEdit.keepFirst;
        const _d = coeffEdit.dropped;
        const _e = coeffEdit.editing;
        untrack(() => renderInspectedBlock());
    });

    const editSummary = $derived.by(() => {
        const _v = coeffEdit.renderVersion;
        return droppedNonZeroCount();
    });

    const transformName = $derived(appState.transformType === 0 ? 'DCT' : 'DWT');
    const inverseTransformName = $derived(appState.transformType === 0 ? 'IDCT' : 'IDWT');
    const transformFullName = $derived(appState.transformType === 0 ? 'Discrete Cosine Transform' : 'Haar Discrete Wavelet Transform');
    const transformGridLabel = $derived(appState.transformType === 0 ? 'DCT Coefficients' : 'DWT Coefficients');

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
        const maxBx = Math.ceil(appState.imgWidth / 8) - 1; // includes partial edge blocks
        const maxBy = Math.ceil(appState.imgHeight / 8) - 1;
        return {
            bx: Math.max(0, Math.min(maxBx, bx)),
            by: Math.max(0, Math.min(maxBy, by)),
            valid: bx >= 0 && bx <= maxBx && by >= 0 && by <= maxBy
        };
    }

    // In the stacked phone layout the pipeline sits below the sidebar, so a
    // click on the navigator would otherwise change content off-screen.
    function revealPipelineOnNarrowScreens(): void {
        if (!window.matchMedia('(max-width: 900px)').matches) return;
        requestAnimationFrame(() =>
            document.getElementById('inspectorContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    function onThumbnailClick(e: MouseEvent) {
        if (!appState.originalImageData) return;
        const { bx, by, valid } = getBlockFromEvent(e);
        if (valid) {
            appState.inspectedBlock = { x: bx, y: by };
            document.querySelectorAll('.suggested-block-btn').forEach(b => b.classList.remove('active'));
            revealPipelineOnNarrowScreens();
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
        revealPipelineOnNarrowScreens();
    }

    // ===== Back button =====

    function onBack() {
        leaveCurrentMode();
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
                {appState.inspectorReturn ? 'Back to Artifacts' : 'Back'}
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
                <span class="inspector-badge badge-coords" title="Top-left pixel of the block, then its block column and row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span id="blockCoords">{appState.inspectedBlock ? `${appState.inspectedBlock.x * 8}, ${appState.inspectedBlock.y * 8} (Block ${appState.inspectedBlock.x},${appState.inspectedBlock.y})` : '—'}</span>
                </span>
            </div>
            <div class="inspector-topbar-legend">
                <span class="legend-item" title="Coefficient or error above zero"><span class="legend-dot dot-positive"></span>Positive</span>
                <span class="legend-item" title="Coefficient or error below zero"><span class="legend-dot dot-negative"></span>Negative</span>
                <span class="legend-item" title="Close to zero: what quantization turns into nothing"><span class="legend-dot dot-zero"></span>Near Zero</span>
                <span class="legend-item" title="Grayscale cells show pixel brightness, 0 to 255"><span class="legend-dot dot-intensity"></span>Pixel Intensity</span>
                <span class="legend-item" title="A run of zeros in zig-zag order, stored as one short code"><span class="run-dot" style="margin-right: 4px; opacity: 1;"></span>Zero Run</span>
            </div>
        </div>

        <!-- Two-column layout -->
        <div class="inspector-layout">

            <!-- Sidebar -->
            <aside class="inspector-sidebar">

                <!-- Thumbnail Navigator -->
                <details class="sidebar-section" open>
                    <summary class="sidebar-section-title"><span title="Click anywhere on the thumbnail to inspect that block">Image Navigator</span></summary>
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
                    <summary class="sidebar-section-title"><span title="Blocks picked because they show compression clearly: edges ring, textures lose detail, smooth areas show blocking">Suggested Blocks</span></summary>
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
                                            {cat === 'edge' ? 'Edges' : cat === 'texture' ? 'Textures' : 'Smooth'}
                                        </div>
                                        {#each appState.suggestedBlocks.filter(b => b.category === cat) as block}
                                            {@const isActive = appState.inspectedBlock?.x === block.x && appState.inspectedBlock?.y === block.y}
                                            {@const scoreColor = cat === 'edge' ? '#3b82f6' : cat === 'texture' ? '#f59e0b' : '#10b981'}
                                            <button class="suggested-block-btn" class:active={isActive} aria-pressed={isActive}
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
                        <!-- The inspector is block-focused and cheap to refresh, so dragging commits live. -->
                        <QualityControl idPrefix="inspQuality" onPreview={(q) => { appState.quality = q; }} />

                        <div class="control-group">
                            <div class="group-label"><span class="has-hint" title="Which channel to follow through the pipeline: Y is brightness; Cr and Cb are colour differences">Channel</span></div>
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
                            <div class="group-label"><span class="has-hint" title="How much colour resolution is kept before the transform. Disabled for Y, which is never subsampled.">Chroma Subsampling</span></div>
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
                    <div class="shortcut-row"><kbd>Tab</kbd> into a grid, then <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> explore cells, <kbd>Enter</kbd> animate</div>
                    <div class="shortcut-row"><kbd>Esc</kbd> Close popover / exit inspector</div>
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

                    <!-- Which block, and what this page follows -->
                    <div class="block-header">
                        <div class="context-crop-canvas-wrap" title="The block (red) and its neighbourhood in the image">
                            <canvas id="contextCropCanvas" bind:this={contextCropCanvas} width="64" height="64"></canvas>
                        </div>
                        <div class="block-header-text">
                            <div class="block-header-title" id="contextCropCaption">
                                {#if appState.inspectedBlock}
                                Block ({appState.inspectedBlock.x}, {appState.inspectedBlock.y})
                                <span>pixel ({appState.inspectedBlock.x * 8}, {appState.inspectedBlock.y * 8})</span>
                                {/if}
                            </div>
                            <p>
                                Follow these 64 pixels into frequencies, through the rounding that loses
                                information, and back.
                                <span class="kbd-only"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> move to a neighbouring block.</span>
                            </p>
                        </div>
                    </div>

                    <!-- Inspector Pipeline -->
                    <div class="inspector-pipeline">

                        <div class="pipeline-row-label">Encode <span class="row-sub">pixels → stored integers</span></div>
                        <div class="pipeline-row">
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3 class="has-hint" title="The block's pixel values (0 to 255) for the selected channel">Original</h3></div>
                                <div id="gridOriginal" class="block-grid"></div>
                                <div class="block-label">AxB Pixels</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>{transformFullName}</strong> Converts pixel data into frequency coefficients.</div>
                                <div class="arrow-line"></div><div class="arrow-label">{transformName}</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3 class="has-hint" title="How much of each of the 64 cosine patterns the block contains: smooth patterns top-left, finest detail bottom-right. Most of the energy sits top-left.">{transformGridLabel}</h3></div>
                                <div id="gridDCT" class="block-grid" data-target="gridOriginal"></div>
                                <div class="block-label">Frequencies</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>Quantization</strong> Divides frequencies by the quantization table and rounds. This is the only lossy step.</div>
                                <div class="arrow-line"></div><div class="arrow-label">÷ Quant</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3 class="has-hint" title="Each coefficient divided by its quant table entry and rounded. These integers are what gets stored; zeros cost almost nothing. With Edit coefficients on, click one to drop it.">Quantized</h3></div>
                                <div id="gridQuantized" class="block-grid" data-target="gridOriginal"></div>
                                <div class="block-label">Stored Data</div>
                            </div>
                        </div>

                        <div class="pipeline-row-label">Decode <span class="row-sub">stored integers → pixels</span></div>
                        <div class="coeff-edit-bar" role="group" aria-label="Coefficient experiments">
                            <button class="tool-btn coeff-edit-toggle" class:active={coeffEdit.editing} aria-pressed={coeffEdit.editing}
                                onclick={() => coeffEdit.editing = !coeffEdit.editing}
                                title="Click coefficients in Quantized or Dequantized to drop or restore them">
                                ✎ Edit coefficients
                            </button>
                            <label class="coeff-keep">
                                Keep first
                                <input type="range" min="1" max="64" bind:value={coeffEdit.keepFirst}
                                    aria-label="Number of zig-zag coefficients the decoder keeps">
                                <span class="coeff-keep-value">{coeffEdit.keepFirst}</span>
                                in zig-zag order
                            </label>
                            {#if coeffEdit.active}
                            <span class="coeff-edit-summary" aria-live="polite">
                                Dropping {editSummary.dropped} of {editSummary.nonZero} non-zero coefficients
                            </span>
                            <button class="tool-btn coeff-edit-reset" onclick={() => coeffEdit.reset()}>Reset</button>
                            {:else if coeffEdit.editing}
                            <span class="coeff-edit-summary">Click a coefficient in <em>Quantized</em> or <em>Dequantized</em> to drop it.</span>
                            {/if}
                        </div>
                        <div class="pipeline-row">
                            <div class="pipeline-block">
                                <div class="pipeline-block-header"><h3 class="has-hint" title="The stored integers multiplied back by the quant table: the original coefficients plus rounding error. The rounding can't be undone.">Dequantized</h3></div>
                                <div id="gridDequantized" class="block-grid" data-target="gridReconstructed"></div>
                                <div class="block-label">Approx Freqs</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>Inverse {transformName}</strong> Converts frequency coefficients back into pixel data.</div>
                                <div class="arrow-line"></div><div class="arrow-label">{inverseTransformName}</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block">
                                <div class="pipeline-block-header">
                                    <h3 class="has-hint" title="The decoded block: what the viewer shows">Reconstructed</h3>
                                    <span id="reconstructionProgress" class="reconstruction-progress" style="display:none"></span>
                                    <button class="pipeline-play-btn tooltip-container"
                                        onclick={() => window.dispatchEvent(new CustomEvent('animate-reconstruction'))}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">
                                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                        </svg>
                                        <div class="tooltip-content-small"><strong>Animate Reconstruction</strong><br>Watch the block build up coefficient by coefficient. Click again to pause.</div>
                                    </button>
                                </div>
                                <div id="gridReconstructed" class="block-grid"></div>
                                <div class="block-label">Final Image</div>
                            </div>
                            <div class="pipeline-arrow">
                                <div class="arrow-tooltip"><strong>Compare</strong> Subtract the reconstruction from the original to see what was lost.</div>
                                <div class="arrow-line"></div><div class="arrow-label">vs Original</div><div class="arrow-icon">→</div>
                            </div>
                            <div class="pipeline-block error-block">
                                <div class="pipeline-block-header"><h3 class="has-hint" title="Original minus reconstructed, per pixel: the detail compression lost">Error Residual</h3></div>
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
                        </div>

                        <!-- Reconstruction animation info banner (shown only during animation) -->
                        <div id="reconAnimBanner" class="recon-anim-banner" style="display:none">
                            <canvas id="reconBasisCanvas" class="recon-basis-canvas" width="56" height="56"></canvas>
                            <div class="recon-banner-body">
                                <div class="recon-banner-top">
                                    <span class="recon-banner-step">Step <strong id="reconBannerStep">—</strong> of 64</span>
                                    <span id="reconBannerFreq" class="recon-banner-freq-pill">—</span>
                                    <span id="reconBannerCoeff" class="recon-banner-coeff">—</span>
                                </div>
                                <div class="recon-banner-bar-track">
                                    <div class="recon-banner-bar-fill" id="reconBannerFill" style="width:0%"></div>
                                </div>
                                <p id="reconBannerDesc" class="recon-banner-desc">—</p>
                            </div>
                        </div>

                        <div class="pipeline-row-label">What it costs <span class="row-sub">and why</span></div>
                        <div class="analysis-row analysis-row-two">
                            <div class="analysis-card stats-card">
                                <div class="analysis-header"><h3>This Block</h3></div>
                                <div class="stats-grid">
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statEstBits">—</div>
                                        <div class="stat-label">Bits · <span id="statBpp">—</span> per pixel</div>
                                        <div class="tooltip-content-small"><strong>Estimated bits (JPEG-style)</strong><br>A simplified JPEG Huffman simulation for this block: zig-zag runs and magnitudes, with DC coded as the difference from the previous block. Per pixel is that divided by 64. The viewer's file size uses a whole-image entropy estimate instead, so the two don't add up exactly.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statZeros">—</div>
                                        <div class="stat-label">Zeros · <span id="statCompression">—</span></div>
                                        <div class="tooltip-content-small"><strong>Zero coefficients</strong><br><code>count(|quant[i]| &lt; 0.5)</code><br>Quantized coefficients rounded to zero. Zeros are nearly free to store, so more zeros means fewer bits.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statMSE">—</div>
                                        <div class="stat-label">MSE</div>
                                        <div class="tooltip-content-small"><strong>Mean squared error</strong><br><code>(1/64) &times; &Sigma;(orig &minus; recon)&sup2;</code><br>Average squared pixel error across the block.</div>
                                    </div>
                                    <div class="stat-box tooltip-container">
                                        <div class="stat-value" id="statPeakError">—</div>
                                        <div class="stat-label">Peak Error</div>
                                        <div class="tooltip-content-small"><strong>Peak absolute error</strong><br><code>max |orig &minus; recon|</code><br>Worst-case pixel difference in the block.</div>
                                    </div>
                                </div>
                                <div id="lossMeterContainer" class="mt-auto"></div>
                            </div>

                            <div class="pipeline-block qtable-block">
                                <div class="pipeline-block-header">
                                    <h3 class="has-hint" title="The divisor for each frequency at the current quality. Bigger divisors (usually bottom-right) throw away fine detail the eye notices least.">Quant Table</h3>
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
                                    <div class="pipeline-block-header"><h3 class="has-hint" title="What the decoder reads back from the file">Quantized</h3></div>
                                    <div id="gridQuantizedAdvanced" class="block-grid" data-target="gridOriginal"></div>
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
                                <span class="bps-item"><span id="basisValueLabel">{transformName}:</span> <strong id="basisValue">&mdash;</strong></span>
                                <span class="bps-item">Q: <strong id="basisQuantized">&mdash;</strong></span>
                                <span class="bps-item">÷ <strong id="basisDivisor">&mdash;</strong></span>
                            </div>
                            <div class="basis-popover-hint" id="basisClickHint">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                                Click to see wave overlay
                            </div>
                        </div>
                    </div>

                </div><!-- /inspectorContent -->
            </main>
        </div><!-- /inspector-layout -->
    </div><!-- /inspector-fullpage -->
</div>
