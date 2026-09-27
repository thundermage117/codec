<script lang="ts">
    import { fade } from 'svelte/transition';
    import { motionState } from '../../motion/motion-state.svelte.js';
    import { VERDICT_COLORS, arrowLengthScale } from '../../motion/mv-render.js';

    // Colour wheel matching motionColor(): hue = direction of motion,
    // starting at "right" and turning clockwise (screen y points down).
    const wheel = `conic-gradient(from 90deg, ${Array.from({ length: 13 }, (_, i) =>
        `hsl(${i * 30}, 90%, 60%)`).join(', ')})`;

    const lengthScale = $derived.by(() => {
        const run = motionState.run;
        if (!run) return 1;
        const maxLength = run.mvs.reduce((m, mv) => Math.max(m, Math.hypot(mv.dx, mv.dy)), 0);
        return arrowLengthScale(run.grid.blockSize, maxLength);
    });

    const maxMad = $derived.by(() => {
        const run = motionState.run;
        if (!run) return 0;
        const area = run.grid.blockSize * run.grid.blockSize;
        return run.mvs.reduce((m, mv) => Math.max(m, mv.sad / area), 0);
    });
</script>

<div class="mode-tools-grid me-tools">
    <button class="tool-btn" class:active={motionState.showVectors}
        onclick={() => motionState.showVectors = !motionState.showVectors} title="Motion vectors">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/>
        </svg>
        <span>Vectors</span>
    </button>
    <button class="tool-btn" class:active={motionState.showCost}
        onclick={() => motionState.showCost = !motionState.showCost} title="Match cost per block">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h6v6M9 9h6v6M15 3h6v6"/>
        </svg>
        <span>Match cost</span>
    </button>
    <button class="tool-btn" class:active={motionState.showAccuracy}
        onclick={() => motionState.showAccuracy = !motionState.showAccuracy} title="Accuracy vs true motion">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>
        </svg>
        <span>Accuracy</span>
    </button>
    <button class="tool-btn" class:active={motionState.showGrid}
        onclick={() => motionState.showGrid = !motionState.showGrid} title="Block grid">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        <span>Grid</span>
    </button>
</div>

{#if motionState.showVectors}
<div class="heatmap-scale-container me-legend" transition:fade={{ duration: 150 }}>
    <div class="heatmap-scale-label">Direction of motion</div>
    <div class="me-wheel-row">
        <div class="me-wheel" style:background={wheel}></div>
        <p>Arrows show where content moved, from the reference to the current frame. The stored
            motion vector points the other way: back to where the block is copied from.
            {#if lengthScale > 1.05}Lengths drawn ×{lengthScale.toFixed(1)} for visibility.{/if}</p>
    </div>
</div>
{/if}

{#if motionState.showCost}
<div class="heatmap-scale-container" transition:fade={{ duration: 150 }}>
    <div class="heatmap-scale-label">Match cost (mean abs. difference per pixel)</div>
    <div class="heatmap-scale-bar"></div>
    <div class="heatmap-scale-range">
        <span>0</span>
        <span>{(maxMad / 2).toFixed(1)}</span>
        <span>{maxMad.toFixed(1)}</span>
    </div>
</div>
{/if}

{#if motionState.showAccuracy}
<div class="heatmap-scale-container" transition:fade={{ duration: 150 }}>
    <div class="heatmap-scale-label">Estimated vs true motion</div>
    <div class="me-verdicts">
        <span><i style:background={VERDICT_COLORS.exact}></i>Exact</span>
        <span><i style:background={VERDICT_COLORS.close}></i>Within 1 px</span>
        <span><i style:background={VERDICT_COLORS.wrong}></i>Wrong</span>
        <span><i class="hatched" style:background={VERDICT_COLORS.excluded}></i>No single truth</span>
    </div>
</div>
{/if}

<style>
    .me-tools {
        grid-template-columns: repeat(4, 1fr);
    }

    .me-wheel-row {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .me-wheel {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
    }

    .me-wheel-row p {
        margin: 0;
        font-size: 0.68rem;
        line-height: 1.4;
        color: var(--text-muted);
    }

    .me-verdicts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        font-size: 0.7rem;
        color: var(--text);
    }

    .me-verdicts span {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .me-verdicts i {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        border: 1px solid var(--border);
    }

    .me-verdicts i.hatched {
        background-image: repeating-linear-gradient(45deg, rgba(148, 163, 184, 0.8) 0 2px, transparent 2px 5px) !important;
    }
</style>
