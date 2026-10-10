<script lang="ts">
    import { appState } from '../state.svelte.js';
    import { TRANSFORMS } from '../transforms.js';

    // Transform and chroma subsampling: the settings every mode shares
    // besides quality (see QualityControl).

    interface Props {
        /** Prefix for input ids/names, so several instances never collide. */
        idPrefix: string;
    }

    let { idPrefix }: Props = $props();

    const CS_MODES = [
        { val: 444, label: '4:4:4', title: 'Full colour resolution' },
        { val: 422, label: '4:2:2', title: 'Colour at half horizontal resolution' },
        { val: 420, label: '4:2:0', title: 'Colour at quarter resolution (JPEG default)' }
    ];
</script>

<div class="control-group">
    <div class="group-label"><span class="has-hint" title="How the image is turned into frequencies before quantization. DCT works on 8×8 blocks (JPEG); Haar and CDF 9/7 are wavelets over the whole image (JPEG 2000 uses CDF 9/7).">Transform</span></div>
    <div class="toggle-group">
        {#each TRANSFORMS as t}
        <input type="radio" id="{idPrefix}_t_{t.slug}" name="{idPrefix}_transform"
            checked={appState.transformType === t.value}
            onchange={() => appState.transformType = t.value}>
        <label for="{idPrefix}_t_{t.slug}" title={t.fullName}>{t.label}</label>
        {/each}
    </div>
</div>

<div class="control-group">
    <div class="group-label"><span class="has-hint" title="How much colour resolution is kept. The eye is far less sensitive to colour than to brightness, so JPEG usually stores colour at a lower resolution.">Chroma subsampling</span></div>
    <div class="toggle-group">
        {#each CS_MODES as cs}
        <input type="radio" id="{idPrefix}_cs_{cs.val}" name="{idPrefix}_chroma"
            checked={appState.currentCsMode === cs.val}
            onchange={() => appState.currentCsMode = cs.val}>
        <label for="{idPrefix}_cs_{cs.val}" title={cs.title}>{cs.label}</label>
        {/each}
    </div>
</div>
