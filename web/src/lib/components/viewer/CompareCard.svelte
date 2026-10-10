<script lang="ts">
    import RdChart, { type RdPoint } from './RdChart.svelte';
    import CoeffHistogram from './CoeffHistogram.svelte';

    // DCT vs the wavelets, side by side: what each costs (rate–distortion)
    // and why (how sparse each makes the image).

    interface Props {
        series: Record<number, RdPoint[]>;
        rdLoading: boolean;
        rdError: string;
        sampleCount: number;
    }

    let { series, rdLoading, rdError, sampleCount }: Props = $props();

    const TABS = [
        { id: 'rd', label: 'Size vs quality', desc: 'Quality (PSNR) against bits per pixel for every transform. Higher and further left is better; click a point to use it.' },
        { id: 'sparsity', label: 'Sparsity', desc: 'Where each transform puts the detail. Coefficients that quantize to zero are nearly free to store.' }
    ] as const;

    let tab = $state<(typeof TABS)[number]['id']>('rd');
    const current = $derived(TABS.find(t => t.id === tab)!);
</script>

<div class="card compare-card">
    <div class="compare-header">
        <h3>Compare transforms</h3>
        <div class="compare-tabs" role="tablist" aria-label="Comparison chart">
            {#each TABS as t}
            <button role="tab" id="compare-tab-{t.id}" aria-selected={tab === t.id} aria-controls="compare-panel"
                class:active={tab === t.id} onclick={() => tab = t.id}>{t.label}</button>
            {/each}
        </div>
    </div>
    <p class="compare-desc">{current.desc}</p>
    <div id="compare-panel" role="tabpanel" aria-labelledby="compare-tab-{tab}">
        {#if tab === 'rd'}
        <RdChart {series} {rdLoading} {rdError} {sampleCount} />
        {:else}
        <CoeffHistogram />
        {/if}
    </div>
</div>

<style>
    .compare-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .compare-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 4px 4px 0;
    }

    .compare-header h3 {
        margin: 0;
        font-size: 0.82rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--text-muted);
    }

    .compare-tabs {
        display: flex;
        gap: 2px;
        padding: 3px;
        border-radius: 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle, var(--border));
    }

    .compare-tabs button {
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.75rem;
        font-weight: 600;
        padding: 5px 12px;
        border-radius: 6px;
        cursor: pointer;
    }

    .compare-tabs button:hover {
        color: var(--text);
    }

    .compare-tabs button.active {
        background: var(--card-bg);
        color: var(--primary);
        box-shadow: var(--shadow-sm);
    }

    .compare-desc {
        margin: 0;
        padding: 0 4px;
        font-size: 0.75rem;
        color: var(--text-muted);
    }
</style>
