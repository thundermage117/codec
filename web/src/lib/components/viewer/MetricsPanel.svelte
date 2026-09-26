<script lang="ts">
    import { appState } from '../../state.svelte.js';

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
</script>

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
