<script lang="ts">
    import { appState } from '../state.svelte.js';

    // One quality control for every mode: label, presets and slider.
    // The committed value lives in appState.quality and is written when the
    // slider is released (change/blur). While dragging, `onPreview` (if given)
    // is called at most once per animation frame so the mode can show a cheap
    // live preview without committing.

    interface Props {
        /** Prefix for element ids: `${idPrefix}Slider` and `${idPrefix}Value`. */
        idPrefix: string;
        onPreview?: (quality: number) => void;
    }

    let { idPrefix, onPreview }: Props = $props();

    const PRESETS = [
        { q: 10, label: 'Low', desc: 'Thumbnails' },
        { q: 50, label: 'Medium', desc: 'Web / Social' },
        { q: 90, label: 'High', desc: 'Print / Archive' }
    ];

    let sliderValue = $state(appState.quality);
    let dragging = false;
    let previewFrame = 0;

    // Follow committed changes made elsewhere (presets, shortcuts, RD chart, URL).
    $effect(() => {
        const q = appState.quality;
        if (!dragging) sliderValue = q;
    });

    function onInput(event: Event): void {
        sliderValue = Number((event.target as HTMLInputElement).value);
        dragging = true;
        if (!onPreview || previewFrame) return;
        previewFrame = requestAnimationFrame(() => {
            previewFrame = 0;
            if (dragging) onPreview?.(sliderValue);
        });
    }

    function commit(): void {
        dragging = false;
        if (previewFrame) {
            cancelAnimationFrame(previewFrame);
            previewFrame = 0;
        }
        if (appState.quality !== sliderValue) appState.quality = sliderValue;
    }

    $effect(() => () => {
        if (previewFrame) cancelAnimationFrame(previewFrame);
    });
</script>

<div class="control-group">
    <label for="{idPrefix}Slider">
        Quality <span id="{idPrefix}Value">{sliderValue}</span>
    </label>
    <div class="preset-group">
        {#each PRESETS as preset}
        <button class="preset-btn" data-quality={preset.q}
            class:active={appState.quality === preset.q} aria-pressed={appState.quality === preset.q}
            disabled={!appState.wasmReady}
            onclick={() => { appState.quality = preset.q; }}>
            <span class="preset-label">{preset.label}</span>
            <span class="preset-desc">{preset.desc}</span>
        </button>
        {/each}
    </div>
    <input type="range" id="{idPrefix}Slider" min="1" max="100"
        value={sliderValue}
        oninput={onInput}
        onchange={commit}
        onblur={commit}
        disabled={!appState.wasmReady}>
</div>
