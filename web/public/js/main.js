import { state } from './state.js';
import { setupWasm, getViewPtr, getStats, free, processImage } from './wasm-bridge.js';
import { handleFileSelect, getProcessedContext, getOriginalContext } from './image-manager.js';
import { setupControls, updateComparisonView, updateFileSizeEstimate } from './ui-controls.js';
import { inspectBlock } from './inspection.js';
import { computeSuggestedBlocks, renderSuggestedBlocks } from './suggested-blocks.js';

// DOM Elements
const statusDiv = document.getElementById('status');
const fileInput = document.getElementById('fileInput');

function onWasmReady() {
    state.wasmReady = true;
    if (statusDiv) {
        statusDiv.innerText = "WASM Module Ready!";
        statusDiv.classList.add('ready');
    }

    // Enable controls
    const controls = document.querySelectorAll('input:disabled, button:disabled');
    controls.forEach(el => el.disabled = false);

    console.log("WASM Runtime Initialized (Module)");
}

function render() {
    if (!state.wasmReady || !state.originalImageData) return;

    const rgbaSize = state.imgWidth * state.imgHeight * 4;
    let outputPtr = 0;
    try {
        outputPtr = getViewPtr(state.currentViewMode);
        if (!outputPtr) throw new Error("WASM get_view_ptr returned null");

        // Create ImageData from WASM memory
        const dataView = new Uint8ClampedArray(Module.HEAPU8.buffer, outputPtr, rgbaSize);
        const imageData = new ImageData(dataView, state.imgWidth, state.imgHeight);

        const ctx = getProcessedContext();
        ctx.putImageData(imageData, 0, 0);

        // Update Stats
        const stats = getStats();

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setText('psnrY', stats.psnr.y.toFixed(2));
        setText('psnrCr', stats.psnr.cr.toFixed(2));
        setText('psnrCb', stats.psnr.cb.toFixed(2));

        setText('ssimY', stats.ssim.y.toFixed(4));
        setText('ssimCr', stats.ssim.cr.toFixed(4));
        setText('ssimCb', stats.ssim.cb.toFixed(4));

        // Highlight Logic
        const origCtx = getOriginalContext();
        if (origCtx) {
            origCtx.putImageData(state.originalImageData, 0, 0);

            if (state.isInspectMode && state.highlightBlock) {
                const bx = state.highlightBlock.x * 8;
                const by = state.highlightBlock.y * 8;
                origCtx.strokeStyle = "#ff0000";
                origCtx.lineWidth = 1;
                origCtx.strokeRect(bx, by, 8, 8);
            }
        }

    } catch (err) {
        console.error("Render error:", err);
    } finally {
        if (outputPtr) free(outputPtr);
    }

    // Dynamic Updates for Inspector
    if (state.isInspectMode) {
        updateSuggestionsUI();
    }
}

// ===== Mode Switching =====

export function enterInspectorMode() {
    state.appMode = 'inspector';
    state.isInspectMode = true;

    const viewerMode = document.getElementById('viewerMode');
    const inspectorMode = document.getElementById('inspectorMode');
    if (viewerMode) viewerMode.style.display = 'none';
    if (inspectorMode) inspectorMode.style.display = 'block';

    // Sync sidebar controls from viewer controls
    syncControlsToInspector();

    // Render thumbnail
    renderThumbnail();

    // Compute and render suggested blocks
    computeSuggestedBlocks();
    renderSuggestedBlocks('suggestedBlocksList', (bx, by) => {
        inspectBlock(bx, by);
        renderContextCrop(bx, by);
        highlightThumbnailBlock(bx, by);
    });

    // If a block was already being inspected, re-inspect it
    if (state.inspectedBlock) {
        inspectBlock(state.inspectedBlock.x, state.inspectedBlock.y);
        renderContextCrop(state.inspectedBlock.x, state.inspectedBlock.y);
        highlightThumbnailBlock(state.inspectedBlock.x, state.inspectedBlock.y);
    }
}

export function exitInspectorMode() {
    state.appMode = 'viewer';
    state.isInspectMode = false;

    const viewerMode = document.getElementById('viewerMode');
    const inspectorMode = document.getElementById('inspectorMode');
    if (viewerMode) viewerMode.style.display = 'block';
    if (inspectorMode) inspectorMode.style.display = 'none';

    // Sync viewer controls from inspector sidebar
    syncControlsToViewer();

    // Re-process and render with potentially changed settings
    if (state.wasmReady && state.originalImageData) {
        const qualitySlider = document.getElementById('qualitySlider');
        const quality = qualitySlider ? parseInt(qualitySlider.value) : 50;
        processImage(quality, state.currentCsMode);
        render();
        updateFileSizeEstimate();
    }

    // Uncheck inspect toggle in viewer
    const inspectToggle = document.getElementById('inspect_mode');
    if (inspectToggle) inspectToggle.checked = false;

    // Reset comparison slider state
    const comparisonViewer = document.querySelector('.comparison-viewer');
    const comparisonSlider = document.getElementById('comparisonSlider');
    const sliderContainer = document.querySelector('.slider-container');
    if (comparisonViewer) comparisonViewer.style.cursor = 'col-resize';
    if (sliderContainer) sliderContainer.classList.remove('disabled');
    if (comparisonSlider) comparisonSlider.disabled = false;

    state.highlightBlock = null;
}

export function updateSuggestionsUI() {
    if (!state.wasmReady || !state.originalImageData) return;

    // Recompute based on current processed image (which changes with quality)
    computeSuggestedBlocks();

    renderSuggestedBlocks('suggestedBlocksList', (bx, by) => {
        state.inspectedBlock = { x: bx, y: by };
        inspectBlock(bx, by);
        renderContextCrop(bx, by);
        highlightThumbnailBlock(bx, by);
    });

    // Maintain active state if current block is in suggestions
    if (state.inspectedBlock) {
        const { x, y } = state.inspectedBlock;
        const btn = document.querySelector(`.suggested-block-btn[data-bx="${x}"][data-by="${y}"]`);
        if (btn) btn.classList.add('active');
    }
}

// Global Keyboard Listeners
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (state.isInspectMode) {
            exitInspectorMode();
        }
    }
});

function syncControlsToInspector() {
    // Quality
    const viewerQuality = document.getElementById('qualitySlider');
    const inspQuality = document.getElementById('inspQualitySlider');
    const inspQualityVal = document.getElementById('inspQualityValue');
    if (viewerQuality && inspQuality) {
        inspQuality.value = viewerQuality.value;
        if (inspQualityVal) inspQualityVal.textContent = viewerQuality.value;
    }

    // View mode: fallback to Y if viewer mode (like RGB/Error) isn't in inspector
    const viewerViewMode = document.querySelector('input[name="view_mode"]:checked');
    if (viewerViewMode) {
        const inspRadio = document.getElementById(`insp_view_${viewerViewMode.value}`);
        if (inspRadio) {
            inspRadio.checked = true;
            inspRadio.dispatchEvent(new Event('change'));
        } else {
            const fallback = document.getElementById('insp_view_y');
            if (fallback) {
                fallback.checked = true;
                fallback.dispatchEvent(new Event('change'));
            }
        }
    }

    // Chroma subsampling
    const viewerCS = document.querySelector('input[name="chroma_subsampling"]:checked');
    if (viewerCS) {
        const inspCS = document.getElementById(`insp_cs_${viewerCS.value}`);
        if (inspCS) inspCS.checked = true;
    }
}

function syncControlsToViewer() {
    // Quality
    const inspQuality = document.getElementById('inspQualitySlider');
    const viewerQuality = document.getElementById('qualitySlider');
    const viewerQualityVal = document.getElementById('qualityValue');
    if (inspQuality && viewerQuality) {
        viewerQuality.value = inspQuality.value;
        if (viewerQualityVal) viewerQualityVal.textContent = inspQuality.value;
    }

    // View mode
    const inspViewMode = document.querySelector('input[name="insp_view_mode"]:checked');
    if (inspViewMode) {
        const viewerRadio = document.querySelector(`input[name="view_mode"][value="${inspViewMode.value}"]`);
        if (viewerRadio) viewerRadio.checked = true;
    }

    // Chroma subsampling
    const inspCS = document.querySelector('input[name="insp_chroma_subsampling"]:checked');
    if (inspCS) {
        const viewerCS = document.querySelector(`input[name="chroma_subsampling"][value="${inspCS.value}"]`);
        if (viewerCS) viewerCS.checked = true;
    }
}

function invalidateThumbnailCache() {
    cachedThumbnailCanvas = null;
}

// ===== Thumbnail Navigator =====

let cachedThumbnailCanvas = null;

function renderThumbnail() {
    if (!state.originalImageData) return;

    const canvas = document.getElementById('thumbnailCanvas');
    if (!canvas) return;

    // Size to fit sidebar width (238px content area ~ 270 - 2*16 px)
    const maxW = 238;
    const aspect = state.imgHeight / state.imgWidth;
    const thumbW = Math.min(maxW, state.imgWidth);
    const thumbH = Math.round(thumbW * aspect);

    canvas.width = thumbW;
    canvas.height = thumbH;

    const ctx = canvas.getContext('2d');

    // Create or update cache if dimensions or image data changed
    if (!cachedThumbnailCanvas ||
        cachedThumbnailCanvas.width !== thumbW ||
        cachedThumbnailCanvas.height !== thumbH) {

        cachedThumbnailCanvas = document.createElement('canvas');
        cachedThumbnailCanvas.width = thumbW;
        cachedThumbnailCanvas.height = thumbH;
        const cCtx = cachedThumbnailCanvas.getContext('2d');

        // Draw original image scaled down to cache
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = state.imgWidth;
        tempCanvas.height = state.imgHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(state.originalImageData, 0, 0);

        cCtx.drawImage(tempCanvas, 0, 0, thumbW, thumbH);
    }

    ctx.drawImage(cachedThumbnailCanvas, 0, 0);
}

function highlightThumbnailBlock(bx, by) {
    const canvas = document.getElementById('thumbnailCanvas');
    if (!canvas || !state.originalImageData) return;

    // Re-render thumbnail first to clear old highlight
    renderThumbnail();

    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / state.imgWidth;
    const scaleY = canvas.height / state.imgHeight;

    const x = bx * 8 * scaleX;
    const y = by * 8 * scaleY;
    const w = 8 * scaleX;
    const h = 8 * scaleY;

    // Draw highlight box
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Draw crosshair lines
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = 1;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, canvas.height);
    ctx.moveTo(0, cy);
    ctx.lineTo(canvas.width, cy);
    ctx.stroke();
}

// ===== Context Crop =====

export function renderContextCrop(bx, by) {
    const canvas = document.getElementById('contextCropCanvas');
    const caption = document.getElementById('contextCropCaption');
    if (!canvas || !state.originalImageData) return;

    const ctx = canvas.getContext('2d');

    // The crop region: 8 blocks (64px) centered on the target block
    const cropSize = 64; // pixels in each direction from the block center
    const blockPxX = bx * 8 + 4; // center of block
    const blockPxY = by * 8 + 4;

    const sx = Math.max(0, Math.min(state.imgWidth - cropSize, blockPxX - cropSize / 2));
    const sy = Math.max(0, Math.min(state.imgHeight - cropSize, blockPxY - cropSize / 2));
    const sw = Math.min(cropSize, state.imgWidth - sx);
    const sh = Math.min(cropSize, state.imgHeight - sy);

    canvas.width = cropSize;
    canvas.height = cropSize;

    // Create a temporary canvas with the full original image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = state.imgWidth;
    tempCanvas.height = state.imgHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(state.originalImageData, 0, 0);

    // Draw the cropped region to fill the context crop canvas
    ctx.clearRect(0, 0, cropSize, cropSize);
    ctx.drawImage(tempCanvas, sx, sy, sw, sh, 0, 0, cropSize, cropSize);

    // Highlight the selected 8×8 block within the crop
    const highlightX = bx * 8 - sx;
    const highlightY = by * 8 - sy;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(highlightX, highlightY, 8, 8);

    if (caption) {
        caption.textContent = `Block (${bx}, ${by}) — pixel (${bx * 8}, ${by * 8})`;
    }
}

// ===== Setup Thumbnail Click =====

function setupThumbnailClick() {
    const container = document.getElementById('thumbnailContainer');
    const canvas = document.getElementById('thumbnailCanvas');
    if (!container || !canvas) return;

    const getBlockFromEvent = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scaleX = state.imgWidth / rect.width;
        const scaleY = state.imgHeight / rect.height;

        const imgX = x * scaleX;
        const imgY = y * scaleY;

        const bx = Math.floor(imgX / 8);
        const by = Math.floor(imgY / 8);

        const maxBx = Math.floor(state.imgWidth / 8) - 1;
        const maxBy = Math.floor(state.imgHeight / 8) - 1;

        return {
            bx: Math.max(0, Math.min(maxBx, bx)),
            by: Math.max(0, Math.min(maxBy, by)),
            valid: bx >= 0 && bx <= maxBx && by >= 0 && by <= maxBy
        };
    };

    canvas.addEventListener('click', (e) => {
        if (!state.originalImageData) return;
        const { bx, by, valid } = getBlockFromEvent(e);

        if (valid) {
            state.inspectedBlock = { x: bx, y: by };
            inspectBlock(bx, by);
            renderContextCrop(bx, by);
            highlightThumbnailBlock(bx, by);

            // Clear active state on suggested blocks
            document.querySelectorAll('.suggested-block-btn').forEach(b => b.classList.remove('active'));
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!state.originalImageData) return;
        const { bx, by, valid } = getBlockFromEvent(e);
        if (valid) {
            highlightThumbnailBlock(bx, by);
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (!state.originalImageData) return;
        if (state.inspectedBlock) {
            highlightThumbnailBlock(state.inspectedBlock.x, state.inspectedBlock.y);
        } else {
            renderThumbnail();
        }
    });
}

// Initial Setup
setupWasm(onWasmReady);

// ===== Theme Toggle =====
const themeToggle = document.getElementById('themeToggle');
function updateThemeIcons() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const sunIcon = themeToggle?.querySelector('.icon-sun');
    const moonIcon = themeToggle?.querySelector('.icon-moon');
    if (sunIcon) sunIcon.style.display = isDark ? 'none' : 'block';
    if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
}
updateThemeIcons();

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
        updateThemeIcons();
    });
}

// ===== Drop Zone / File Input =====
const dropZone = document.getElementById('dropZone');

function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    handleFileSelect(file, () => {
        invalidateThumbnailCache();
        processImage(50, state.currentCsMode);
        updateComparisonView(50);
        render();
        updateFileSizeEstimate();
        if (dropZone) dropZone.style.display = 'none';
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        loadFile(e.target.files[0]);
    });
}

if (dropZone) {
    dropZone.addEventListener('click', () => {
        if (fileInput) fileInput.click();
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files[0];
        loadFile(file);
    });
}

// ===== Keyboard Navigation =====
document.addEventListener('keydown', (e) => {
    // Only handle keys when in inspector mode
    if (state.appMode !== 'inspector') return;

    // Escape: exit inspector mode
    if (e.key === 'Escape') {
        e.preventDefault();
        exitInspectorMode();
        return;
    }

    // ? key: toggle keyboard shortcuts hint visibility
    if (e.key === '?') {
        const shortcuts = document.querySelector('.sidebar-shortcuts');
        if (shortcuts) {
            shortcuts.style.display = shortcuts.style.display === 'none' ? '' : 'none';
        }
        return;
    }

    // Arrow keys: navigate between blocks
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        if (!state.inspectedBlock || !state.originalImageData) return;

        const maxBx = Math.floor(state.imgWidth / 8) - 1;
        const maxBy = Math.floor(state.imgHeight / 8) - 1;

        let { x: bx, y: by } = state.inspectedBlock;

        switch (e.key) {
            case 'ArrowLeft': bx = Math.max(0, bx - 1); break;
            case 'ArrowRight': bx = Math.min(maxBx, bx + 1); break;
            case 'ArrowUp': by = Math.max(0, by - 1); break;
            case 'ArrowDown': by = Math.min(maxBy, by + 1); break;
        }

        state.inspectedBlock = { x: bx, y: by };
        inspectBlock(bx, by);
        renderContextCrop(bx, by);
        highlightThumbnailBlock(bx, by);

        // Update active state on suggested blocks
        document.querySelectorAll('.suggested-block-btn').forEach(b => {
            const btnBx = parseInt(b.dataset.bx);
            const btnBy = parseInt(b.dataset.by);
            b.classList.toggle('active', btnBx === bx && btnBy === by);
        });
    }
});

// ===== Back Button =====
const inspectorBackBtn = document.getElementById('inspectorBackBtn');
if (inspectorBackBtn) {
    inspectorBackBtn.addEventListener('click', () => {
        exitInspectorMode();
    });
}

// Setup UI Controls (pass render + enterInspectorMode)
setupControls(render, enterInspectorMode);

// Setup thumbnail click handler
setupThumbnailClick();
