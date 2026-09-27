<script lang="ts">
    import { appState } from '../../state.svelte.js';

    interface Props {
        onEnterInspector: () => void;
    }

    let { onEnterInspector }: Props = $props();
</script>

<details class="viewer-section" open>
    <summary class="viewer-section-title">Advanced</summary>
    <div class="viewer-section-body">
        <div class="control-group">
            <div class="group-label">Tools</div>
            <button id="inspect_mode_btn" class="tool-btn"
                class:active={appState.isInspectMode}
                onclick={onEnterInspector}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                Inspect Block
            </button>
            <button id="artifact_inspector_btn" class="tool-btn"
                onclick={() => appState.appMode = 'artifact_inspector'}
                disabled={!appState.originalImageData}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                Artifact Inspector
            </button>
            <button id="motion_explorer_btn" class="tool-btn"
                onclick={() => appState.appMode = 'motion'}
                disabled={!appState.originalImageData}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6"></path>
                    <path d="M3 6h4M3 18h4"></path>
                </svg>
                Motion Explorer
            </button>
            <p class="advanced-hint">Dive deep into compression artifacts, error heatmaps, and edge distortion analysis — or see how video codecs predict frames with motion vectors.</p>
        </div>
    </div>
</details>
