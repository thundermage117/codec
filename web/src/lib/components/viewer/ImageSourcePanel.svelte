<script lang="ts">
    import { appState } from '../../state.svelte.js';

    interface Props {
        dropZoneVisible: boolean;
        activeTestImageIndex: number | null;
        onFile: (file: File) => void;
        onTestImage: (index: number) => void;
    }

    let { dropZoneVisible = $bindable(), activeTestImageIndex, onFile, onTestImage }: Props = $props();

    const TEST_IMAGE_COUNT = 20; // Kodak dataset
    let testImagesOpen = $state(false);
    let fileInput: HTMLInputElement | undefined = $state();

    function onFileInput(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) onFile(file);
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        dropZoneVisible = false;
        const file = e.dataTransfer?.files[0];
        if (file) onFile(file);
    }

    function openFilePicker() {
        fileInput?.click();
    }

    function onDropZoneKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFilePicker();
        }
    }
</script>

    <input type="file" id="fileInput" accept="image/*" bind:this={fileInput}
        disabled={!appState.wasmReady}
        onchange={onFileInput}
        style="display:none">
{#if !appState.wasmReady}
<div class="stats">
    <span id="status">{appState.status}</span>
</div>
{/if}

{#if dropZoneVisible}
<div class="drop-zone" id="dropZone"
    role="button"
    tabindex="0"
    aria-label="Upload image"
    onclick={openFilePicker}
    onkeydown={onDropZoneKeyDown}
    ondragover={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('drag-over'); }}
    ondragleave={(e) => (e.currentTarget as HTMLElement).classList.remove('drag-over')}
    ondrop={onDrop}>
    <svg class="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <path d="M21 15l-5-5L5 21"></path>
    </svg>
    <div class="drop-zone-text">Drop an image here</div>
    <div class="drop-zone-hint">or <span class="browse-link">browse to upload</span></div>
</div>
{:else}
<button class="tool-btn" onclick={openFilePicker}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 16 12 12 8 16"></polyline>
        <line x1="12" y1="12" x2="12" y2="21"></line>
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
    </svg>
    Load new image
</button>
{/if}

<!-- Sample / built-in test images -->
<div class="test-images-section">
    <button
        class="test-images-toggle"
        class:has-active={activeTestImageIndex !== null}
        onclick={() => testImagesOpen = !testImagesOpen}
        disabled={!appState.wasmReady}
        aria-expanded={testImagesOpen}>
        <!-- Mini preview strip: 3 sample thumbnails -->
        <div class="test-images-preview-strip" aria-hidden="true">
            {#each [1, 8, 15] as n}
            <img src="/test-images/{n}.png" alt="" />
            {/each}
        </div>
        <span class="test-images-toggle-label">
            Sample Images
            {#if activeTestImageIndex !== null}
            <span class="test-images-active-dot"></span>
            {/if}
        </span>
        <span class="test-images-count">{TEST_IMAGE_COUNT}</span>
        <svg class="chevron" class:open={testImagesOpen} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    </button>
    {#if testImagesOpen}
    <div class="test-images-panel">
        <div class="test-images-scroll">
            <div class="test-images-grid">
                {#each {length: TEST_IMAGE_COUNT} as _, i}
                <button
                    class="test-img-btn"
                    class:active={activeTestImageIndex === i} aria-pressed={activeTestImageIndex === i}
                    onclick={() => onTestImage(i)}
                    title="Kodak #{i}"
                    aria-label="Load Kodak test image {i}">
                    <img src="/test-images/{i}.png" alt="" loading="lazy" />
                    <span class="test-img-label">{i}</span>
                    {#if activeTestImageIndex === i}
                    <span class="test-img-active-check" aria-hidden="true">
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="2 6 5 9 10 3"></polyline>
                        </svg>
                    </span>
                    {/if}
                </button>
                {/each}
            </div>
        </div>
        <p class="test-images-credit">Kodak Lossless True Color Image Suite</p>
    </div>
    {/if}
</div>
