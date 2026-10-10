<script lang="ts">
    import { appState } from '../../state.svelte.js';
    import { formatBytes } from '../../format.js';
    import { TRANSFORMS, transformInfo } from '../../transforms.js';

    export type RdPoint = {
        quality: number;
        psnr: number;
        bitrate: number;
        estimatedBytes: number;
    };

    interface Props {
        /** RD samples keyed by transform value (see TRANSFORMS). */
        series: Record<number, RdPoint[]>;
        rdLoading: boolean;
        rdError: string;
        sampleCount: number;
    }

    let { series, rdLoading, rdError, sampleCount }: Props = $props();

    const plotted = $derived(TRANSFORMS
        .map(t => ({ info: t, points: series[t.value] ?? [] }))
        .filter(s => s.points.length > 0));
    const allPoints = $derived(plotted.flatMap(s => s.points));
    const activeColor = $derived(transformInfo(appState.transformType).color);

    function selectPoint(transform: number, quality: number): void {
        appState.quality = quality;
        appState.transformType = transformInfo(transform).value;
    }

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

<section class="rd-chart-panel" aria-live="polite">
    {#if !appState.originalImageData}
    <div class="rd-chart-empty">Load an image to generate an RD plot.</div>
    {:else if rdError}
    <div class="rd-chart-empty">{rdError}</div>
    {:else if rdLoading && allPoints.length === 0}
    <div class="rd-chart-empty">Sampling {sampleCount} quality levels × {TRANSFORMS.length} transforms…</div>
    {:else if allPoints.length === 0}
    <div class="rd-chart-empty">Preparing the curve…</div>
    {:else if plotted.some(s => s.points.length >= 2)}
    {@const svgW = 700}
    {@const svgH = 280}
    {@const padL = 64}
    {@const padR = 20}
    {@const padT = 18}
    {@const padB = 52}
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
    
    {@const curves = plotted.map(({ info, points }) => {
        const pts = points.map(p => ({ x: mapX(p.bitrate), y: mapY(p.psnr) }));
        const path = smoothSvgPath(pts);
        const fill = pts.length > 0 ? path + ` L ${pts[pts.length - 1].x},${svgH - padB} L ${pts[0].x},${svgH - padB} Z` : '';
        return { info, points, path, fill };
    })}

    {@const targetPoints = series[appState.transformType] ?? []}
    {@const candidates = targetPoints.length > 0 ? targetPoints : allPoints}
    {@const currentPoint = candidates.reduce((best, p) => Math.abs(p.quality - appState.quality) < Math.abs(best.quality - appState.quality) ? p : best)}
    {@const cpx = mapX(currentPoint.bitrate)}
    {@const cpy = mapY(currentPoint.psnr)}
    <div class="rd-chart-svg-wrap">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Rate-distortion curve">
            <defs>
                {#each curves as curve}
                <linearGradient id="rdFillGrad-{curve.info.slug}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color: {curve.info.color}; stop-opacity: 0.12;"/>
                    <stop offset="100%" style="stop-color: {curve.info.color}; stop-opacity: 0.01;"/>
                </linearGradient>
                {/each}
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
            
            {#each curves as curve}
            <path d={curve.fill} fill="url(#rdFillGrad-{curve.info.slug})" clip-path="url(#rdClip)"/>
            <path d={curve.path} class="rd-curve-path" style="stroke: {curve.info.color}" clip-path="url(#rdClip)"/>
            {/each}

            <line x1={cpx} y1={padT} x2={cpx} y2={svgH - padB} class="rd-crosshair" style="stroke: {activeColor}"/>
            <line x1={padL} y1={cpy} x2={svgW - padR} y2={cpy} class="rd-crosshair" style="stroke: {activeColor}"/>

            {#each curves as curve}
            {#each curve.points as point}
            {@const isCurrent = point.quality === appState.quality && appState.transformType === curve.info.value}
            <circle
                cx={mapX(point.bitrate)}
                cy={mapY(point.psnr)}
                r={isCurrent ? 5.5 : 3.5}
                class="rd-point"
                class:rd-point-current={isCurrent}
                style="stroke: {isCurrent ? 'var(--card-bg, #fff)' : curve.info.color}; {isCurrent ? `fill: ${curve.info.color}` : ''}"
                role="button"
                tabindex="0"
                aria-label="Use {curve.info.label} at quality {point.quality}"
                onclick={() => selectPoint(curve.info.value, point.quality)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectPoint(curve.info.value, point.quality); }}>
                <title>{curve.info.label}: Q{point.quality} · {point.psnr.toFixed(2)} dB · {point.bitrate.toFixed(2)} bpp · ~{formatBytes(point.estimatedBytes)}</title>
            </circle>
            {/each}
            {/each}

            <text x={cpx} y={Math.max(padT + 12, cpy - 10)} class="rd-point-label rd-axis-text-middle" style="fill: {activeColor}">Q{currentPoint.quality}</text>

            <!-- Legend -->
            {#each curves as curve, i}
            <rect x={padL + 10 + i * 80} y={padT + 5} width={10} height={3} style="fill: {curve.info.color}"/>
            <text x={padL + 25 + i * 80} y={padT + 9} class="rd-axis-text">{curve.info.label}</text>
            {/each}
            {#each xTicks as tick}
            <text x={mapX(tick)} y={svgH - padB + 14} class="rd-axis-text rd-axis-text-middle">{tick.toFixed(2)}</text>
            {/each}
            {#each yTicks as tick}
            <text x={padL - 6} y={mapY(tick) + 4} class="rd-axis-text rd-axis-text-end">{tick.toFixed(1)}</text>
            {/each}
            <text x={(padL + svgW - padR) / 2} y={svgH - 4} class="rd-axis-title rd-axis-text-middle has-hint"><title>Estimated stored bits divided by the number of pixels. Lower means a smaller file.</title>Bitrate (bits per pixel)</text>
            <text x={14} y={(padT + svgH - padB) / 2} transform={`rotate(-90 14 ${(padT + svgH - padB) / 2})`} class="rd-axis-title rd-axis-text-middle has-hint"><title>Peak signal-to-noise ratio of the brightness channel. Higher is closer to the original; above about 40 dB differences are hard to see.</title>PSNR Y (dB)</text>
        </svg>
    </div>

    {:else}
    <div class="rd-chart-empty">Need more samples to render an RD curve.</div>
    {/if}
</section>
