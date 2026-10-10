<script lang="ts">
    import { appState, ViewMode } from '../../state.svelte.js';
    import { isWavelet } from '../../transforms.js';

    interface Props {
        onEnterInspector: () => void;
        onDownload: () => void;
    }

    let { onEnterInspector, onDownload }: Props = $props();

    const wavelet = $derived(isWavelet(appState.transformType));
</script>

<details class="viewer-section" open>
    <summary class="viewer-section-title">Advanced</summary>
    <div class="viewer-section-body">
        <div class="control-group">
            <div class="group-label">Tools</div>
            {#if wavelet}
            <!-- Wavelets transform the whole image at once, so there are no 8×8 blocks to inspect. -->
            <button id="subbands_btn" class="tool-btn"
                class:active={appState.currentViewMode === ViewMode.Subbands}
                onclick={() => appState.currentViewMode = ViewMode.Subbands}
                disabled={!appState.originalImageData}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="1"></rect>
                    <line x1="12" y1="3" x2="12" y2="21"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="7.5" y1="3" x2="7.5" y2="12"></line>
                    <line x1="3" y1="7.5" x2="12" y2="7.5"></line>
                </svg>
                Wavelet Subbands
            </button>
            {:else}
            <button id="inspect_mode_btn" class="tool-btn"
                class:active={appState.isInspectMode}
                onclick={onEnterInspector}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                Inspect Block
            </button>
            {/if}
            <button id="artifact_inspector_btn" class="tool-btn"
                onclick={() => appState.appMode = 'artifact_inspector'}
                disabled={!appState.originalImageData}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                Artifact Inspector
            </button>
            <button id="download_btn" class="tool-btn"
                onclick={onDownload}
                disabled={!appState.originalImageData}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download PNG
            </button>
            {#if wavelet}
            <p class="advanced-hint">The block inspector is specific to the 8×8 DCT. Wavelets have no blocks — explore their subband pyramid instead.</p>
            {:else}
            <p class="advanced-hint">Dive deep into compression artifacts, error heatmaps, and edge distortion analysis.</p>
            {/if}
            <p class="kbd-hint"><kbd>[</kbd> <kbd>]</kbd> quality ±5 · <kbd>T</kbd> cycle transform</p>
        </div>
    </div>
</details>
