<script lang="ts">
    import { appState } from '../../state.svelte.js';
    import { motionState } from '../../motion/motion-state.svelte.js';
    import { estimateFrameBits, type FrameBits } from '../../motion/me-bridge.js';
    import { formatBytes } from '../../format.js';

    let bits = $state.raw<FrameBits | null>(null);
    let qualityValue = $state(appState.quality);

    // Recompute for every new result or committed quality.
    $effect(() => {
        const run = motionState.run;
        const q = appState.quality;
        qualityValue = q;
        bits = run ? estimateFrameBits(q) : null;
    });

    const pBits = $derived(bits ? bits.residualBits + bits.vectorBits : 0);
    const ratio = $derived(bits && pBits > 0 ? bits.intraBits / pBits : 0);
    const scaleMax = $derived(bits ? Math.max(bits.intraBits, pBits, 1) : 1);
    const pct = (v: number) => `${Math.max(0.5, (v / scaleMax) * 100)}%`;

    function commitQuality(): void {
        if (appState.quality !== qualityValue) appState.quality = qualityValue;
    }
</script>

{#if bits && bits.intraBits > 0}
<div class="me-bits">
    <div class="control-group">
        <label for="me-quality">
            Quality
            <span>{qualityValue}</span>
        </label>
        <input type="range" id="me-quality" min="1" max="100" value={qualityValue}
            oninput={(e) => qualityValue = Number((e.target as HTMLInputElement).value)}
            onchange={commitQuality} onblur={commitQuality}>
    </div>

    <div class="me-bar-row">
        <span class="me-bar-label">I frame</span>
        <div class="me-bar"><i class="intra" style:width={pct(bits.intraBits)}></i></div>
        <span class="me-bar-value">{formatBytes(Math.round(bits.intraBits / 8))}</span>
    </div>
    <div class="me-bar-row">
        <span class="me-bar-label">P frame</span>
        <div class="me-bar">
            <i class="residual" style:width={pct(bits.residualBits)}></i>
            <i class="vectors" style:width={pct(bits.vectorBits)}></i>
        </div>
        <span class="me-bar-value">{formatBytes(Math.round(pBits / 8))}</span>
    </div>
    <div class="me-bits-keys">
        <span><i class="intra"></i>DCT of the frame</span>
        <span><i class="residual"></i>DCT of the residual</span>
        <span><i class="vectors"></i>Motion vectors</span>
    </div>

    <p class="me-bits-summary">
        {#if ratio >= 1}
        Coding the residual plus vectors takes <strong>{ratio.toFixed(1)}× fewer bits</strong> than coding the frame on its own.
        {:else}
        Here prediction does not pay off: the P frame costs {(1 / ratio).toFixed(1)}× more than an I frame.
        {/if}
        {(bits.skippedBlocks / bits.blocks * 100).toFixed(0)}% of residual blocks quantize to nothing and cost 1 bit each.
    </p>
    <p class="me-bits-note">Luma only, JPEG-style symbol estimate; vectors cost signed Exp-Golomb bits relative to the median of their neighbours.</p>
</div>
{/if}

<style>
    .me-bits {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .me-bar-row {
        display: grid;
        grid-template-columns: 52px 1fr 64px;
        align-items: center;
        gap: 8px;
        font-size: 0.7rem;
    }

    .me-bar-label {
        font-weight: 700;
        color: var(--text);
    }

    .me-bar-value {
        text-align: right;
        font-family: var(--font-mono);
        color: var(--text);
    }

    .me-bar {
        display: flex;
        height: 12px;
        border-radius: 4px;
        background: var(--border);
        overflow: hidden;
    }

    .me-bar i,
    .me-bits-keys i {
        display: block;
    }

    .intra { background: #64748b; }
    .residual { background: var(--primary); }
    .vectors { background: #f59e0b; }

    .me-bits-keys {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        font-size: 0.64rem;
        color: var(--text-muted);
    }

    .me-bits-keys span {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .me-bits-keys i {
        width: 9px;
        height: 9px;
        border-radius: 2px;
    }

    .me-bits-summary {
        margin: 4px 0 0;
        font-size: 0.72rem;
        line-height: 1.45;
        color: var(--text);
    }

    .me-bits-note {
        margin: 0;
        font-size: 0.64rem;
        line-height: 1.4;
        color: var(--text-muted);
    }
</style>
