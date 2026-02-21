<script lang="ts">
    import { appState } from '../state.svelte.js';

    let {
        id = 'image-viewer',
        style = '',
        originalCanvas = $bindable(),
        processedCanvas = $bindable(),
        viewType = 'comparison', // 'original' | 'processed' | 'comparison'
        comparisonPercent = $bindable(50),
        isZoomMode = $bindable(false),
        zoom = $bindable(1),
        zoomOriginX = $bindable(50),
        zoomOriginY = $bindable(50),
        isInspectMode = false,
        highlightBlock = $bindable(null),
        showInspectorBanner = false,
        showQuickstart = false,
        showBlockGrid = false,
        zoomHint = null,
        onViewerClick = null,
        onViewerMouseDown = null,
        onViewerMouseLeave = null,
        onViewerMouseMove = null,
        onEnterInspector = null
    } = $props();

    type BlockCoord = { x: number; y: number } | null;

    function handleMouseDown(e: MouseEvent) {
        if (onViewerMouseDown) onViewerMouseDown(e);
    }

    function handleClick(e: MouseEvent) {
        if (onViewerClick) onViewerClick(e);
    }

    function handleMouseLeave() {
        if (onViewerMouseLeave) onViewerMouseLeave();
    }

    function handleMouseMove(e: MouseEvent) {
        if (onViewerMouseMove) onViewerMouseMove(e);
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (isInspectMode && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            if (onViewerClick) onViewerClick(e as unknown as MouseEvent);
        }
    }
</script>

<div class="zoom-viewport" id="{id}-viewport" {style} 
    style:aspect-ratio={appState.originalImageData ? `${appState.imgWidth} / ${appState.imgHeight}` : ''}
    style:--img-w={appState.imgWidth}
    style:--img-h={appState.imgHeight}>
    <div class="comparison-viewer"
        style={`transform: scale(${zoom}); transform-origin: ${zoomOriginX}% ${zoomOriginY}%; cursor: ${isZoomMode && zoom === 1 ? 'zoom-in' : isInspectMode ? 'crosshair' : viewType === 'comparison' ? 'col-resize' : 'default'}`}
        role="button"
        tabindex="0"
        aria-label={isInspectMode ? 'Inspector viewer. Press Enter to inspect highlighted block.' : 'Image comparison viewer. Drag to adjust split.'}
        onmousedown={handleMouseDown}
        onclick={handleClick}
        onmousemove={handleMouseMove}
        onkeydown={handleKeyDown}
        onmouseleave={handleMouseLeave}>

        <div class="canvas-container">
            <!-- Original Canvas -->
            <div class="canvas-wrap" class:visible={viewType === 'original' || viewType === 'comparison'}>
                <canvas
                    bind:this={originalCanvas}
                    id="{id}-original"
                ></canvas>
            </div>

            <!-- Processed/Artifact Canvas -->
            <div class="canvas-wrap" class:visible={viewType === 'processed' || viewType === 'comparison'}
                style={viewType === 'comparison' ? `clip-path: polygon(${comparisonPercent}% 0, 100% 0, 100% 100%, ${comparisonPercent}% 100%)` : ''}>
                <canvas
                    bind:this={processedCanvas}
                    id="{id}-processed"
                ></canvas>
            </div>

            {#if showBlockGrid}
                <div class="grid-overlay" aria-hidden="true"></div>
            {/if}
        </div>

    </div>

    <!-- Overlays outside comparison-viewer so they don't scale with zoom transform -->

    {#if appState.originalImageData && isInspectMode && showInspectorBanner}
    <div class="inspector-active-banner">
        <span class="banner-dot"></span>
        <strong>Inspector mode ON</strong>
        <span>Click any 8×8 block to open the full pipeline.</span>
    </div>
    {/if}

    {#if appState.originalImageData && !isInspectMode && viewType === 'comparison'}
    <div class="comparison-divider" style={`left: ${comparisonPercent}%`} aria-hidden="true">
        <div class="comparison-handle">
            <span></span>
            <span></span>
        </div>
    </div>
    {/if}

    {#if zoom > 1}
    <div class="zoom-badge" onclick={() => zoom = 1}>
        {zoom.toFixed(0)}×
    </div>
    {/if}

</div>

{#if zoomHint && (isZoomMode || zoom > 1)}
<div class="zoom-hint-bar">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
    <span>{@html zoomHint}</span>
</div>
{/if}


{#if showQuickstart && appState.originalImageData}
<div class="inspector-quickstart">
    <div class="quickstart-copy">
        <strong>Block Inspector</strong>
        <span>Click any 8×8 region to inspect DCT coefficients and quantization.</span>
    </div>
    <button class="inspector-quickstart-btn" onclick={onEnterInspector}>Enter Block Inspector</button>
</div>
{/if}

<style>
    .zoom-viewport {
        position: relative;
        overflow: hidden;
        border-radius: 12px;
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
        box-sizing: border-box;
    }

    .comparison-viewer {
        width: 100%;
        height: 100%;
        display: block;
    }

    .canvas-container {
        display: grid;
        width: 100%;
        height: 100%;
        position: relative;
    }

    .canvas-wrap {
        grid-area: 1 / 1;
        width: 100%;
        height: 100%;
        display: none;
        align-items: center;
        justify-content: center;
    }

    .canvas-wrap.visible {
        display: flex;
    }

    canvas {
        width: 100%;
        height: 100%;
        display: block;
        image-rendering: pixelated;
        object-fit: contain;
    }


    .grid-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
        /* Use percentage based on image dimensions to ensure it stays locked to 8x8 blocks regardless of scaling */
        background-size: calc(800% / max(1, var(--img-w, 1))) calc(800% / max(1, var(--img-h, 1)));
    }

    :global(.zoom-hint-bar) {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 6px;
        font-size: 0.68rem;
        color: rgba(203, 213, 225, 0.75);
        pointer-events: none;
        white-space: nowrap;
    }

    :global(.zoom-hint-bar) svg {
        flex-shrink: 0;
        opacity: 0.7;
    }
</style>

