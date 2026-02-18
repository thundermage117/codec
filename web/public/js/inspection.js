import { state, ViewMode } from './state.js';
import { inspectBlockData } from './wasm-bridge.js';

// Store grid data globally for cross-grid highlighting and basis viewer
let cachedGridData = {};
const ALL_GRID_IDS = [
    'gridOriginal', 'gridDCT', 'gridQuantized', 'gridQuantized2',
    'gridDequantized', 'gridReconstructed',
    'gridQuantTable', 'gridError'
];

// Custom tooltip element
let tooltipEl = null;

function ensureTooltip() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'grid-cell-tooltip';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

function showTooltip(e, value, row, col, desc) {
    const tip = ensureTooltip();
    let coordText = '';
    if (row !== '-' && col !== '-') {
        coordText = `<div class="tooltip-pos">(${row}, ${col})</div>`;
    }

    tip.innerHTML = `
        ${coordText}
        <div class="tooltip-value">${typeof value === 'number' ? value.toFixed(2) : value}</div>
        ${desc ? `<div class="tooltip-desc">${desc}</div>` : ''}
    `;
    tip.classList.add('visible');

    const x = e.clientX + 12;
    const y = e.clientY - 10;
    tip.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    tip.style.top = `${Math.max(4, y - tip.offsetHeight)}px`;
}

function hideTooltip() {
    if (tooltipEl) {
        tooltipEl.classList.remove('visible');
    }
}

export function inspectBlock(blockX, blockY) {
    state.inspectedBlock = { x: blockX, y: blockY };

    const content = document.getElementById('inspectorContent');
    const placeholder = document.getElementById('inspectorPlaceholder');
    if (content) content.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    // Hide basis popover
    hideBasisPopover();

    const coordsSpan = document.getElementById('blockCoords');
    const qTableType = document.getElementById('qTableType');
    const qTableType2 = document.getElementById('qTableType2');

    if (coordsSpan) coordsSpan.innerText = `${blockX * 8}, ${blockY * 8} (Block ${blockX},${blockY})`;

    let channelIndex = 0;
    if (state.currentViewMode === ViewMode.Cr) channelIndex = 1;
    if (state.currentViewMode === ViewMode.Cb) channelIndex = 2;

    const tableLabel = (channelIndex === 0) ? "Luma" : "Chroma";
    if (qTableType) qTableType.innerText = tableLabel;
    if (qTableType2) qTableType2.innerText = tableLabel;

    const inspQualitySlider = document.getElementById('inspQualitySlider');
    const qualitySlider = document.getElementById('qualitySlider');

    // Sync initial value if entering inspector for the first time or if desynced
    if (state.appMode === 'inspector' && inspQualitySlider && qualitySlider) {
        // If we want to force the inspector to match the main slider when we suspect it wasn't set by user
        // For now, let's just trust inspQualitySlider, but maybe unrelatedly, the user's "mostly 0" 
        // implies high compression (low quality). If quality is 0, that explains it.
    }

    const quality = (state.appMode === 'inspector' && inspQualitySlider)
        ? parseInt(inspQualitySlider.value)
        : (qualitySlider ? parseInt(qualitySlider.value) : 50);

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

    const errorData = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        errorData[i] = originalData[i] - reconData[i];
    }

    const dequantizedData = [];
    for (let i = 0; i < 64; i++) {
        dequantizedData.push(quantData[i] * qtData[i]);
    }

    cachedGridData = { dctData, qtData, quantData, dequantizedData };

    // Fetch RGB data for Original and Reconstructed if in RGB mode
    let originalRGB = null;
    let reconstructedRGB = null;

    if (state.currentViewMode === ViewMode.RGB) {
        originalRGB = getBlockRGB(state.originalImageData, blockX, blockY);
        const processedCanvas = document.getElementById('processedCanvas');
        if (processedCanvas) {
            try {
                const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
                // Optimize: only fetch the 8x8 block region
                const reconImgData = ctx.getImageData(blockX * 8, blockY * 8, 8, 8);
                reconstructedRGB = getBlockRGB(reconImgData, 0, 0); // Already cropped to 8x8
            } catch (e) {
                console.warn("Could not read processedCanvas for RGB block view");
            }
        }
    }

    let mse = 0;
    let peakError = 0;
    let zeroCount = 0;

    for (let i = 0; i < 64; i++) {
        mse += errorData[i] * errorData[i];
        peakError = Math.max(peakError, Math.abs(errorData[i]));
        if (Math.abs(quantData[i]) < 0.5) zeroCount++;
    }
    mse /= 64;

    const mseClass = mse < 5 ? 'good' : mse < 20 ? 'moderate' : 'poor';
    const peakClass = peakError < 10 ? 'good' : peakError < 30 ? 'moderate' : 'poor';
    const zeroPercent = Math.round((zeroCount / 64) * 100);
    const compClass = zeroPercent > 70 ? 'good' : zeroPercent > 40 ? 'moderate' : 'poor';

    const setStatEl = (id, text, colorClass, parentBgClass) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = text;
        el.classList.remove('stat-good', 'stat-moderate', 'stat-poor');
        if (colorClass) el.classList.add(`stat-${colorClass}`);
        const parent = el.closest('.stat-item');
        if (parent) {
            parent.classList.remove('stat-good-bg', 'stat-moderate-bg', 'stat-poor-bg');
            if (parentBgClass) parent.classList.add(`stat-${parentBgClass}-bg`);
        }
    };

    const mseTxt = mse >= 100 ? mse.toFixed(0) : mse.toFixed(2);
    setStatEl('statMSE', mseTxt, mseClass, mseClass);
    const peakTxt = peakError >= 100 ? peakError.toFixed(0) : peakError.toFixed(1);
    setStatEl('statPeakError', peakTxt, peakClass, peakClass);
    setStatEl('statZeros', `${zeroCount}/64`, null, null);
    setStatEl('statCompression', `${zeroPercent}%`, compClass, compClass);

    renderGrid('gridOriginal', originalRGB || originalData, 'intensity', 'original', state.currentViewMode === ViewMode.RGB);
    renderGrid('gridDCT', dctData, 'frequency', 'dct');
    renderGrid('gridQuantized', quantData, 'frequency', 'quantized');
    renderGrid('gridQuantized2', quantData, 'frequency', 'quantized');
    renderGrid('gridDequantized', dequantizedData, 'frequency', 'dequantized');
    renderGrid('gridReconstructed', reconstructedRGB || reconData, 'intensity', 'reconstructed', state.currentViewMode === ViewMode.RGB);

    renderGrid('gridQuantTable', qtData, 'qtable', 'qtable');
    renderGrid('gridError', errorData, 'error', 'error');



    renderLossMeter(mse, peakError);
}

function renderLossMeter(mse, peakError) {
    const container = document.getElementById('lossMeterContainer');
    if (!container) return;

    let meter = container.querySelector('.loss-meter');

    if (!meter) {
        meter = document.createElement('div');
        meter.className = 'loss-meter';
        meter.innerHTML = `
            <div class="loss-meter-label-wrap tooltip-container">
                <span class="loss-meter-label">Quality</span>
                <div class="tooltip-content-small" style="text-align: center">
                    <strong>PSNR-based Quality</strong><br>
                    <code>clamp((10&thinsp;log<sub>10</sub>(255&sup2;/MSE) &minus; 20) / 30, 0, 1)</code><br>
                    Maps the 20&ndash;50 dB PSNR range to 0&ndash;100%. MSE&nbsp;=&nbsp;0 is treated as lossless.
                </div>
            </div>
            <div class="loss-meter-track">
                <div class="loss-meter-fill"></div>
            </div>
            <span class="loss-meter-value"></span>
        `;
        container.appendChild(meter);
    }

    // PSNR-based quality: maps the perceptually relevant 20–50 dB range to 0–100%.
    // This gives a more linear spread across typical JPEG quality levels:
    //   MSE=0  → PSNR=∞  → 100%  (lossless)
    //   MSE=1  → PSNR≈48 → ~93%  (excellent)
    //   MSE=5  → PSNR≈41 → ~70%  (good, aligns with 'good' stat threshold)
    //   MSE=20 → PSNR≈35 → ~50%  (moderate, aligns with 'moderate' threshold)
    //   MSE=100→ PSNR≈28 → ~27%  (poor)
    //   MSE≥500→ PSNR≤21 → 0%    (floor)
    const psnr = mse > 0 ? 10 * Math.log10(255 * 255 / mse) : 60;
    let qualityPct = Math.max(0, Math.min(100, Math.round((psnr - 20) / 30 * 100)));
    const fill = meter.querySelector('.loss-meter-fill');
    const value = meter.querySelector('.loss-meter-value');

    if (fill) {
        fill.style.width = `${qualityPct}%`;
        if (qualityPct > 70) {
            fill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        } else if (qualityPct > 40) {
            fill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        } else {
            fill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        }
    }
    if (value) {
        value.textContent = `${qualityPct}%`;
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
    if (level <= 2) return 'Low';
    if (level <= 5) return 'Mid';
    return 'High';
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
                const t = val / range;
                let r, g, b;
                if (t >= 0) {
                    r = 255;
                    g = Math.round(255 * (1 - t));
                    b = Math.round(255 * (1 - t));
                } else {
                    r = Math.round(255 * (1 + t));
                    g = Math.round(255 * (1 + t));
                    b = 255;
                }
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            } else {
                const norm = Math.round(((val - min) / (max - min || 1)) * 255);
                ctx.fillStyle = `rgb(${norm}, ${norm}, ${norm})`;
            }

            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
    }

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

// ===== Floating Basis Popover =====
let basisPopoverVisible = false;
let lastMouseEvent = null;

function showBasisPopover(e, row, col) {
    // Hide cell tooltip to prevent overlap
    hideTooltip();

    const popover = document.getElementById('basisPopover');
    if (!popover || !cachedGridData.dctData) return;

    const idx = row * 8 + col;
    const dctVal = cachedGridData.dctData[idx];
    const quantVal = cachedGridData.quantData[idx];
    const qtVal = cachedGridData.qtData[idx];

    // Update content
    const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setEl('basisCoord', `(${row}, ${col})`);
    setEl('basisFreqLabel', getFreqLabel(row, col));
    setEl('basisValue', dctVal.toFixed(2));
    setEl('basisQuantized', Math.round(quantVal).toString());
    setEl('basisDivisor', Math.round(qtVal).toString());

    // Compute and draw basis pattern
    const basisPattern = computeBasisPattern(col, row);
    const contribution = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        contribution[i] = dctVal * basisPattern[i];
    }

    drawPatternOnCanvas('basisCanvas', Array.from(basisPattern), 'diverging');
    drawPatternOnCanvas('contributionCanvas', Array.from(contribution), 'diverging');

    // Position near the cursor
    positionPopover(popover, e);

    // Show with animation
    popover.style.display = 'block';
    requestAnimationFrame(() => {
        popover.classList.add('visible');
    });
    basisPopoverVisible = true;
    lastMouseEvent = e;
}

function positionPopover(popover, e) {
    const margin = 16;
    const popW = 260;
    const popH = 240;

    let x = e.clientX + margin;
    let y = e.clientY - popH / 2;

    // Keep within viewport
    if (x + popW > window.innerWidth - margin) {
        x = e.clientX - popW - margin;
    }
    if (y < margin) {
        y = margin;
    }
    if (y + popH > window.innerHeight - margin) {
        y = window.innerHeight - popH - margin;
    }

    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
}

function hideBasisPopover() {
    const popover = document.getElementById('basisPopover');
    if (popover) {
        popover.classList.remove('visible');
        // Allow transition to finish before hiding
        setTimeout(() => {
            if (!basisPopoverVisible) {
                popover.style.display = 'none';
            }
        }, 150);
    }
    basisPopoverVisible = false;
}

function renderGrid(elementId, data, type = 'number', gridType = '', isRGB = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '';

    let nonZeroCount = 0;

    for (let i = 0; i < 64; ++i) {
        let val;
        let r, g, b;

        if (isRGB && type === 'intensity') {
            [r, g, b] = data[i];
            val = (r + g + b) / 3; // For tooltip/desc if needed
        } else {
            val = data[i];
        }

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

        // Hide values in intensity blocks to keep it clean if it's RGB
        if (isRGB && type === 'intensity') {
            cell.innerText = '';
        } else {
            cell.innerText = displayVal;
        }

        if ((type === 'frequency') && Math.abs(val) >= 0.5) nonZeroCount++;

        const desc = getCellDescription(row, col, gridType);

        cell.addEventListener('mouseenter', (e) => {
            highlightAcrossGrids(row, col);
            // Don't show cell tooltip for frequency cells — the basis popover covers it
            if (!(gridType === 'dct' || gridType === 'quantized' || gridType === 'dequantized')) {
                const tipVal = isRGB && type === 'intensity' ? `RGB(${r},${g},${b})` : val;
                showTooltip(e, tipVal, row, col, desc);
            }
        });

        cell.addEventListener('mousemove', (e) => {
            if (!(gridType === 'dct' || gridType === 'quantized' || gridType === 'dequantized')) {
                const tipVal = isRGB && type === 'intensity' ? `RGB(${r},${g},${b})` : val;
                showTooltip(e, tipVal, row, col, desc);
            }
        });

        cell.addEventListener('mouseleave', () => {
            hideTooltip();
        });

        // Frequency-domain cells: show floating basis popover on hover
        if (gridType === 'dct' || gridType === 'quantized' || gridType === 'dequantized') {
            cell.style.cursor = 'help';

            cell.addEventListener('mouseenter', (e) => {
                showBasisPopover(e, row, col);
            });

            cell.addEventListener('mousemove', (e) => {
                // Reposition popover as mouse moves
                const popover = document.getElementById('basisPopover');
                if (popover && basisPopoverVisible) {
                    positionPopover(popover, e);
                }
            });

            cell.addEventListener('mouseleave', () => {
                hideBasisPopover();
            });
        }

        // Apply cell coloring
        if (type === 'intensity') {
            if (isRGB) {
                cell.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
                // No text so color doesn't matter much
            } else {
                const norm = Math.max(0, Math.min(255, val));
                cell.style.backgroundColor = `rgb(${norm}, ${norm}, ${norm})`;
                cell.style.color = norm > 128 ? '#1e293b' : '#f1f5f9';
            }
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

    // Non-zero badge for frequency grids
    if (type === 'frequency') {
        const stage = el.closest('.pipeline-block') || el.closest('.analysis-card');
        if (stage) {
            const header = stage.querySelector('.pipeline-block-header') || stage.querySelector('.analysis-header');
            if (header) {
                const existing = header.querySelector('.nonzero-badge');
                if (existing) existing.remove();

                const badge = document.createElement('span');
                badge.className = 'nonzero-badge';
                badge.textContent = `${nonZeroCount}`;

                badge.addEventListener('mouseenter', (e) => {
                    showTooltip(e, nonZeroCount, '-', '-', 'Non-Zero Coefficients');
                });
                badge.addEventListener('mouseleave', () => {
                    hideTooltip();
                });

                header.appendChild(badge);
            }
        }
    }

    el.addEventListener('mouseleave', () => {
        clearAllHighlights();
    });
}



function getBlockRGB(imageData, bx, by) {
    const data = [];
    const pixels = imageData.data;
    const w = imageData.width;

    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            const x = bx * 8 + dx;
            const y = by * 8 + dy;
            const idx = (y * w + x) * 4;
            data.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
        }
    }
    return data;
}
