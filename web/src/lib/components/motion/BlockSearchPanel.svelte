<script lang="ts">
    import { onDestroy } from 'svelte';
    import { motionState } from '../../motion/motion-state.svelte.js';
    import { getSearchTrace, getCostSurface, type SearchCandidate } from '../../motion/me-bridge.js';
    import { buildAnimation, stepsPerSecond, visibleCandidates, type SearchAnimation } from '../../motion/search-anim.js';
    import { blockVerdict } from '../../motion/metrics.js';
    import { ALGORITHM_LABELS } from '../../motion/controller.js';
    import { heatColor } from '../../colormap.js';

    const VIEW_PX = 208;

    let windowCanvas: HTMLCanvasElement | undefined = $state();
    let surfaceCanvas: HTMLCanvasElement | undefined = $state();

    let anim = $state.raw<SearchAnimation | null>(null);
    let surface = $state.raw<Int32Array | null>(null);
    let step = $state(-1);
    let playing = $state(false);
    let rafId = 0;

    const run = $derived(motionState.run);
    const block = $derived(motionState.selectedBlock);
    const index = $derived(run && block ? block.row * run.grid.cols + block.col : -1);
    const mv = $derived(run && index >= 0 ? run.mvs[index] : null);
    const truth = $derived(run && index >= 0 ? run.truths[index] : null);
    const verdict = $derived(mv && truth ? blockVerdict(mv, truth) : null);
    const current = $derived<SearchCandidate | null>(anim && step >= 0 ? anim.trace[step] : null);
    const best = $derived<SearchCandidate | null>(anim && step >= 0 ? anim.trace[anim.bestAt[step]] : null);

    const REASONS: Record<string, string> = {
        'out-of-frame': 'its source is partly outside the frame',
        'out-of-range': 'the true motion is larger than the search range',
        'boundary': 'it straddles the edge of the moving object',
        'occluded': 'it shows background the object uncovered',
    };

    // Load the trace and cost surface whenever the block or the result changes.
    $effect(() => {
        const r = run;
        const b = block;
        stop();
        if (!r || !b) {
            anim = null;
            surface = null;
            return;
        }
        const next = buildAnimation(getSearchTrace(b.col, b.row, r.algorithm));
        anim = next;
        surface = getCostSurface(b.col, b.row, r.searchRange);
        step = next.trace.length - 1;  // open on the finished search
    });

    // ===== Playback =====

    function stop(): void {
        playing = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
    }

    function play(): void {
        if (!anim || anim.trace.length === 0) return;
        if (step >= anim.trace.length - 1) step = -1;
        playing = true;
        const rate = stepsPerSecond(anim.trace.length);
        let last = performance.now();
        let carry = 0;
        const tick = (now: number) => {
            if (!playing || !anim) return;
            carry += ((now - last) / 1000) * rate;
            last = now;
            const advance = Math.floor(carry);
            if (advance > 0) {
                carry -= advance;
                step = Math.min(step + advance, anim.trace.length - 1);
            }
            if (step >= anim.trace.length - 1) {
                stop();
                return;
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    }

    function stepOnce(): void {
        stop();
        if (anim) step = step >= anim.trace.length - 1 ? 0 : step + 1;
    }

    function skipToEnd(): void {
        stop();
        if (anim) step = anim.trace.length - 1;
    }

    function close(): void {
        stop();
        motionState.selectedBlock = null;
    }

    onDestroy(stop);

    // ===== Drawing =====

    // Offscreen copy of the reference frame, rebuilt when the frames change.
    let referenceSource: HTMLCanvasElement | null = null;
    let referenceFor: ImageData | null = null;

    function referenceCanvas(): HTMLCanvasElement | null {
        const frames = motionState.frames;
        if (!frames) return null;
        if (referenceFor !== frames.reference || !referenceSource) {
            referenceSource = document.createElement('canvas');
            referenceSource.width = frames.reference.width;
            referenceSource.height = frames.reference.height;
            referenceSource.getContext('2d')?.putImageData(frames.reference, 0, 0);
            referenceFor = frames.reference;
        }
        return referenceSource;
    }

    const ITERATION_HUES = [0, 200, 45, 280, 130, 330, 170, 20];

    function iterationColour(iteration: number, alpha = 1): string {
        return `hsla(${ITERATION_HUES[iteration % ITERATION_HUES.length]}, 90%, 60%, ${alpha})`;
    }

    // Search window: the reference frame around the block, candidates as dots
    // at their block centres, current candidate and best-so-far as outlines.
    $effect(() => {
        const r = run;
        const b = block;
        const a = anim;
        const s = step;
        const t = truth;
        if (!windowCanvas || !r || !b || !a) return;
        const ctx = windowCanvas.getContext('2d');
        const ref = referenceCanvas();
        if (!ctx || !ref) return;

        const bs = r.grid.blockSize;
        const R = r.searchRange;
        const span = bs + 2 * R;
        const k = VIEW_PX / span;
        const x0 = b.col * bs - R;
        const y0 = b.row * bs - R;
        windowCanvas.width = VIEW_PX;
        windowCanvas.height = VIEW_PX;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, VIEW_PX, VIEW_PX);

        // Only the part of the window inside the frame.
        const sx = Math.max(0, x0);
        const sy = Math.max(0, y0);
        const sw = Math.min(ref.width, x0 + span) - sx;
        const sh = Math.min(ref.height, y0 + span) - sy;
        if (sw > 0 && sh > 0) ctx.drawImage(ref, sx, sy, sw, sh, (sx - x0) * k, (sy - y0) * k, sw * k, sh * k);

        // Dim the image so marks stand out.
        ctx.fillStyle = 'rgba(11, 17, 32, 0.35)';
        ctx.fillRect(0, 0, VIEW_PX, VIEW_PX);

        const at = (dx: number, dy: number) => ({ x: (R + dx) * k, y: (R + dy) * k });

        // Where the block sits in the current frame (zero displacement).
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(R * k + 0.5, R * k + 0.5, bs * k - 1, bs * k - 1);
        ctx.setLineDash([]);

        for (const c of visibleCandidates(a, s)) {
            const p = at(c.dx, c.dy);
            ctx.fillStyle = iterationColour(c.iteration, 0.9);
            ctx.beginPath();
            ctx.arc(p.x + (bs * k) / 2, p.y + (bs * k) / 2, Math.max(1.5, k * 0.35), 0, Math.PI * 2);
            ctx.fill();
        }

        if (t && !t.excluded) {
            const p = at(t.dx, t.dy);
            const cx = p.x + (bs * k) / 2;
            const cy = p.y + (bs * k) / 2;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
            ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
            ctx.stroke();
        }

        if (s >= 0) {
            const cur = a.trace[s];
            const bst = a.trace[a.bestAt[s]];
            const pc = at(cur.dx, cur.dy);
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(pc.x, pc.y, bs * k, bs * k);
            const pb = at(bst.dx, bst.dy);
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(pb.x, pb.y, bs * k, bs * k);
        }
    });

    // Cost surface: one cell per displacement, darker = better match.
    $effect(() => {
        const r = run;
        const a = anim;
        const surf = surface;
        const s = step;
        const t = truth;
        if (!surfaceCanvas || !r || !a || !surf) return;
        const ctx = surfaceCanvas.getContext('2d');
        if (!ctx) return;

        const R = r.searchRange;
        const side = 2 * R + 1;
        const cell = VIEW_PX / side;
        surfaceCanvas.width = VIEW_PX;
        surfaceCanvas.height = VIEW_PX;
        ctx.clearRect(0, 0, VIEW_PX, VIEW_PX);

        let min = Infinity;
        let max = -Infinity;
        for (const v of surf) {
            if (v < 0) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const rangeV = max - min || 1;
        for (let i = 0; i < surf.length; i++) {
            const x = (i % side) * cell;
            const y = Math.floor(i / side) * cell;
            if (surf[i] < 0) {
                ctx.fillStyle = '#1e293b';
            } else {
                // sqrt stretches the low end, where the interesting minima are.
                const [cr, cg, cb] = heatColor(Math.sqrt((surf[i] - min) / rangeV));
                ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
            }
            ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
        }

        const centre = (dx: number, dy: number) => ({ x: (dx + R + 0.5) * cell, y: (dy + R + 0.5) * cell });

        for (const c of visibleCandidates(a, s)) {
            const p = centre(c.dx, c.dy);
            ctx.fillStyle = iterationColour(c.iteration);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1.8, cell * 0.28), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        if (t && !t.excluded) {
            const p = centre(t.dx, t.dy);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y);
            ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x, p.y + 6);
            ctx.stroke();
        }

        if (s >= 0) {
            const b = a.trace[a.bestAt[s]];
            const p = centre(b.dx, b.dy);
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(5, cell * 0.7), 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    function fmt(c: { dx: number; dy: number } | null): string {
        if (!c) return '—';
        const f = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
        return `(${f(c.dx)}, ${f(c.dy)})`;
    }
</script>

{#if run && block}
<section class="me-block-panel" aria-label="Block search">
    <figure>
        <canvas bind:this={windowCanvas} width={VIEW_PX} height={VIEW_PX}></canvas>
        <figcaption>Search window in the reference (±{run.searchRange} px). Dots: candidates checked, coloured by
            step. <span class="k-yellow">■</span> current <span class="k-green">■</span> best so far
            <span class="k-white">+</span> true source.</figcaption>
    </figure>
    <figure>
        <canvas bind:this={surfaceCanvas} width={VIEW_PX} height={VIEW_PX}></canvas>
        <figcaption>Cost surface: SAD for every displacement (darker = better match). A fast search
            only sees the dots; if it stops in a dark pocket that isn't the darkest, it has found a local minimum.</figcaption>
    </figure>
    <div class="me-block-info">
        <div class="me-block-head">
            <strong>Block ({block.col}, {block.row})</strong>
            <span>{ALGORITHM_LABELS[run.algorithm]} · {run.grid.blockSize}×{run.grid.blockSize}</span>
            <button class="me-close" onclick={close} aria-label="Close block search">×</button>
        </div>
        <dl>
            <dt>Step</dt><dd>{step + 1} / {anim?.trace.length ?? 0}{#if current}&nbsp;· iteration {current.iteration}{/if}</dd>
            <dt>Candidate</dt><dd>{fmt(current)}{#if current}&nbsp;· SAD {current.sad.toLocaleString()}{/if}</dd>
            <dt>Best so far</dt><dd class="k-green">{fmt(best)}{#if best}&nbsp;· SAD {best.sad.toLocaleString()}{/if}</dd>
            <dt>Vector found</dt><dd>{fmt(mv)}</dd>
            <dt>True vector</dt>
            <dd>
                {#if truth && !truth.excluded}{fmt(truth)}
                {:else if truth && truth.excluded}none: {REASONS[truth.reason]}{/if}
            </dd>
        </dl>
        {#if verdict && verdict !== 'excluded'}
        <p class="me-verdict me-verdict-{verdict}">
            {verdict === 'exact' ? 'Exact match with the true motion.' : verdict === 'close' ? 'Within 1 px of the true motion.' : 'Wrong: the search settled on a different match.'}
        </p>
        {/if}
        <div class="me-block-controls">
            <button class="zoom-ctrl-btn" onclick={playing ? stop : play}>{playing ? 'Pause' : 'Play search'}</button>
            <button class="zoom-ctrl-btn" onclick={stepOnce}>Step</button>
            <button class="zoom-ctrl-btn" onclick={skipToEnd}>End</button>
        </div>
    </div>
</section>
{/if}

<style>
    .me-block-panel {
        flex-shrink: 0;
        display: flex;
        gap: 16px;
        align-items: flex-start;
        padding: 12px 14px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.8);
        color: rgba(226, 232, 240, 0.9);
        overflow-x: auto;
    }

    figure {
        margin: 0;
        width: 208px;
        flex-shrink: 0;
    }

    canvas {
        display: block;
        width: 208px;
        height: 208px;
        border-radius: 6px;
        image-rendering: pixelated;
        background: #0b1120;
    }

    figcaption {
        margin-top: 6px;
        font-size: 0.66rem;
        line-height: 1.4;
        color: rgba(203, 213, 225, 0.75);
    }

    .me-block-info {
        flex: 1;
        min-width: 220px;
        font-size: 0.74rem;
    }

    .me-block-head {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 8px;
    }

    .me-block-head strong {
        color: #f8fafc;
        font-size: 0.85rem;
    }

    .me-block-head span {
        color: rgba(203, 213, 225, 0.7);
    }

    .me-close {
        margin-left: auto;
        border: none;
        background: transparent;
        color: rgba(203, 213, 225, 0.8);
        font-size: 1.2rem;
        line-height: 1;
        cursor: pointer;
    }

    dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 12px;
        margin: 0;
    }

    dt {
        color: rgba(203, 213, 225, 0.65);
    }

    dd {
        margin: 0;
        font-family: var(--font-mono);
        color: #f8fafc;
    }

    .me-verdict {
        margin: 8px 0 0;
        padding: 6px 8px;
        border-radius: 6px;
        font-size: 0.72rem;
    }

    .me-verdict-exact { background: rgba(34, 197, 94, 0.15); color: #86efac; }
    .me-verdict-close { background: rgba(245, 158, 11, 0.15); color: #fcd34d; }
    .me-verdict-wrong { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }

    .me-block-controls {
        display: flex;
        gap: 6px;
        margin-top: 10px;
    }

    .k-yellow { color: #facc15; }
    .k-green { color: #22c55e; }
    .k-white { color: #ffffff; font-weight: 700; }
</style>
