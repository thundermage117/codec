<script lang="ts">
    import { motionState } from '../../motion/motion-state.svelte.js';
    import { SearchAlgorithm } from '../../motion/me-bridge.js';

    const ALGORITHMS = [
        { id: 'me_alg_full', val: SearchAlgorithm.Full, label: 'Full' },
        { id: 'me_alg_tss', val: SearchAlgorithm.ThreeStep, label: '3-Step' },
        { id: 'me_alg_ds', val: SearchAlgorithm.Diamond, label: 'Diamond' },
    ];

    const ALGORITHM_HINTS: Record<number, string> = {
        [SearchAlgorithm.Full]: 'Tries every displacement in the window. Always finds the best match, at the highest cost.',
        [SearchAlgorithm.ThreeStep]: 'Checks 8 neighbours at a large step, moves to the best, halves the step. Fast, but can lock onto a wrong basin.',
        [SearchAlgorithm.Diamond]: 'Walks a large diamond downhill until the centre wins, then refines with a small one. Used by real encoders.',
    };

    const BLOCK_SIZES = [8, 16, 32];
</script>

<div class="control-group">
    <div class="group-label">Search algorithm</div>
    <div class="toggle-group">
        {#each ALGORITHMS as a}
        <input type="radio" id={a.id} name="me_algorithm"
            checked={motionState.algorithm === a.val}
            onchange={() => motionState.algorithm = a.val}>
        <label for={a.id}>{a.label}</label>
        {/each}
    </div>
    <p class="me-hint">{ALGORITHM_HINTS[motionState.algorithm]}</p>
</div>

<div class="control-group">
    <div class="group-label">Block size</div>
    <div class="toggle-group">
        {#each BLOCK_SIZES as bs}
        <input type="radio" id="me_bs_{bs}" name="me_block_size"
            checked={motionState.blockSize === bs}
            onchange={() => motionState.blockSize = bs}>
        <label for="me_bs_{bs}">{bs}×{bs}</label>
        {/each}
    </div>
</div>

<div class="control-group">
    <label for="me-range">
        Search range
        <span>±{motionState.searchRange} px</span>
    </label>
    <input type="range" id="me-range" min="2" max="32" step="1"
        value={motionState.searchRange}
        oninput={(e) => motionState.searchRange = Number((e.target as HTMLInputElement).value)}>
</div>

<style>
    .me-hint {
        margin: 6px 0 0;
        font-size: 0.72rem;
        line-height: 1.45;
        color: var(--text-muted);
    }
</style>
