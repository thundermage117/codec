import { state, ViewMode } from './state.js';
import { inspectBlockData } from './wasm-bridge.js';

// Store grid data globally for cross-grid highlighting and basis viewer
let cachedGridData = {};
const ALL_GRID_IDS = [
    'gridOriginal', 'gridDCT', 'gridQuantized',
    'gridQuantized2', 'gridDequantized', 'gridReconstructed',
    'gridQuantTable', 'gridError'
];

export function inspectBlock(blockX, blockY) {
    // Track which block is being inspected
    state.inspectedBlock = { x: blockX, y: blockY };

    // Show inspector content, hide placeholder
    const content = document.getElementById('inspectorContent');
    const placeholder = document.getElementById('inspectorPlaceholder');
    if (content) content.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    // Hide basis viewer when inspecting a new block
    const basisViewer = document.getElementById('basisViewer');
    if (basisViewer) basisViewer.style.display = 'none';
    const basisPlaceholder = document.getElementById('basisPlaceholder');
    if (basisPlaceholder) basisPlaceholder.style.display = 'flex';

    const coordsSpan = document.getElementById('blockCoords');
    const qTableType = document.getElementById('qTableType');
    const qTableType2 = document.getElementById('qTableType2');

    if (coordsSpan) coordsSpan.innerText = `${blockX * 8}, ${blockY * 8} (Block ${blockX},${blockY})`;

    let channelIndex = 0; // Default Y
    if (state.currentViewMode === ViewMode.Cr) channelIndex = 1;
    if (state.currentViewMode === ViewMode.Cb) channelIndex = 2;

    const tableLabel = (channelIndex === 0) ? "Luma" : "Chroma";
    if (qTableType) qTableType.innerText = tableLabel;
    if (qTableType2) qTableType2.innerText = tableLabel;

    const qualitySlider = document.getElementById('qualitySlider');
    const quality = qualitySlider ? parseInt(qualitySlider.value) : 50;

    const ptr = inspectBlockData(blockX, blockY, channelIndex, quality);
    if (!ptr) {
        console.error("Failed to inspect block: Ptr is null");
        return;
    }

    const blockSize = 64;
    const readGrid = (offsetIdx) => {
        const startBytes = ptr + (offsetIdx * blockSize * 8);
        const data = [];
        const dataView = new DataView(Module.HEAPU8.buffer);

        try {
            for (let i = 0; i < blockSize; ++i) {
                const val = dataView.getFloat64(startBytes + (i * 8), true);
                data.push(val);
            }
        } catch (e) {
            console.error("Error reading grid data:", e);
        }
        return data;
    };

    const originalData = readGrid(0);
    const dctData = readGrid(1);
    const qtData = readGrid(2);
    const quantData = readGrid(3);
    const reconData = readGrid(4);

    // Compute derived data
    const errorData = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        errorData[i] = originalData[i] - reconData[i];
    }

    const dequantizedData = [];
    for (let i = 0; i < 64; i++) {
        dequantizedData.push(quantData[i] * qtData[i]);
    }

    // Cache the data for basis viewer
    cachedGridData = { dctData, qtData, quantData, dequantizedData };

    // Compute summary stats
    let mse = 0;
    let peakError = 0;
    let zeroCount = 0;

    for (let i = 0; i < 64; i++) {
        mse += errorData[i] * errorData[i];
        peakError = Math.max(peakError, Math.abs(errorData[i]));
        if (Math.abs(quantData[i]) < 0.5) zeroCount++;
    }
    mse /= 64;

    // Update stats display
    const setStatText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setStatText('statMSE', mse.toFixed(2));
    setStatText('statPeakError', peakError.toFixed(1));
    setStatText('statZeros', `${zeroCount} / 64`);
    setStatText('statCompression', `${Math.round((zeroCount / 64) * 100)}%`);

    // Render grids in pipeline order
    renderGrid('gridOriginal', originalData, 'intensity', 'original');
    renderGrid('gridDCT', dctData, 'frequency', 'dct');
    renderGrid('gridQuantized', quantData, 'frequency', 'quantized');

    renderGrid('gridQuantized2', quantData, 'frequency', 'quantized');
    renderGrid('gridDequantized', dequantizedData, 'frequency', 'dequantized');
    renderGrid('gridReconstructed', reconData, 'intensity', 'reconstructed');

    renderGrid('gridQuantTable', qtData, 'qtable', 'qtable');
    renderGrid('gridError', errorData, 'error', 'error');

    // Render zoom canvases (pixel-art enlarged previews)
    renderZoomCanvas('zoomOriginal', originalData);
    renderZoomCanvas('zoomReconstructed', reconData);

    // Setup basis viewer close button
    const basisClose = document.querySelector('.basis-close');
    if (basisClose) {
        basisClose.onclick = () => {
            if (basisViewer) basisViewer.style.display = 'none';
            clearAllHighlights();
        };
    }
}

function getCellDescription(row, col, gridType) {
    if (gridType === 'dct' || gridType === 'dequantized' || gridType === 'quantized') {
        if (row === 0 && col === 0) return 'DC coefficient (average brightness)';
        const freqLevel = row + col;
        if (freqLevel <= 2) return 'Low frequency';
        if (freqLevel <= 5) return 'Mid frequency';
        return 'High frequency';
    }
    if (gridType === 'original' || gridType === 'reconstructed') {
        return 'Pixel intensity';
    }
    if (gridType === 'error') {
        return 'Error value';
    }
    if (gridType === 'qtable') {
        return 'Divisor';
    }
    return '';
}

function getFreqLabel(row, col) {
    if (row === 0 && col === 0) return 'DC';
    const level = row + col;
    if (level <= 2) return 'Low Freq';
    if (level <= 5) return 'Mid Freq';
    return 'High Freq';
}

// ===== Cross-Grid Highlighting =====
function clearAllHighlights() {
    document.querySelectorAll('.grid-cell.cell-highlight').forEach(c => {
        c.classList.remove('cell-highlight');
    });
}

function highlightAcrossGrids(row, col) {
    clearAllHighlights();
    ALL_GRID_IDS.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const idx = row * 8 + col;
        const cell = grid.children[idx];
        if (cell) cell.classList.add('cell-highlight');
    });
}

// ===== DCT Basis Pattern Computation =====
function computeBasisPattern(u, v) {
    const N = 8;
    const pattern = new Float64Array(64);
    const cu = (u === 0) ? 1 / Math.sqrt(2) : 1;
    const cv = (v === 0) ? 1 / Math.sqrt(2) : 1;

    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            pattern[y * N + x] = (cu * cv / 4) *
                Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
                Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
    }
    return pattern;
}

function drawPatternOnCanvas(canvasId, data, mode) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cellSize = size / 8;

    ctx.clearRect(0, 0, size, size);

    // Find min/max for normalization
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 64; i++) {
        min = Math.min(min, data[i]);
        max = Math.max(max, data[i]);
    }
    const range = Math.max(Math.abs(min), Math.abs(max)) || 1;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const val = data[y * 8 + x];

            if (mode === 'diverging') {
                // Red-white-blue diverging colormap
                const t = val / range; // -1 to 1
                let r, g, b;
                if (t >= 0) {
                    // White to Red
                    r = 255;
                    g = Math.round(255 * (1 - t));
                    b = Math.round(255 * (1 - t));
                } else {
                    // White to Blue
                    r = Math.round(255 * (1 + t));
                    g = Math.round(255 * (1 + t));
                    b = 255;
                }
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            } else {
                // Grayscale
                const norm = Math.round(((val - min) / (max - min || 1)) * 255);
                ctx.fillStyle = `rgb(${norm}, ${norm}, ${norm})`;
            }

            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(size, i * cellSize);
        ctx.stroke();
    }
}

function showBasisViewer(row, col) {
    const viewer = document.getElementById('basisViewer');
    if (!viewer || !cachedGridData.dctData) return;

    const idx = row * 8 + col;
    const dctVal = cachedGridData.dctData[idx];
    const quantVal = cachedGridData.quantData[idx];
    const qtVal = cachedGridData.qtData[idx];

    // Update labels
    const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setEl('basisCoord', `(${row}, ${col})`);
    setEl('basisFreqLabel', getFreqLabel(row, col));
    setEl('basisValue', dctVal.toFixed(2));
    setEl('basisQuantized', Math.round(quantVal).toString());
    setEl('basisDivisor', Math.round(qtVal).toString());

    // Compute basis pattern for position (row, col)
    // In DCT, row = v (vertical freq), col = u (horizontal freq)
    const basisPattern = computeBasisPattern(col, row);

    // Contribution = coefficient * basis
    const contribution = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        contribution[i] = dctVal * basisPattern[i];
    }

    // Draw canvases
    drawPatternOnCanvas('basisCanvas', Array.from(basisPattern), 'diverging');
    drawPatternOnCanvas('contributionCanvas', Array.from(contribution), 'diverging');

    // Show viewer, hide placeholder
    viewer.style.display = 'block';
    const basisPlaceholder = document.getElementById('basisPlaceholder');
    if (basisPlaceholder) basisPlaceholder.style.display = 'none';

    // Scroll viewer into view smoothly
    viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderGrid(elementId, data, type = 'number', gridType = '') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '';

    for (let i = 0; i < 64; ++i) {
        const val = data[i];
        const row = Math.floor(i / 8);
        const col = i % 8;
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        let displayVal = val;
        if (type === 'intensity' || type === 'qtable') {
            displayVal = Math.round(val);
        } else {
            displayVal = val.toFixed(1);
            if (val === 0) displayVal = "0";
            if (displayVal === "-0.0") displayVal = "0";
        }

        cell.innerText = displayVal;

        // Build tooltip
        const desc = getCellDescription(row, col, gridType);
        cell.title = `(${row}, ${col}) = ${val.toFixed(4)}${desc ? '\n' + desc : ''}`;

        // Cross-grid highlighting on hover
        cell.addEventListener('mouseenter', () => {
            highlightAcrossGrids(row, col);
        });

        // Click on frequency-domain cells opens basis viewer
        if (gridType === 'dct' || gridType === 'quantized' || gridType === 'dequantized') {
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                highlightAcrossGrids(row, col);
                showBasisViewer(row, col);
            });
        }

        // Apply cell coloring
        if (type === 'intensity') {
            const norm = Math.max(0, Math.min(255, val));
            cell.style.backgroundColor = `rgb(${norm}, ${norm}, ${norm})`;
            cell.style.color = norm > 128 ? '#1e293b' : '#f1f5f9';
        } else if (type === 'qtable') {
            const maxQt = 200;
            const t = Math.min(1, val / maxQt);
            const r = Math.round(255);
            const g = Math.round(255 - t * 110);
            const b = Math.round(255 - t * 200);
            cell.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            cell.style.color = t > 0.5 ? '#7c2d12' : '#78350f';
        } else if (type === 'frequency' || type === 'error') {
            if (Math.abs(val) < 0.5) {
                cell.classList.add('cell-zero');
            } else {
                const isPos = val > 0;
                const visualMax = (type === 'error') ? 30 : 100;
                let opacity = Math.min(1, Math.abs(val) / visualMax);
                opacity = Math.max(0.1, opacity);

                if (isPos) {
                    cell.style.backgroundColor = `rgba(239, 68, 68, ${opacity})`;
                    cell.style.color = opacity > 0.5 ? '#fff' : 'var(--text)';
                } else {
                    cell.style.backgroundColor = `rgba(59, 130, 246, ${opacity})`;
                    cell.style.color = opacity > 0.5 ? '#fff' : 'var(--text)';
                }
            }
        }
        el.appendChild(cell);
    }

    // Clear highlights when mouse leaves a grid
    el.addEventListener('mouseleave', () => {
        clearAllHighlights();
    });
}

function renderZoomCanvas(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Canvas is 8×8 native, CSS scales it up with pixelated rendering
    ctx.clearRect(0, 0, 8, 8);
    const imgData = ctx.createImageData(8, 8);

    for (let i = 0; i < 64; i++) {
        const v = Math.max(0, Math.min(255, Math.round(data[i])));
        imgData.data[i * 4 + 0] = v; // R
        imgData.data[i * 4 + 1] = v; // G
        imgData.data[i * 4 + 2] = v; // B
        imgData.data[i * 4 + 3] = 255; // A
    }

    ctx.putImageData(imgData, 0, 0);
}
