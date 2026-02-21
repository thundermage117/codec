<script lang="ts">
    import { appState, ViewMode } from './lib/state.svelte.js';
    import { setupWasm } from './lib/wasm-bridge.js';
    import ViewerMode from './ViewerMode.svelte';
    import InspectorMode from './InspectorMode.svelte';
    import ArtifactInspectorMode from './ArtifactInspectorMode.svelte';

    // WASM init
    setupWasm(() => {
        appState.wasmReady = true;
        appState.status = 'WASM Module Ready!';
    });

    // Global keyboard handler
    function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.preventDefault();
            appState.appMode = 'viewer';
            appState.currentViewMode = ViewMode.RGB;
            appState.isInspectMode = false;
            appState.highlightBlock = null;
            return;
        }

        if (appState.appMode !== 'inspector') return;

        if (e.key === '?') {
            const shortcuts = document.querySelector('.sidebar-shortcuts') as HTMLElement | null;
            if (shortcuts) shortcuts.style.display = shortcuts.style.display === 'none' ? '' : 'none';
            return;
        }

        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            if (!appState.inspectedBlock || !appState.originalImageData) return;

            const maxBx = Math.floor(appState.imgWidth / 8) - 1;
            const maxBy = Math.floor(appState.imgHeight / 8) - 1;
            let { x: bx, y: by } = appState.inspectedBlock;

            if (e.key === 'ArrowLeft') bx = Math.max(0, bx - 1);
            if (e.key === 'ArrowRight') bx = Math.min(maxBx, bx + 1);
            if (e.key === 'ArrowUp') by = Math.max(0, by - 1);
            if (e.key === 'ArrowDown') by = Math.min(maxBy, by + 1);

            appState.inspectedBlock = { x: bx, y: by };
            // inspectorMode component handles the re-inspection reactively
        }
    }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if appState.appMode === 'viewer'}
    <ViewerMode />
{:else}
    {#if appState.appMode === 'inspector'}
        <InspectorMode />
    {:else if appState.appMode === 'artifact_inspector'}
        <ArtifactInspectorMode />
    {/if}
{/if}
