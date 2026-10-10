<script lang="ts">
    import { appState } from '../../state.svelte.js';
    import { getCoeffStats, COEFF_BINS, type CoeffStats } from '../../wasm-bridge.js';
    import { TRANSFORMS, transformInfo } from '../../transforms.js';

    // Bin b holds |c| in [2^(b-1), 2^b); bin 0 is |c| < 1; the last bin is open-ended.
    function binLabel(b: number): string {
        if (b === 0) return '<1';
        const lo = 2 ** (b - 1);
        return b === COEFF_BINS - 1 ? `${lo}+` : String(lo);
    }

    let stats = $state<Record<number, CoeffStats> | null>(null);
    let statsQuality = $state(0);
    let loading = $state(false);
    let jobId = 0;
    let wanted = false; // user has asked for the chart at least once for this image

    function compute(): void {
        if (!appState.wasmReady || !appState.originalImageData) return;
        const id = ++jobId;
        const quality = appState.quality;
        loading = stats === null;
        // Yield a frame so the loading state can paint before the synchronous WASM call.
        setTimeout(() => {
            if (id !== jobId) return;
            try {
                stats = getCoeffStats(quality);
                statsQuality = quality;
            } finally {
                if (id === jobId) loading = false;
            }
        }, 0);
    }

    function generate(): void {
        wanted = true;
        compute();
    }

    // Reset when the image changes.
    $effect(() => {
        const _ready = appState.wasmReady;
        const _image = appState.originalImageData;
        jobId++;
        wanted = false;
        stats = null;
        loading = false;
    });

    // Once shown, follow the quality slider (the histogram is fixed per image;
    // only the zeroed fractions move).
    $effect(() => {
        const _q = appState.quality;
        if (!wanted) return;
        const timer = setTimeout(compute, 120);
        return () => clearTimeout(timer);
    });
</script>

<div class="card hist-card">
    <section class="rd-chart-panel" aria-live="polite">
        <div class="rd-chart-header">
            <div>
                <h3>Coefficient Sparsity</h3>
                <p>Where each transform puts the luma channel's detail energy. Coefficients that quantize to zero are nearly free to code.</p>
            </div>
            {#if loading}
            <span class="rd-chart-status">Computing…</span>
            {/if}
            {#if appState.originalImageData && !loading && !stats}
            <button class="tool-btn rd-generate-btn" onclick={generate} style="margin-left: auto;">Generate</button>
            {/if}
        </div>

        {#if !appState.originalImageData}
        <div class="rd-chart-empty">Load an image to compare coefficient sparsity.</div>
        {:else if loading}
        <div class="rd-chart-empty">Transforming the image with DCT, Haar and CDF 9/7…</div>
        {:else if !stats}
        <div class="rd-chart-empty">Click Generate to compare how sparse each transform makes the image.</div>
        {:else}
        {@const series = TRANSFORMS.map(t => ({ info: t, data: stats![t.value] }))}
        {@const svgW = 700}
        {@const svgH = 240}
        {@const padL = 52}
        {@const padR = 16}
        {@const padT = 30}
        {@const padB = 48}
        {@const chartW = svgW - padL - padR}
        {@const chartH = svgH - padT - padB}
        {@const maxY = Math.max(...series.flatMap(s => s.data.histogram)) * 1.1 || 1}
        {@const groupW = chartW / COEFF_BINS}
        {@const barW = (groupW - 6) / series.length}
        <div class="rd-chart-svg-wrap">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} role="img"
                aria-label="Histogram of AC coefficient magnitudes for DCT, Haar and CDF 9/7">
                {#each [0.25, 0.5, 0.75, 1.0] as frac}
                {@const gy = padT + chartH * (1 - frac)}
                <line x1={padL} y1={gy} x2={svgW - padR} y2={gy} class="rd-grid-line"/>
                <text x={padL - 5} y={gy + 4} class="rd-axis-text rd-axis-text-end">{(maxY * frac * 100).toFixed(0)}%</text>
                {/each}
                <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} class="rd-axis-line"/>
                <line x1={padL} y1={padT + chartH} x2={svgW - padR} y2={padT + chartH} class="rd-axis-line"/>

                {#each series as s, k}
                {#each s.data.histogram as val, b}
                {@const barH = Math.max(0, (val / maxY) * chartH)}
                <rect x={padL + b * groupW + 3 + k * barW} y={padT + chartH - barH}
                    width={Math.max(1, barW - 1)} height={barH} style="fill: {s.info.color}" opacity="0.85">
                    <title>{s.info.label}: {(val * 100).toFixed(1)}% of coefficients with |c| in bin {binLabel(b)}</title>
                </rect>
                {/each}
                {/each}

                {#each { length: COEFF_BINS } as _, b}
                <text x={padL + (b + 0.5) * groupW} y={padT + chartH + 14} class="rd-axis-text rd-axis-text-middle">{binLabel(b)}</text>
                {/each}

                <text x={(padL + svgW - padR) / 2} y={svgH - 4} class="rd-axis-title rd-axis-text-middle">|AC coefficient| (doubling-width bins)</text>
                <text x={11} y={padT + chartH / 2} transform={`rotate(-90 11 ${padT + chartH / 2})`} class="rd-axis-title rd-axis-text-middle">Share</text>

                {#each series as s, k}
                <rect x={padL + 10 + k * 80} y={8} width={9} height={9} style="fill: {s.info.color}"/>
                <text x={padL + 24 + k * 80} y={16} class="rd-axis-text">{s.info.label}</text>
                {/each}
            </svg>
        </div>

        <div class="rd-current-callout">
            {#each series as s, k}
            {#if k > 0}<div class="rd-callout-sep"></div>{/if}
            <div class="rd-callout-item" class:hist-active={s.info.value === appState.transformType}>
                <span class="rd-callout-label">{s.info.label} zeroed at Q{statsQuality}</span>
                <span class="rd-callout-value" style="color: {s.info.color}">{(s.data.zeroFraction * 100).toFixed(1)}%</span>
            </div>
            {/each}
        </div>
        <p class="hist-footnote">
            Current transform: <strong style="color: {transformInfo(appState.transformType).color}">{transformInfo(appState.transformType).label}</strong>.
            DC / LL coefficients are excluded. The zeroed share follows the quality slider.
        </p>
        {/if}
    </section>
</div>

<style>
    .hist-active .rd-callout-label {
        font-weight: 700;
        color: var(--text);
    }

    .hist-footnote {
        margin: 8px 2px 0;
        font-size: var(--text-base-sm);
        color: var(--text-muted);
    }
</style>
