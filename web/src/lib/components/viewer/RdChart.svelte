<script module lang="ts"></script>

<script lang="ts">
    import { appState } from '../../state.svelte.js';
    import { formatBytes } from '../../format.js';

    export type RdPoint = {
        quality: number;
        psnr: number;
        bitrate: number;
        estimatedBytes: number;
    };

    interface Props {
        rdPointsDct: RdPoint[];
        rdPointsDwt: RdPoint[];
        rdLoading: boolean;
        rdError: string;
        sampleCount: number;
        onGenerate: () => void;
    }

    let { rdPointsDct, rdPointsDwt, rdLoading, rdError, sampleCount, onGenerate }: Props = $props();

    function smoothSvgPath(pts: {x: number, y: number}[]): string {
        if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x},${pts[0].y}` : '';
        let d = `M ${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            const cpx = (p0.x + p1.x) / 2;
            d += ` C ${cpx},${p0.y} ${cpx},${p1.y} ${p1.x},${p1.y}`;
        }
        return d;
    }
</script>

<div class="card rd-card">
    <section class="rd-chart-panel" aria-live="polite">
        <div class="rd-chart-header">
            <div>
                <h3>Rate-Distortion Curve</h3>
                <p>Quality tradeoff: higher bitrate usually improves PSNR.</p>
            </div>
            {#if rdLoading}
            <span class="rd-chart-status">Sampling…</span>
            {:else if rdPointsDct.length > 0 || rdPointsDwt.length > 0}
            <span class="rd-chart-status">{rdPointsDct.length + rdPointsDwt.length} points</span>
            {/if}
            {#if appState.originalImageData && !rdLoading}
            <button class="tool-btn rd-generate-btn" onclick={onGenerate} style="margin-left: auto;">
                {rdPointsDct.length > 0 ? 'Regenerate' : 'Generate'}
            </button>
            {/if}
        </div>

        {#if !appState.originalImageData}
        <div class="rd-chart-empty">Load an image to generate an RD plot.</div>
        {:else if rdError}
        <div class="rd-chart-empty">{rdError}</div>
        {:else if rdLoading && rdPointsDct.length === 0 && rdPointsDwt.length === 0}
        <div class="rd-chart-empty">Sampling {sampleCount} quality levels…</div>
        {:else if rdPointsDct.length === 0 && rdPointsDwt.length === 0}
        <div class="rd-chart-empty">Click Generate to compute the rate-distortion curve.</div>
        {:else if rdPointsDct.length >= 2 || rdPointsDwt.length >= 2}
        {@const svgW = 700}
        {@const svgH = 280}
        {@const padL = 64}
        {@const padR = 20}
        {@const padT = 18}
        {@const padB = 52}
        {@const allPoints = [...rdPointsDct, ...rdPointsDwt]}
        {@const xMinRaw = Math.min(...allPoints.map((p) => p.bitrate))}
        {@const xMaxRaw = Math.max(...allPoints.map((p) => p.bitrate))}
        {@const yMinRaw = Math.min(...allPoints.map((p) => p.psnr))}
        {@const yMaxRaw = Math.max(...allPoints.map((p) => p.psnr))}
        {@const xPad = Math.max(0.05, (xMaxRaw - xMinRaw) * 0.08)}
        {@const yPad = Math.max(0.5, (yMaxRaw - yMinRaw) * 0.12)}
        {@const xMin = xMinRaw - xPad}
        {@const xMax = xMaxRaw + xPad}
        {@const yMin = yMinRaw - yPad}
        {@const yMax = yMaxRaw + yPad}
        {@const chartW = svgW - padL - padR}
        {@const chartH = svgH - padT - padB}
        {@const mapX = (v: number) => padL + ((v - xMin) / (xMax - xMin || 1)) * chartW}
        {@const mapY = (v: number) => svgH - padB - ((v - yMin) / (yMax - yMin || 1)) * chartH}
        {@const xTicks = Array.from({length: 5}, (_, i) => xMinRaw + i * (xMaxRaw - xMinRaw) / 4)}
        {@const yTicks = Array.from({length: 5}, (_, i) => yMinRaw + i * (yMaxRaw - yMinRaw) / 4)}
        
        {@const ptsDct = rdPointsDct.map(p => ({ x: mapX(p.bitrate), y: mapY(p.psnr) }))}
        {@const curvePathDct = smoothSvgPath(ptsDct)}
        {@const fillPathDct = ptsDct.length > 0 ? curvePathDct + ` L ${ptsDct[ptsDct.length - 1].x},${svgH - padB} L ${ptsDct[0].x},${svgH - padB} Z` : ''}
        
        {@const ptsDwt = rdPointsDwt.map(p => ({ x: mapX(p.bitrate), y: mapY(p.psnr) }))}
        {@const curvePathDwt = smoothSvgPath(ptsDwt)}
        {@const fillPathDwt = ptsDwt.length > 0 ? curvePathDwt + ` L ${ptsDwt[ptsDwt.length - 1].x},${svgH - padB} L ${ptsDwt[0].x},${svgH - padB} Z` : ''}

        {@const targetPoints = appState.transformType === 0 ? rdPointsDct : rdPointsDwt}
        {@const currentPoint = targetPoints.length > 0 
            ? targetPoints.reduce((best, p) => Math.abs(p.quality - appState.quality) < Math.abs(best.quality - appState.quality) ? p : best)
            : (allPoints.reduce((best, p) => Math.abs(p.quality - appState.quality) < Math.abs(best.quality - appState.quality) ? p : best))}
        {@const cpx = mapX(currentPoint.bitrate)}
        {@const cpy = mapY(currentPoint.psnr)}
        <div class="rd-chart-svg-wrap">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Rate-distortion curve">
                <defs>
                    <linearGradient id="rdFillGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style="stop-color: var(--primary); stop-opacity: 0.15;"/>
                        <stop offset="100%" style="stop-color: var(--primary); stop-opacity: 0.01;"/>
                    </linearGradient>
                    <linearGradient id="rdFillGradDwt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style="stop-color: #f59e0b; stop-opacity: 0.15;"/>
                        <stop offset="100%" style="stop-color: #f59e0b; stop-opacity: 0.01;"/>
                    </linearGradient>
                    <clipPath id="rdClip">
                        <rect x={padL} y={padT} width={chartW} height={chartH + 1}/>
                    </clipPath>
                </defs>
                {#each yTicks as tick}
                <line x1={padL} y1={mapY(tick)} x2={svgW - padR} y2={mapY(tick)} class="rd-grid-line"/>
                {/each}
                {#each xTicks as tick}
                <line x1={mapX(tick)} y1={padT} x2={mapX(tick)} y2={svgH - padB} class="rd-grid-line"/>
                {/each}
                <line x1={padL} y1={svgH - padB} x2={svgW - padR} y2={svgH - padB} class="rd-axis-line"/>
                <line x1={padL} y1={padT} x2={padL} y2={svgH - padB} class="rd-axis-line"/>
                
                <!-- DCT Curve -->
                {#if ptsDct.length > 0}
                <path d={fillPathDct} class="rd-fill" clip-path="url(#rdClip)"/>
                <path d={curvePathDct} class="rd-curve-path" clip-path="url(#rdClip)"/>
                {/if}

                <!-- DWT Curve -->
                {#if ptsDwt.length > 0}
                <path d={fillPathDwt} class="rd-fill-dwt" clip-path="url(#rdClip)"/>
                <path d={curvePathDwt} class="rd-curve-path rd-curve-path-dwt" clip-path="url(#rdClip)"/>
                {/if}

                <line x1={cpx} y1={padT} x2={cpx} y2={svgH - padB} class="rd-crosshair" style="stroke: {appState.transformType === 0 ? 'var(--primary)' : '#f59e0b'}"/>
                <line x1={padL} y1={cpy} x2={svgW - padR} y2={cpy} class="rd-crosshair" style="stroke: {appState.transformType === 0 ? 'var(--primary)' : '#f59e0b'}"/>
                
                {#each rdPointsDct as point}
                <circle
                    cx={mapX(point.bitrate)}
                    cy={mapY(point.psnr)}
                    r={point.quality === appState.quality && appState.transformType === 0 ? 5.5 : 3.5}
                    class="rd-point"
                    class:rd-point-current={point.quality === appState.quality && appState.transformType === 0}
                    role="button"
                    tabindex="0"
                    aria-label="Set quality to {point.quality}"
                    onclick={() => { appState.quality = point.quality; appState.transformType = 0; }}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { appState.quality = point.quality; appState.transformType = 0; } }}>
                    <title>DCT: Q{point.quality} · {point.psnr.toFixed(2)} dB · {point.bitrate.toFixed(2)} bpp</title>
                </circle>
                {/each}

                {#each rdPointsDwt as point}
                <circle
                    cx={mapX(point.bitrate)}
                    cy={mapY(point.psnr)}
                    r={point.quality === appState.quality && appState.transformType === 1 ? 5.5 : 3.5}
                    class="rd-point rd-point-dwt"
                    class:rd-point-current-dwt={point.quality === appState.quality && appState.transformType === 1}
                    role="button"
                    tabindex="0"
                    aria-label="Set quality to {point.quality}"
                    onclick={() => { appState.quality = point.quality; appState.transformType = 1; }}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { appState.quality = point.quality; appState.transformType = 1; } }}>
                    <title>DWT: Q{point.quality} · {point.psnr.toFixed(2)} dB · {point.bitrate.toFixed(2)} bpp</title>
                </circle>
                {/each}

                <text x={cpx} y={Math.max(padT + 12, cpy - 10)} class="rd-point-label rd-axis-text-middle" style="fill: {appState.transformType === 0 ? 'var(--primary)' : '#f59e0b'}">Q{currentPoint.quality}</text>
                
                <!-- Legend -->
                <rect x={padL + 10} y={padT + 5} width={10} height={3} class="rd-curve-path" style="stroke-width: 2;"/>
                <text x={padL + 25} y={padT + 9} class="rd-axis-text">DCT</text>
                <rect x={padL + 60} y={padT + 5} width={10} height={3} class="rd-curve-path rd-curve-path-dwt" style="stroke-width: 2;"/>
                <text x={padL + 75} y={padT + 9} class="rd-axis-text">DWT (Haar)</text>
                {#each xTicks as tick}
                <text x={mapX(tick)} y={svgH - padB + 14} class="rd-axis-text rd-axis-text-middle">{tick.toFixed(2)}</text>
                {/each}
                {#each yTicks as tick}
                <text x={padL - 6} y={mapY(tick) + 4} class="rd-axis-text rd-axis-text-end">{tick.toFixed(1)}</text>
                {/each}
                <text x={(padL + svgW - padR) / 2} y={svgH - 4} class="rd-axis-title rd-axis-text-middle">Bitrate (bits per pixel)</text>
                <text x={14} y={(padT + svgH - padB) / 2} transform={`rotate(-90 14 ${(padT + svgH - padB) / 2})`} class="rd-axis-title rd-axis-text-middle">PSNR Y (dB)</text>
            </svg>
        </div>

        <div class="rd-current-callout">
            <div class="rd-callout-item">
                <span class="rd-callout-label">Quality</span>
                <span class="rd-callout-value">Q{currentPoint.quality}</span>
            </div>
            <div class="rd-callout-sep"></div>
            <div class="rd-callout-item">
                <span class="rd-callout-label">Bitrate</span>
                <span class="rd-callout-value">{currentPoint.bitrate.toFixed(2)} bpp</span>
            </div>
            <div class="rd-callout-sep"></div>
            <div class="rd-callout-item">
                <span class="rd-callout-label">PSNR Y</span>
                <span class="rd-callout-value">{currentPoint.psnr.toFixed(2)} dB</span>
            </div>
            <div class="rd-callout-sep"></div>
            <div class="rd-callout-item">
                <span class="rd-callout-label">Est. size</span>
                <span class="rd-callout-value">~{formatBytes(currentPoint.estimatedBytes)}</span>
            </div>
        </div>
        {:else}
        <div class="rd-chart-empty">Need more samples to render an RD curve.</div>
        {/if}
    </section>
</div>
