<script lang="ts">
    import { appState, ViewMode } from '../../state.svelte.js';
    import { TRANSFORMS, isWavelet } from '../../transforms.js';

    const VIEW_MODES = [
        { id: 'view_rgb', val: ViewMode.RGB, label: 'RGB' },
        { id: 'view_artifacts', val: ViewMode.Artifacts, label: 'Error' },
        { id: 'view_y', val: ViewMode.Y, label: 'Y' },
        { id: 'view_cr', val: ViewMode.Cr, label: 'Cr' },
        { id: 'view_cb', val: ViewMode.Cb, label: 'Cb' }
    ];
    const SUBBAND_MODE = { id: 'view_subbands', val: ViewMode.Subbands, label: 'Subbands' };

    // The subband pyramid only exists for wavelet transforms.
    const viewModes = $derived(isWavelet(appState.transformType) ? [...VIEW_MODES, SUBBAND_MODE] : VIEW_MODES);

    // Local slider value so dragging doesn't re-encode on every input event;
    // the committed value is written to appState on change/blur.
    let qualitySliderValue = $state(appState.quality);
    let isQualitySliderInteracting = false;

    // Keep slider UI in sync with committed quality changes from non-slider actions.
    $effect(() => {
        const q = appState.quality;
        if (!isQualitySliderInteracting) qualitySliderValue = q;
    });

    function onQualitySliderInput(event: Event): void {
        qualitySliderValue = Number((event.target as HTMLInputElement).value);
        isQualitySliderInteracting = true;
    }

    function commitQualitySlider(): void {
        isQualitySliderInteracting = false;
        if (appState.quality !== qualitySliderValue) {
            appState.quality = qualitySliderValue;
        }
    }
</script>

<div class="control-group">
    <label for="qualitySlider">
        Quality <span id="qualityValue">{qualitySliderValue}</span>
    </label>
    <div class="preset-group">
        {#each [{ q: 10, label: 'Low', desc: 'Thumbnails' }, { q: 50, label: 'Medium', desc: 'Web / Social' }, { q: 90, label: 'High', desc: 'Print / Archive' }] as preset}
        <button class="preset-btn" data-quality={preset.q}
            class:active={appState.quality === preset.q} aria-pressed={appState.quality === preset.q}
            disabled={!appState.wasmReady}
            onclick={() => { appState.quality = preset.q; }}>
            <span class="preset-label">{preset.label}</span>
            <span class="preset-desc">{preset.desc}</span>
        </button>
        {/each}
    </div>
    <input type="range" id="qualitySlider" min="1" max="100"
        value={qualitySliderValue}
        oninput={onQualitySliderInput}
        onchange={commitQualitySlider}
        onblur={commitQualitySlider}
        disabled={!appState.wasmReady}>
</div>

<div class="control-group">
    <div class="group-label">View Mode</div>
    <div class="toggle-group">
        {#each viewModes as mode}
        <input type="radio" id={mode.id} name="view_mode"
            checked={appState.currentViewMode === mode.val}
            onchange={() => appState.currentViewMode = mode.val}>
        <label for={mode.id}>{mode.label}</label>
        {/each}
    </div>
    {#if appState.currentViewMode === ViewMode.Subbands}
    <p class="control-hint">
        Wavelet pyramid of the luma channel: the top-left thumbnail is the LL
        approximation; each ring of quadrants holds horizontal, vertical and
        diagonal detail at one scale. Black areas were quantized to zero.
    </p>
    {/if}
    {#if appState.currentViewMode === ViewMode.Cr || appState.currentViewMode === ViewMode.Cb}
    <div style="display: flex; align-items: center; gap: 6px;">
        <div class="toggle-group tint-toggle-group" style="flex: 1;">
            <input type="radio" id="tint_color" name="tint_mode"
                checked={appState.tintEnabled}
                onchange={() => appState.tintEnabled = true}>
            <label for="tint_color">Color</label>
            <input type="radio" id="tint_gray" name="tint_mode"
                checked={!appState.tintEnabled}
                onchange={() => appState.tintEnabled = false}>
            <label for="tint_gray">Grayscale</label>
        </div>
        <div class="tooltip-container">
            <span class="info-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
            </span>
            <div class="tooltip-content">
                <strong>Why remove the tint?</strong><br>
                The human eye is biologically wired to detect changes in brightness (Luminance) far
                better than changes in color (Chrominance). Viewing these channels in grayscale
                helps you see fine details and artifacts that get lost in the color tint.
            </div>
        </div>
    </div>
    {/if}
</div>

<div class="control-group">
    <div class="group-label">Chroma Subsampling</div>
    <div class="toggle-group">
        {#each [{ id: 'cs_444', val: 444, label: '4:4:4' }, { id: 'cs_422', val: 422, label: '4:2:2' }, { id: 'cs_420', val: 420, label: '4:2:0' }] as cs}
        <input type="radio" id={cs.id} name="chroma_subsampling"
            checked={appState.currentCsMode === cs.val}
            onchange={() => appState.currentCsMode = cs.val}>
        <label for={cs.id}>{cs.label}</label>
        {/each}
    </div>
</div>

<div class="control-group">
    <div class="group-label">Transform</div>
    <div class="toggle-group">
        {#each TRANSFORMS as t}
        <input type="radio" id="v_transform_{t.slug}" name="v_transform_type"
            checked={appState.transformType === t.value}
            onchange={() => appState.transformType = t.value}>
        <label for="v_transform_{t.slug}" title={t.fullName}>{t.label}</label>
        {/each}
    </div>
</div>
