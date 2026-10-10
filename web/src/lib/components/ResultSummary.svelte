<script lang="ts">
    import { appState } from '../state.svelte.js';

    // What the current settings cost and buy: estimated size, then luma
    // quality. Per-channel numbers stay one click away.

    interface Props {
        /** Show the estimated file size (only the viewer keeps it up to date). */
        showSize?: boolean;
    }

    let { showSize = true }: Props = $props();

    type MetricState = 'good' | 'moderate' | 'poor';
    const psnrState = (v: number): MetricState => v >= 40 ? 'good' : v >= 30 ? 'moderate' : 'poor';
    const ssimState = (v: number): MetricState => v >= 0.95 ? 'good' : v >= 0.9 ? 'moderate' : 'poor';

    const channels = $derived([
        { channel: 'Y', psnr: appState.psnr.y, ssim: appState.ssim.y },
        { channel: 'Cr', psnr: appState.psnr.cr, ssim: appState.ssim.cr },
        { channel: 'Cb', psnr: appState.psnr.cb, ssim: appState.ssim.cb }
    ]);
</script>

{#if !appState.originalImageData}
<div class="analysis-placeholder">Load an image to see what compression costs.</div>
{:else}
<div class="result-summary">
    {#if showSize && appState.fileSizeInfo}
    {@const size = appState.fileSizeInfo}
    <div class="result-size">
        <span class="result-size-value has-hint" title="Estimated from the entropy of the quantized coefficients. A real encoder's file would be close, but not identical.">~{size.estimated}</span>
        <span class="result-size-note">{size.ratio}× smaller than {size.original} raw</span>
    </div>
    {/if}
    <div class="result-quality">
        <div class="result-stat" title="Peak signal-to-noise ratio of the luma (brightness) channel. Above 40 dB is near-transparent; below 30 dB is visibly degraded.">
            <span class="result-stat-label">PSNR</span>
            <span class="result-stat-value stat-{psnrState(appState.psnr.y)}">{appState.psnr.y.toFixed(1)} <small>dB</small></span>
        </div>
        <div class="result-stat" title="Structural similarity of the luma channel, from 0 to 1. Above 0.95 looks near-identical.">
            <span class="result-stat-label">SSIM</span>
            <span class="result-stat-value stat-{ssimState(appState.ssim.y)}">{appState.ssim.y.toFixed(3)}</span>
        </div>
    </div>
    <details class="result-details">
        <summary title="PSNR and SSIM for brightness (Y) and both colour-difference channels (Cr, Cb)">Per channel</summary>
        <div class="compact-metrics-grid">
            <div class="metric-header-row">
                <div class="metric-col-label">Channel</div>
                <div class="metric-col-label">PSNR (dB)</div>
                <div class="metric-col-label">SSIM</div>
            </div>
            {#each channels as metric}
            <div class="metric-row">
                <div class="metric-channel-name">{metric.channel}</div>
                <div class="metric-cell psnr-cell stat-{psnrState(metric.psnr)}">{metric.psnr.toFixed(2)}</div>
                <div class="metric-cell ssim-cell stat-{ssimState(metric.ssim)}">{metric.ssim.toFixed(4)}</div>
            </div>
            {/each}
        </div>
    </details>
</div>
{/if}

<style>
    .result-summary {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .result-size {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .result-size-value {
        font-size: 1.6rem;
        font-weight: 700;
        line-height: 1.1;
        color: var(--text);
        font-variant-numeric: tabular-nums;
    }

    .result-size-note {
        font-size: 0.75rem;
        color: var(--text-muted);
    }

    .result-quality {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .result-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle, var(--border));
        cursor: help;
    }

    .result-stat-label {
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--text-muted);
    }

    .result-stat-value {
        font-size: 1rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }

    .result-stat-value small {
        font-size: 0.7rem;
        font-weight: 600;
        opacity: 0.7;
    }

    .result-details summary {
        cursor: pointer;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-muted);
        user-select: none;
    }

    .result-details summary:hover {
        color: var(--text);
    }

    .result-details[open] summary {
        margin-bottom: 8px;
    }
</style>
