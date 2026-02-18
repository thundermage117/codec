import { state, ViewMode } from './state.js';
import { processImage, setViewTint, inspectBlockData } from './wasm-bridge.js';
import { inspectBlock } from './inspection.js';
import { getOriginalContext } from './image-manager.js';

export function setupControls(renderCallback, enterInspectorMode) {
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const viewModeRadios = document.querySelectorAll('input[name="view_mode"]');
    const csRadios = document.querySelectorAll('input[name="chroma_subsampling"]');
    const tintToggle = document.getElementById('tint_toggle');
    const comparisonSlider = document.getElementById('comparisonSlider');
    const comparisonViewer = document.querySelector('.comparison-viewer');
    const inspectToggle = document.getElementById('inspect_mode');
    const sliderContainer = document.querySelector('.slider-container');

    // Inspector sidebar controls
    const inspQualitySlider = document.getElementById('inspQualitySlider');
    const inspQualityValue = document.getElementById('inspQualityValue');
    const inspViewModeRadios = document.querySelectorAll('input[name="insp_view_mode"]');
    const inspCSRadios = document.querySelectorAll('input[name="insp_chroma_subsampling"]');
    const inspPresetBtns = document.querySelectorAll('.insp-preset-btn');

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Re-inspect the current block after settings change
    function reinspectIfNeeded() {
        if (state.inspectedBlock && state.wasmReady) {
            inspectBlock(state.inspectedBlock.x, state.inspectedBlock.y);
        }
    }

    const debouncedUpdate = debounce(() => {
        if (!state.wasmReady || !state.originalImageData) return;
        processImage(parseInt(qualitySlider.value), state.currentCsMode);
        renderCallback();
        reinspectIfNeeded();
        updateFileSizeEstimate();
    }, 150);

    // Inspector sidebar debounced update — processes with inspector slider
    const debouncedInspUpdate = debounce(() => {
        if (!state.wasmReady || !state.originalImageData) return;
        const quality = inspQualitySlider ? parseInt(inspQualitySlider.value) : 50;
        processImage(quality, state.currentCsMode);
        renderCallback();
        reinspectIfNeeded();
        updateFileSizeEstimate();
    }, 150);

    if (qualitySlider) {
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value;
            updatePresetHighlight(parseInt(qualitySlider.value));
            if (state.originalImageData) debouncedUpdate();
        });
    }

    // Quality Presets (viewer)
    const presetBtns = document.querySelectorAll('.preset-btn:not(.insp-preset-btn)');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const q = parseInt(btn.dataset.quality);
            if (qualitySlider) {
                qualitySlider.value = q;
                qualityValue.textContent = q;
            }
            updatePresetHighlight(q);
            if (state.originalImageData) debouncedUpdate();
        });
    });

    function updatePresetHighlight(quality) {
        presetBtns.forEach(btn => {
            const bq = parseInt(btn.dataset.quality);
            btn.classList.toggle('active', bq === quality);
        });
    }

    viewModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            switch (e.target.value) {
                case 'artifacts': state.currentViewMode = ViewMode.Artifacts; break;
                case 'y': state.currentViewMode = ViewMode.Y; break;
                case 'cr': state.currentViewMode = ViewMode.Cr; break;
                case 'cb': state.currentViewMode = ViewMode.Cb; break;
                default: state.currentViewMode = ViewMode.RGB; break;
            }
            if (state.originalImageData) {
                renderCallback();
                reinspectIfNeeded();
            }
        });
    });

    csRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.currentCsMode = parseInt(e.target.value, 10);
            if (state.originalImageData) debouncedUpdate();
        });
    });

    if (tintToggle) {
        tintToggle.addEventListener('change', (e) => {
            if (state.wasmReady) {
                setViewTint(e.target.checked ? 1 : 0);
                if (state.originalImageData) {
                    renderCallback();
                    reinspectIfNeeded();
                }
            }
        });
    }

    // ===== Inspect Toggle → triggers full-page inspector mode =====
    if (inspectToggle) {
        inspectToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                state.isInspectMode = true;

                if (comparisonViewer) {
                    comparisonViewer.style.cursor = 'crosshair';
                }
                if (sliderContainer) {
                    sliderContainer.classList.add('disabled');
                    if (comparisonSlider) comparisonSlider.disabled = true;
                }

                // Enter full-page inspector mode
                if (enterInspectorMode) enterInspectorMode();
            } else {
                state.isInspectMode = false;
                state.highlightBlock = null;
                state.inspectedBlock = null;

                if (comparisonViewer) {
                    comparisonViewer.style.cursor = 'col-resize';
                }
                if (sliderContainer) {
                    sliderContainer.classList.remove('disabled');
                    if (comparisonSlider) comparisonSlider.disabled = false;
                }

                renderCallback();
            }
        });
    }

    // Comparison Viewer Interaction
    if (comparisonViewer && comparisonSlider) {
        comparisonSlider.addEventListener('input', (e) => {
            updateComparisonView(e.target.value);
        });

        const handleInteraction = (clientX) => {
            const rect = comparisonViewer.getBoundingClientRect();
            const x = clientX - rect.left;
            const percent = (x / rect.width) * 100;
            updateComparisonView(percent);
        };

        comparisonViewer.addEventListener('mousedown', (e) => {
            if (state.isInspectMode) return;
            state.isDragging = true;
            comparisonViewer.style.cursor = 'grabbing';
            handleInteraction(e.clientX);
        });

        document.addEventListener('mouseup', () => {
            state.isDragging = false;
            if (comparisonViewer && !state.isInspectMode) comparisonViewer.style.cursor = 'col-resize';
        });

        document.addEventListener('mouseleave', () => { state.isDragging = false; });

        document.addEventListener('mousemove', (e) => {
            if (state.isDragging) handleInteraction(e.clientX);

            // Highlight Logic
            if (state.isInspectMode && state.originalImageData && !state.isDragging) {
                const rect = comparisonViewer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const scaleX = state.imgWidth / rect.width;
                const scaleY = state.imgHeight / rect.height;

                const imgX = Math.floor(x * scaleX);
                const imgY = Math.floor(y * scaleY);

                if (imgX < 0 || imgX >= state.imgWidth || imgY < 0 || imgY >= state.imgHeight) {
                    state.highlightBlock = null;
                } else {
                    const blockX = Math.floor(imgX / 8);
                    const blockY = Math.floor(imgY / 8);
                    state.highlightBlock = { x: blockX, y: blockY };
                }
                renderCallback();
            }
        });

        comparisonViewer.addEventListener('mouseleave', () => {
            state.highlightBlock = null;
            if (state.isInspectMode) renderCallback();
        });

        comparisonViewer.addEventListener('click', (e) => {
            if (state.isInspectMode && state.highlightBlock && state.wasmReady) {
                // Click on viewer: inspect block and enter inspector mode
                state.inspectedBlock = { x: state.highlightBlock.x, y: state.highlightBlock.y };
                if (enterInspectorMode) enterInspectorMode();
            }
        });
    }

    // ===== Inspector Sidebar Controls =====

    // Inspector Quality Slider
    if (inspQualitySlider) {
        inspQualitySlider.addEventListener('input', () => {
            if (inspQualityValue) inspQualityValue.textContent = inspQualitySlider.value;
            updateInspPresetHighlight(parseInt(inspQualitySlider.value));
            if (state.originalImageData) debouncedInspUpdate();
        });
    }

    // Inspector Quality Presets
    inspPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const q = parseInt(btn.dataset.quality);
            if (inspQualitySlider) {
                inspQualitySlider.value = q;
                if (inspQualityValue) inspQualityValue.textContent = q;
            }
            updateInspPresetHighlight(q);
            if (state.originalImageData) debouncedInspUpdate();
        });
    });

    function updateInspPresetHighlight(quality) {
        inspPresetBtns.forEach(btn => {
            const bq = parseInt(btn.dataset.quality);
            btn.classList.toggle('active', bq === quality);
        });
    }

    // Inspector View Mode
    inspViewModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            switch (e.target.value) {
                case 'y': state.currentViewMode = ViewMode.Y; break;
                case 'cr': state.currentViewMode = ViewMode.Cr; break;
                case 'cb': state.currentViewMode = ViewMode.Cb; break;
            }
            updateChromaControls();

            if (state.originalImageData) {
                renderCallback();
                reinspectIfNeeded();
            }
        });
    });

    // Inspector Chroma Subsampling
    inspCSRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.currentCsMode = parseInt(e.target.value, 10);

            if (state.originalImageData) debouncedInspUpdate();
        });
    });

    // Helper to disable chroma controls when in Y mode
    function updateChromaControls() {
        const isYMode = state.currentViewMode === ViewMode.Y;
        inspCSRadios.forEach(radio => { radio.disabled = isYMode; });
    }

    // Initialize state
    updateChromaControls();
}

export function updateComparisonView(percent) {
    const comparisonSlider = document.getElementById('comparisonSlider');
    const processedCanvas = document.getElementById('processedCanvas');

    const clampedPercent = Math.max(0, Math.min(100, percent));

    if (comparisonSlider) comparisonSlider.value = clampedPercent;
    if (processedCanvas) {
        processedCanvas.style.clipPath = `polygon(${clampedPercent}% 0, 100% 0, 100% 100%, ${clampedPercent}% 100%)`;
    }
}

// ===== File Size Estimation =====
export function updateFileSizeEstimate() {
    if (!state.wasmReady || !state.originalImageData) return;

    const container = document.getElementById('fileSizeContainer');
    if (!container) return;
    container.style.display = 'block';

    const w = state.imgWidth;
    const h = state.imgHeight;
    const totalPixels = w * h;

    const originalBytes = totalPixels * 3;

    const blocksX = Math.floor(w / 8);
    const blocksY = Math.floor(h / 8);
    const totalBlocks = blocksX * blocksY;

    if (totalBlocks === 0) return;

    const qualitySlider = document.getElementById('qualitySlider');
    const inspQualitySlider = document.getElementById('inspQualitySlider');
    const quality = (state.appMode === 'inspector' && inspQualitySlider)
        ? parseInt(inspQualitySlider.value)
        : (qualitySlider ? parseInt(qualitySlider.value) : 50);

    const sampleCount = Math.min(16, totalBlocks);
    let totalZeros = 0;
    const sampledIndices = new Set();

    for (let i = 0; i < sampleCount; i++) {
        const idx = Math.floor((i / sampleCount) * totalBlocks);
        if (sampledIndices.has(idx)) continue;
        sampledIndices.add(idx);

        const bx = idx % blocksX;
        const by = Math.floor(idx / blocksX);

        try {
            const ptr = inspectBlockData(bx, by, 0, quality);
            if (!ptr) continue;

            const blockSize = 64;
            const startBytes = ptr + (3 * blockSize * 8);
            const dataView = new DataView(Module.HEAPU8.buffer);

            let zeros = 0;
            for (let j = 0; j < blockSize; j++) {
                const val = dataView.getFloat64(startBytes + (j * 8), true);
                if (Math.abs(val) < 0.5) zeros++;
            }
            totalZeros += zeros;
        } catch (e) {
            // Skip problematic blocks
        }
    }

    const actualSampled = sampledIndices.size;
    if (actualSampled === 0) return;

    const avgZeroRatio = totalZeros / (actualSampled * 64);

    const bitsPerNonZero = 4.5;
    const nonZeroRatio = 1 - avgZeroRatio;
    const totalCoefficients = totalBlocks * 64 * 3;
    const estimatedBits = totalCoefficients * nonZeroRatio * bitsPerNonZero;
    const headerOverhead = 600;
    let estimatedBytes = Math.round(estimatedBits / 8) + headerOverhead;

    if (state.currentCsMode === 422) {
        estimatedBytes = Math.round(estimatedBytes * 0.75);
    } else if (state.currentCsMode === 420) {
        estimatedBytes = Math.round(estimatedBytes * 0.6);
    }

    estimatedBytes = Math.max(estimatedBytes, headerOverhead + 100);

    const formatSize = (bytes) => {
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    };

    const reduction = Math.max(0, Math.round((1 - estimatedBytes / originalBytes) * 100));
    const ratio = (originalBytes / estimatedBytes).toFixed(1);

    const values = document.getElementById('fileSizeValues');
    const fill = document.getElementById('fileSizeFill');
    const origLabel = document.getElementById('fileSizeOrigLabel');
    const reductionLabel = document.getElementById('fileSizeReduction');

    if (values) values.textContent = `${formatSize(originalBytes)} → ~${formatSize(estimatedBytes)}`;
    if (fill) fill.style.width = `${Math.max(2, 100 - reduction)}%`;
    if (origLabel) origLabel.textContent = `Original: ${formatSize(originalBytes)}`;
    if (reductionLabel) reductionLabel.textContent = `~${reduction}% smaller (${ratio}× compression)`;
}
