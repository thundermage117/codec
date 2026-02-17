import { state, ViewMode } from './state.js';
import { processImage, setViewTint, inspectBlockData } from './wasm-bridge.js';
import { inspectBlock } from './inspection.js';
import { getOriginalContext } from './image-manager.js';

export function setupControls(renderCallback) {
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const viewModeRadios = document.querySelectorAll('input[name="view_mode"]');
    const csRadios = document.querySelectorAll('input[name="chroma_subsampling"]');
    const tintToggle = document.getElementById('tint_toggle');
    const comparisonSlider = document.getElementById('comparisonSlider');
    const comparisonViewer = document.querySelector('.comparison-viewer');
    const inspectToggle = document.getElementById('inspect_mode');
    const sliderContainer = document.querySelector('.slider-container');
    const inspectionPanel = document.getElementById('inspectionPanel');
    const inspectorContent = document.getElementById('inspectorContent');
    const inspectorPlaceholder = document.getElementById('inspectorPlaceholder');

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
        if (state.isInspectMode && state.inspectedBlock && state.wasmReady) {
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

    if (qualitySlider) {
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value;
            updatePresetHighlight(parseInt(qualitySlider.value));
            if (state.originalImageData) debouncedUpdate();
        });
    }

    // Quality Presets
    const presetBtns = document.querySelectorAll('.preset-btn');
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

    if (inspectToggle) {
        inspectToggle.addEventListener('change', (e) => {
            state.isInspectMode = e.target.checked;
            if (comparisonViewer) {
                comparisonViewer.style.cursor = state.isInspectMode ? 'crosshair' : 'col-resize';
            }

            if (sliderContainer) {
                if (state.isInspectMode) {
                    sliderContainer.classList.add('disabled');
                    if (comparisonSlider) comparisonSlider.disabled = true;
                } else {
                    sliderContainer.classList.remove('disabled');
                    if (comparisonSlider) comparisonSlider.disabled = false;
                }
            }

            // Show/hide inline inspector panel
            if (inspectionPanel) {
                if (state.isInspectMode) {
                    inspectionPanel.style.display = 'block';
                    // Reset to placeholder until a block is clicked
                    if (inspectorContent) inspectorContent.style.display = 'none';
                    if (inspectorPlaceholder) inspectorPlaceholder.style.display = 'flex';
                } else {
                    inspectionPanel.style.display = 'none';
                }
            }

            if (!state.isInspectMode) {
                state.highlightBlock = null;
                state.inspectedBlock = null;
            }
            renderCallback();
        });
    }

    // Comparison Viewer Interaction
    if (comparisonViewer && comparisonSlider) {
        // Slider update
        comparisonSlider.addEventListener('input', (e) => {
            updateComparisonView(e.target.value);
        });

        // Mouse/Touch interaction
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

                // Scale to image coords
                const originalCanvas = document.getElementById('originalCanvas'); // use dimensions from here
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
                renderCallback(); // Re-render to show highlight
            }
        });

        comparisonViewer.addEventListener('mouseleave', () => {
            state.highlightBlock = null;
            if (state.isInspectMode) renderCallback();
        });

        comparisonViewer.addEventListener('click', (e) => {
            if (state.isInspectMode && state.highlightBlock && state.wasmReady) {
                inspectBlock(state.highlightBlock.x, state.highlightBlock.y);
            }
        });
    }

    // No close button needed for inline inspector
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

    // Original: uncompressed RGB bytes
    const originalBytes = totalPixels * 3;

    // Sample random blocks to estimate zero ratio
    const blocksX = Math.floor(w / 8);
    const blocksY = Math.floor(h / 8);
    const totalBlocks = blocksX * blocksY;

    if (totalBlocks === 0) return;

    const qualitySlider = document.getElementById('qualitySlider');
    const quality = qualitySlider ? parseInt(qualitySlider.value) : 50;

    // Sample up to 16 blocks
    const sampleCount = Math.min(16, totalBlocks);
    let totalZeros = 0;
    const sampledIndices = new Set();

    // Use deterministic sampling (evenly spaced) for consistency
    for (let i = 0; i < sampleCount; i++) {
        const idx = Math.floor((i / sampleCount) * totalBlocks);
        if (sampledIndices.has(idx)) continue;
        sampledIndices.add(idx);

        const bx = idx % blocksX;
        const by = Math.floor(idx / blocksX);

        try {
            const ptr = inspectBlockData(bx, by, 0, quality); // Y channel
            if (!ptr) continue;

            // Read quantized data (offset index 3 = quantized coefficients)
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

    // Estimate: JPEG uses ~0.5-2 bits per non-zero coefficient, plus overhead
    // With Huffman + RLE, zeros are nearly free
    const bitsPerNonZero = 4.5;  // average bits per non-zero DCT coefficient
    const nonZeroRatio = 1 - avgZeroRatio;
    const totalCoefficients = totalBlocks * 64 * 3; // Y + Cr + Cb channels
    const estimatedBits = totalCoefficients * nonZeroRatio * bitsPerNonZero;
    const headerOverhead = 600; // JPEG header bytes
    let estimatedBytes = Math.round(estimatedBits / 8) + headerOverhead;

    // Apply chroma subsampling factor
    if (state.currentCsMode === 422) {
        estimatedBytes = Math.round(estimatedBytes * 0.75);
    } else if (state.currentCsMode === 420) {
        estimatedBytes = Math.round(estimatedBytes * 0.6);
    }

    // Clamp minimum
    estimatedBytes = Math.max(estimatedBytes, headerOverhead + 100);

    // Format sizes
    const formatSize = (bytes) => {
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    };

    const reduction = Math.max(0, Math.round((1 - estimatedBytes / originalBytes) * 100));
    const ratio = (originalBytes / estimatedBytes).toFixed(1);

    // Update DOM
    const values = document.getElementById('fileSizeValues');
    const fill = document.getElementById('fileSizeFill');
    const origLabel = document.getElementById('fileSizeOrigLabel');
    const reductionLabel = document.getElementById('fileSizeReduction');

    if (values) values.textContent = `${formatSize(originalBytes)} → ~${formatSize(estimatedBytes)}`;
    if (fill) fill.style.width = `${Math.max(2, 100 - reduction)}%`;
    if (origLabel) origLabel.textContent = `Original: ${formatSize(originalBytes)}`;
    if (reductionLabel) reductionLabel.textContent = `~${reduction}% smaller (${ratio}× compression)`;
}
