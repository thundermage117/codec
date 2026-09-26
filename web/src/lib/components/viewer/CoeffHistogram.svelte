<script lang="ts">
    import { appState } from '../../state.svelte.js';
    import { getCoeffHistogram } from '../../wasm-bridge.js';

    const HIST_BINS = 32;
    const HIST_MAX = 512.0;

    type HistData = { dct: number[]; dwt: number[] };
    let histData = $state<HistData | null>(null);
    let histLoading = $state(false);
    let histJobId = 0;

    function generateHistogram() {
        if (!appState.wasmReady || !appState.originalImageData) return;
        const jobId = ++histJobId;
        histLoading = true;
        // Yield one frame so "Computing…" appears before the synchronous WASM call
        setTimeout(() => {
            if (jobId !== histJobId) return;
            try {
                histData = getCoeffHistogram(HIST_BINS, HIST_MAX);
            } finally {
                if (jobId === histJobId) histLoading = false;
            }
        }, 0);
    }

    // Clear histogram when image changes
    $effect(() => {
        const _ready = appState.wasmReady;
        const _image = appState.originalImageData;
        histJobId++;
        histData = null;
        histLoading = false;
    });
</script>

<div class="card hist-card">
    <section class="rd-chart-panel" aria-live="polite">
        <div class="rd-chart-header">
            <div>
                <h3>Coefficient Histogram <span class="beta-badge">Beta</span></h3>
                <p>AC coefficient magnitude distribution — DWT concentrates more energy near zero, explaining its advantage at low bitrates.</p>
            </div>
            {#if histLoading}
            <span class="rd-chart-status">Computing…</span>
            {:else if histData}
            <span class="rd-chart-status">{appState.imgWidth / 8 | 0}×{appState.imgHeight / 8 | 0} blocks</span>
            {/if}
            {#if appState.originalImageData && !histLoading}
            <button class="tool-btn rd-generate-btn" onclick={generateHistogram} style="margin-left: auto;">
                {histData ? 'Regenerate' : 'Generate'}
            </button>
            {/if}
        </div>

        {#if !appState.originalImageData}
        <div class="rd-chart-empty">Load an image to generate a coefficient histogram.</div>
        {:else if histLoading}
        <div class="rd-chart-empty">Computing transform coefficients for all blocks…</div>
        {:else if !histData}
        <div class="rd-chart-empty">Click Generate to compare DCT vs DWT coefficient sparsity.</div>
        {:else}
        {@const svgW = 700}
        {@const svgH = 240}
        {@const padL = 52}
        {@const padR = 24}
        {@const padT = 18}
        {@const padB = 48}
        {@const chartW = svgW - padL - padR}
        {@const chartH = svgH - padT - padB}
        {@const maxY = Math.max(...histData.dct, ...histData.dwt) * 1.15}
        {@const groupW = chartW / HIST_BINS}
        {@const barW = (groupW - 2) / 2}
        {@const binWidth = HIST_MAX / HIST_BINS}
        {@const mapBarY = (v: number) => padT + chartH - (v / maxY) * chartH}
        <div class="rd-chart-svg-wrap">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="DCT vs DWT coefficient histogram">
                <defs>
                    <clipPath id="histClip">
                        <rect x={padL} y={padT} width={chartW} height={chartH + 1}/>
                    </clipPath>
                </defs>
                <!-- Grid lines -->
                {#each [0.25, 0.5, 0.75, 1.0] as frac}
                {@const gy = padT + chartH * (1 - frac)}
                <line x1={padL} y1={gy} x2={svgW - padR} y2={gy} class="rd-grid-line"/>
                <text x={padL - 5} y={gy + 4} class="rd-axis-text rd-axis-text-end">{(maxY * frac * 100).toFixed(1)}%</text>
                {/each}
                <!-- Axes -->
                <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} class="rd-axis-line"/>
                <line x1={padL} y1={padT + chartH} x2={svgW - padR} y2={padT + chartH} class="rd-axis-line"/>

                <!-- DCT bars (left of each group) -->
                {#each histData.dct as val, i}
                {@const x = padL + i * groupW + 1}
                {@const barH = Math.max(0, (val / maxY) * chartH)}
                <rect x={x} y={padT + chartH - barH} width={barW} height={barH} class="hist-bar-dct" clip-path="url(#histClip)"/>
                {/each}

                <!-- DWT bars (right of each group) -->
                {#each histData.dwt as val, i}
                {@const x = padL + i * groupW + 1 + barW}
                {@const barH = Math.max(0, (val / maxY) * chartH)}
                <rect x={x} y={padT + chartH - barH} width={barW} height={barH} class="hist-bar-dwt" clip-path="url(#histClip)"/>
                {/each}

                <!-- X axis labels every 8 bins -->
                {#each {length: Math.floor(HIST_BINS / 8) + 1} as _, k}
                {@const binIdx = k * 8}
                {#if binIdx <= HIST_BINS}
                <text x={padL + binIdx * groupW} y={padT + chartH + 14} class="rd-axis-text rd-axis-text-middle">
                    {binIdx === HIST_BINS ? `${Math.round(HIST_MAX)}+` : Math.round(binIdx * binWidth)}
                </text>
                {/if}
                {/each}

                <!-- Axis titles -->
                <text x={(padL + svgW - padR) / 2} y={svgH - 2} class="rd-axis-title rd-axis-text-middle">AC Coefficient Magnitude</text>
                <text x={11} y={(padT + padT + chartH) / 2} transform={`rotate(-90 11 ${(padT + padT + chartH) / 2})`} class="rd-axis-title rd-axis-text-middle">Fraction</text>

                <!-- Legend -->
                <rect x={svgW - padR - 90} y={padT + 2} width={9} height={9} class="hist-bar-dct"/>
                <text x={svgW - padR - 77} y={padT + 10} class="rd-axis-text">DCT</text>
                <rect x={svgW - padR - 90} y={padT + 17} width={9} height={9} class="hist-bar-dwt"/>
                <text x={svgW - padR - 77} y={padT + 25} class="rd-axis-text">DWT (Haar)</text>
            </svg>
        </div>

        <!-- Sparsity callout — bin 0 = |coeff| < binWidth -->
        {@const dctNZ = (histData.dct[0] * 100)}
        {@const dwtNZ = (histData.dwt[0] * 100)}
        {@const gain = dwtNZ - dctNZ}
        <div class="rd-current-callout">
            <div class="rd-callout-item">
                <span class="rd-callout-label">DCT near-zero (&lt;{Math.round(binWidth)})</span>
                <span class="rd-callout-value hist-dct-value">{dctNZ.toFixed(1)}%</span>
            </div>
            <div class="rd-callout-sep"></div>
            <div class="rd-callout-item">
                <span class="rd-callout-label">DWT near-zero (&lt;{Math.round(binWidth)})</span>
                <span class="rd-callout-value hist-dwt-value">{dwtNZ.toFixed(1)}%</span>
            </div>
            <div class="rd-callout-sep"></div>
            <div class="rd-callout-item">
                <span class="rd-callout-label">DWT sparsity gain</span>
                <span class="rd-callout-value" class:stat-good={gain > 0} class:stat-poor={gain < 0}>
                    {gain >= 0 ? '+' : ''}{gain.toFixed(1)} pp
                </span>
            </div>
        </div>
        {/if}
    </section>
</div>
