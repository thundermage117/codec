<script lang="ts">
    import { motionState } from '../../motion/motion-state.svelte.js';
    import { compensationGain } from '../../motion/metrics.js';
    import { ALGORITHM_LABELS } from '../../motion/controller.js';

    interface Props {
        onCompare: () => void;
    }

    let { onCompare }: Props = $props();

    const run = $derived(motionState.run);
    const gain = $derived(run ? compensationGain(run.stats.meanAbsResidual, run.stats.meanAbsFrameDiff) : 0);
    const perBlock = $derived(run ? run.stats.candidates / Math.max(1, run.mvs.length) : 0);
</script>

{#if !run}
<div class="analysis-placeholder">{motionState.computing ? 'Estimating motion…' : 'No result yet.'}</div>
{:else}
<div class="me-metrics">
    <div class="me-metric me-metric-wide">
        <span class="me-metric-label">Motion compensation removes</span>
        <span class="me-metric-value" class:stat-good={gain >= 60} class:stat-moderate={gain >= 30 && gain < 60}
            class:stat-poor={gain < 30}>{gain.toFixed(0)}%</span>
        <span class="me-metric-sub">of the frame-to-frame error
            (mean |error| {run.stats.meanAbsFrameDiff.toFixed(1)} → {run.stats.meanAbsResidual.toFixed(1)})</span>
    </div>

    <div class="me-metric">
        <span class="me-metric-label">Prediction PSNR</span>
        <span class="me-metric-value">{run.stats.predictionPsnr >= 99 ? '∞' : run.stats.predictionPsnr.toFixed(1)}<small> dB</small></span>
    </div>
    <div class="me-metric">
        <span class="me-metric-label">Search time</span>
        <span class="me-metric-value">{run.elapsedMs.toFixed(0)}<small> ms</small></span>
    </div>

    <div class="me-metric">
        <span class="me-metric-label">Exact vectors</span>
        <span class="me-metric-value" class:stat-good={run.accuracy.exactPercent >= 90}
            class:stat-moderate={run.accuracy.exactPercent >= 60 && run.accuracy.exactPercent < 90}
            class:stat-poor={run.accuracy.exactPercent < 60}>
            {run.accuracy.scored ? run.accuracy.exactPercent.toFixed(0) + '%' : '—'}
        </span>
        <span class="me-metric-sub">{run.accuracy.scored} scored · {run.accuracy.excluded} no single truth</span>
    </div>
    <div class="me-metric">
        <span class="me-metric-label">Mean vector error</span>
        <span class="me-metric-value">{run.accuracy.scored ? run.accuracy.meanEndpointError.toFixed(2) : '—'}<small> px</small></span>
    </div>

    <div class="me-metric me-metric-wide">
        <span class="me-metric-label">Candidates checked</span>
        <span class="me-metric-value">{Math.round(perBlock).toLocaleString()}<small> per block</small></span>
        <span class="me-metric-sub">{run.stats.candidates.toLocaleString()} SAD evaluations over {run.mvs.length.toLocaleString()} blocks</span>
    </div>
</div>

<button class="tool-btn me-compare-btn" onclick={onCompare} disabled={motionState.comparing}>
    {motionState.comparing ? 'Comparing…' : 'Compare all algorithms'}
</button>

{#if motionState.comparison}
<table class="me-compare-table">
    <thead>
        <tr><th>Algorithm</th><th>Checks/block</th><th>Exact</th><th>Error</th><th>ms</th></tr>
    </thead>
    <tbody>
        {#each motionState.comparison as row}
        <tr class:current={row.algorithm === motionState.algorithm}>
            <td>{ALGORITHM_LABELS[row.algorithm]}</td>
            <td>{Math.round(row.candidates / Math.max(1, run.mvs.length))}</td>
            <td>{row.exactPercent.toFixed(0)}%</td>
            <td>{row.meanEndpointError.toFixed(2)}</td>
            <td>{row.elapsedMs.toFixed(0)}</td>
        </tr>
        {/each}
    </tbody>
</table>
{/if}
{/if}

<style>
    .me-metrics {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .me-metric {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--card-bg);
        min-width: 0;
    }

    .me-metric-wide {
        grid-column: 1 / -1;
    }

    .me-metric-label {
        font-size: 0.62rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
    }

    .me-metric-value {
        font-family: var(--font-mono);
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--text);
    }

    .me-metric-value small {
        font-size: 0.65rem;
        font-weight: 600;
        color: var(--text-muted);
    }

    .me-metric-sub {
        font-size: 0.66rem;
        color: var(--text-muted);
        line-height: 1.35;
    }

    .me-compare-btn {
        width: 100%;
        margin-top: 10px;
    }

    .me-compare-table {
        width: 100%;
        margin-top: 8px;
        border-collapse: collapse;
        font-size: 0.7rem;
    }

    .me-compare-table th,
    .me-compare-table td {
        padding: 5px 4px;
        text-align: right;
        border-bottom: 1px solid var(--border);
    }

    .me-compare-table th:first-child,
    .me-compare-table td:first-child {
        text-align: left;
    }

    .me-compare-table th {
        font-size: 0.6rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
    }

    .me-compare-table td {
        font-family: var(--font-mono);
        color: var(--text);
    }

    .me-compare-table tr.current td {
        color: var(--primary);
        font-weight: 700;
    }
</style>
