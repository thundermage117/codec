import { appState, ViewMode } from './state.svelte.js';
import { inspectBlockData } from './wasm-bridge.js';

// Store grid data globally for cross-grid highlighting and basis viewer

// Store grid data globally for cross-grid highlighting and basis viewer
let cachedGridData: {
    dctData?: Float64Array;
    qtData?: Float64Array;
    quantData?: Float64Array;
    dequantizedData?: Float64Array;
} = {};

const ALL_GRID_IDS = [
    'gridOriginal', 'gridDCT', 'gridQuantized', 'gridQuantized2',
    'gridDequantized', 'gridReconstructed',
    'gridQuantTable', 'gridError'
];

// Custom tooltip element
let tooltipEl: HTMLDivElement | null = null;

function ensureTooltip(): HTMLDivElement {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'grid-cell-tooltip';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

function showTooltip(e: MouseEvent, value: number | string, row: number | string, col: number | string, desc: string): void {
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

function hideTooltip(): void {
    if (tooltipEl) tooltipEl.classList.remove('visible');
}

export function inspectBlock(blockX: number, blockY: number): void {
    // appState.inspectedBlock is already set by the caller (UI event or effect),
    // so we don't set it here to avoid infinite loops.

    const content = document.getElementById('inspectorContent');
    const placeholder = document.getElementById('inspectorPlaceholder');
    if (content) content.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    hideBasisPopover();

    const coordsSpan = document.getElementById('blockCoords');
    const qTableType = document.getElementById('qTableType');
    const qTableType2 = document.getElementById('qTableType2');

    if (coordsSpan) coordsSpan.innerText = `${blockX * 8}, ${blockY * 8} (Block ${blockX},${blockY})`;

    let channelIndex = 0;
    if (appState.currentViewMode === ViewMode.Cr) channelIndex = 1;
    if (appState.currentViewMode === ViewMode.Cb) channelIndex = 2;

    const tableLabel = (channelIndex === 0) ? 'Luma' : 'Chroma';
    if (qTableType) qTableType.innerText = tableLabel;
    if (qTableType2) qTableType2.innerText = tableLabel;

    const inspQualitySlider = document.getElementById('inspQualitySlider') as HTMLInputElement | null;
    const qualitySlider = document.getElementById('qualitySlider') as HTMLInputElement | null;

    const quality = (appState.appMode === 'inspector' && inspQualitySlider)
        ? parseInt(inspQualitySlider.value)
        : (qualitySlider ? parseInt(qualitySlider.value) : appState.quality);

    const ptr = inspectBlockData(blockX, blockY, channelIndex, quality);
    if (!ptr) {
        console.error('Failed to inspect block: Ptr is null');
        return;
    }

    const blockSize = 64;
    const readGrid = (offsetIdx: number): Float64Array => {
        const startBytes = ptr + (offsetIdx * blockSize * 8);
        return new Float64Array(Module.HEAPU8.buffer, startBytes, blockSize);
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

    const dequantizedData = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        dequantizedData[i] = quantData[i] * qtData[i];
    }

    cachedGridData = { dctData, qtData, quantData, dequantizedData };

    let originalRGB: Uint8ClampedArray | null = null;
    let reconstructedRGB: Uint8ClampedArray | null = null;

    if (appState.currentViewMode === ViewMode.RGB) {
        originalRGB = getBlockRGB(appState.originalImageData!, blockX, blockY);
        const processedCanvas = document.getElementById('processedCanvas') as HTMLCanvasElement | null;
        if (processedCanvas) {
            try {
                const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                    const reconImgData = ctx.getImageData(blockX * 8, blockY * 8, 8, 8);
                    reconstructedRGB = getBlockRGB(reconImgData, 0, 0);
                }
            } catch {
                console.warn('Could not read processedCanvas for RGB block view');
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

    const setStatEl = (id: string, text: string, colorClass: string | null, parentBgClass: string | null) => {
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

    setStatEl('statMSE', mse >= 100 ? mse.toFixed(0) : mse.toFixed(2), mseClass, mseClass);
    setStatEl('statPeakError', peakError >= 100 ? peakError.toFixed(0) : peakError.toFixed(1), peakClass, peakClass);
    setStatEl('statZeros', `${zeroCount}/64`, null, null);
    setStatEl('statCompression', `${zeroPercent}%`, compClass, compClass);

    renderGrid('gridOriginal', originalRGB ?? originalData, 'intensity', 'original', appState.currentViewMode === ViewMode.RGB);
    renderGrid('gridDCT', dctData, 'frequency', 'dct');
    renderGrid('gridQuantized', quantData, 'frequency', 'quantized');
    renderGrid('gridQuantized2', quantData, 'frequency', 'quantized');
    renderGrid('gridDequantized', dequantizedData, 'frequency', 'dequantized');
    renderGrid('gridReconstructed', reconstructedRGB ?? reconData, 'intensity', 'reconstructed', appState.currentViewMode === ViewMode.RGB);
    renderGrid('gridQuantTable', qtData, 'qtable', 'qtable');
    renderGrid('gridError', Array.from(errorData), 'error', 'error');

    renderLossMeter(mse, peakError);
}

function renderLossMeter(mse: number, _peakError: number): void {
    const container = document.getElementById('lossMeterContainer');
    if (!container) return;

    let meter = container.querySelector('.loss-meter') as HTMLDivElement | null;

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

    const psnr = mse > 0 ? 10 * Math.log10(255 * 255 / mse) : 60;
    const qualityPct = Math.max(0, Math.min(100, Math.round((psnr - 20) / 30 * 100)));
    const fill = meter.querySelector('.loss-meter-fill') as HTMLElement | null;
    const value = meter.querySelector('.loss-meter-value') as HTMLElement | null;

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
    if (value) value.textContent = `${qualityPct}%`;
}

function getCellDescription(row: number, col: number, gridType: string): string {
    if (gridType === 'dct' || gridType === 'dequantized' || gridType === 'quantized') {
        if (row === 0 && col === 0) return 'DC coefficient (average brightness)';
        const freqLevel = row + col;
        if (freqLevel <= 2) return 'Low frequency';
        if (freqLevel <= 5) return 'Mid frequency';
        return 'High frequency';
    }
    if (gridType === 'original' || gridType === 'reconstructed') return 'Pixel intensity';
    if (gridType === 'error') return 'Error value';
    if (gridType === 'qtable') return 'Divisor';
    return '';
}

function getFreqLabel(row: number, col: number): string {
    if (row === 0 && col === 0) return 'DC';
    const level = row + col;
    if (level <= 2) return 'Low';
    if (level <= 5) return 'Mid';
    return 'High';
}


let lastHighlightedKey: string | null = null;

function clearAllHighlights(): void {
    lastHighlightedKey = null;
    document.querySelectorAll('.grid-cell.cell-highlight').forEach(c => {
        c.classList.remove('cell-highlight');
    });
}

function highlightAcrossGrids(row: number, col: number): void {
    clearAllHighlights();
    ALL_GRID_IDS.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const idx = row * 8 + col;
        const cell = grid.children[idx] as HTMLElement | undefined;
        if (cell) cell.classList.add('cell-highlight');
    });
}

function computeBasisPattern(u: number, v: number): Float64Array {
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

function drawPatternOnCanvas(canvasId: string, data: Float64Array | number[], mode: string): void {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
                    r = 255; g = Math.round(255 * (1 - t)); b = Math.round(255 * (1 - t));
                } else {
                    r = Math.round(255 * (1 + t)); g = Math.round(255 * (1 + t)); b = 255;
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
        ctx.beginPath(); ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cellSize); ctx.lineTo(size, i * cellSize); ctx.stroke();
    }
}

let basisPopoverVisible = false;

function showBasisPopover(e: MouseEvent, row: number, col: number): void {
    hideTooltip();
    const popover = document.getElementById('basisPopover');
    if (!popover || !cachedGridData.dctData) return;

    const idx = row * 8 + col;
    const dctVal = cachedGridData.dctData[idx];
    const quantVal = cachedGridData.quantData![idx];
    const qtVal = cachedGridData.qtData![idx];

    const setEl = (id: string, text: string) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setEl('basisCoord', `(${row}, ${col})`);
    setEl('basisFreqLabel', getFreqLabel(row, col));
    setEl('basisValue', dctVal.toFixed(2));
    setEl('basisQuantized', Math.round(quantVal).toString());
    setEl('basisDivisor', Math.round(qtVal).toString());

    const basisPattern = computeBasisPattern(col, row);
    const contribution = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        contribution[i] = dctVal * basisPattern[i];
    }

    drawPatternOnCanvas('basisCanvas', Array.from(basisPattern), 'diverging');
    drawPatternOnCanvas('contributionCanvas', Array.from(contribution), 'diverging');

    positionPopover(popover, e);
    popover.style.display = 'block';
    requestAnimationFrame(() => popover.classList.add('visible'));
    basisPopoverVisible = true;
}

function positionPopover(popover: HTMLElement, e: MouseEvent): void {
    const margin = 16;
    const popW = 260;
    const popH = 240;

    let x = e.clientX + margin;
    let y = e.clientY - popH / 2;

    // Clamp horizontally
    if (x + popW > window.innerWidth - margin) {
        // Try positioning to the left if right side overflows
        x = e.clientX - popW - margin;
    }
    // If still off-screen (left), just clamp to margin
    if (x < margin) x = margin;
    // If extending past right edge, clamp to right edge
    if (x + popW > window.innerWidth - margin) x = window.innerWidth - popW - margin;

    // Clamp vertically
    if (y < margin) y = margin;
    if (y + popH > window.innerHeight - margin) y = window.innerHeight - popH - margin;

    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
}

function hideBasisPopover(): void {
    const popover = document.getElementById('basisPopover');
    if (popover) {
        popover.classList.remove('visible');
        setTimeout(() => {
            if (!basisPopoverVisible) popover.style.display = 'none';
        }, 150);
    }
    basisPopoverVisible = false;
}


function renderGrid(
    elementId: string,
    data: Float64Array | Uint8ClampedArray | number[],
    type: string = 'number',
    gridType: string = '',
    isRGB: boolean = false
): void {
    const el = document.getElementById(elementId);
    if (!el) return;

    // Event Delegation (One-time setup per grid container)
    if (!el.hasAttribute('data-events-attached')) {
        el.setAttribute('data-events-attached', 'true');

        // Mouse Move (Handles enter/move for cells)
        el.addEventListener('mousemove', (e) => {
            const target = e.target as HTMLElement;
            // Use closest in case we have inner elements, though grid-cell is usually a leaf
            const cell = target.closest('.grid-cell') as HTMLElement;
            if (!cell) return;

            const row = parseInt(cell.dataset.row || '0');
            const col = parseInt(cell.dataset.col || '0');
            const valStr = cell.dataset.val || '';
            const desc = cell.dataset.desc || '';
            const cellGridType = cell.dataset.gridType || '';
            const isBasis = cell.dataset.isBasis === 'true';

            // 1. Highlight (Only if changed)
            const key = `${row},${col}`;
            if (lastHighlightedKey !== key) {
                highlightAcrossGrids(row, col);
                lastHighlightedKey = key;
            }

            // 2. Tooltip
            // Basis grids (DCT/Quant) have their own popover, so no text tooltip for them usually,
            // but the legacy code showed popover AND no tooltip.
            if (!isBasis) {
                showTooltip(e, valStr, row, col, desc);
            }

            // 3. Basis Popover
            if (isBasis) {
                showBasisPopover(e, row, col);
                // Also update popover position if it's already visible?
                // showBasisPopover handles positioning.
            }
        });

        // Mouse Leave (Grid container level)
        el.addEventListener('mouseleave', () => {
            hideTooltip();
            hideBasisPopover();
            clearAllHighlights();
        });
    }

    const hasChildren = el.children.length === 64;
    let nonZeroCount = 0;

    for (let i = 0; i < 64; ++i) {
        let val: number;
        let r = 0, g = 0, b = 0;

        if (isRGB && type === 'intensity') {
            const idx = i * 3;
            r = data[idx];
            g = data[idx + 1];
            b = data[idx + 2];
            val = (r + g + b) / 3;
        } else {
            val = (data as Float64Array)[i];
        }

        const row = Math.floor(i / 8);
        const col = i % 8;

        // Reuse or Create Cell
        let cell: HTMLElement;
        if (hasChildren) {
            cell = el.children[i] as HTMLElement;
        } else {
            cell = document.createElement('div');
            cell.className = 'grid-cell';
            el.appendChild(cell);
        }

        // Update Data Attributes for Delegation
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.gridType = gridType;

        const isBasis = (gridType === 'dct' || gridType === 'quantized' || gridType === 'dequantized');
        cell.dataset.isBasis = String(isBasis);
        if (isBasis) cell.style.cursor = 'help';
        else cell.style.cursor = 'default';

        // Display Value & Text
        let displayVal: string;
        let tooltipVal: string;

        if (type === 'intensity' || type === 'qtable') {
            displayVal = String(Math.round(val));
            tooltipVal = isRGB && type === 'intensity' ? `RGB(${r},${g},${b})` : displayVal;
        } else {
            displayVal = val.toFixed(1);
            if (val === 0) displayVal = '0';
            if (displayVal === '-0.0') displayVal = '0';
            tooltipVal = displayVal;
        }

        cell.innerText = (isRGB && type === 'intensity') ? '' : displayVal;
        cell.dataset.val = tooltipVal;
        cell.dataset.desc = getCellDescription(row, col, gridType);

        if (type === 'frequency' && Math.abs(val) >= 0.5) nonZeroCount++;

        // Styles
        cell.className = 'grid-cell'; // Reset classes (removes cell-zero, cell-highlight)

        if (type === 'intensity') {
            if (isRGB) {
                cell.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            } else {
                const norm = Math.max(0, Math.min(255, val));
                cell.style.backgroundColor = `rgb(${norm}, ${norm}, ${norm})`;
                cell.style.color = norm > 128 ? '#1e293b' : '#f1f5f9';
            }
        } else if (type === 'qtable') {
            const maxQt = 200;
            const t = Math.min(1, val / maxQt);
            cell.style.backgroundColor = `rgb(255, ${Math.round(255 - t * 110)}, ${Math.round(255 - t * 200)})`;
            cell.style.color = t > 0.5 ? '#7c2d12' : '#78350f';
        } else if (type === 'frequency' || type === 'error') {
            if (Math.abs(val) < 0.5) {
                cell.classList.add('cell-zero');
                cell.style.backgroundColor = ''; // Clear inline if needed or handled by CSS
                cell.style.color = '';
            } else {
                const isPos = val > 0;
                const visualMax = (type === 'error') ? 30 : 100;
                const opacity = Math.max(0.1, Math.min(1, Math.abs(val) / visualMax));
                cell.style.backgroundColor = isPos
                    ? `rgba(239, 68, 68, ${opacity})`
                    : `rgba(59, 130, 246, ${opacity})`;
                cell.style.color = opacity > 0.5 ? '#fff' : 'var(--text)';
            }
        }
    }

    if (type === 'frequency') {
        const stage = el.closest('.pipeline-block') ?? el.closest('.analysis-card');
        if (stage) {
            const header = stage.querySelector('.pipeline-block-header') ?? stage.querySelector('.analysis-header');
            if (header) {
                let badge = header.querySelector('.nonzero-badge') as HTMLElement;
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'nonzero-badge';
                    // header.appendChild(badge); // Don't append yet, set up listener first
                    badge.addEventListener('mouseenter', (e) => showTooltip(e, nonZeroCount, '-', '-', 'Non-Zero Coefficients'));
                    badge.addEventListener('mouseleave', () => hideTooltip());
                    header.appendChild(badge);
                }
                // Just update text, don't recreate listeners if it exists
                badge.textContent = `${nonZeroCount}`;
            }
        }
    }
}

function getBlockRGB(imageData: ImageData, bx: number, by: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(64 * 3);
    const pixels = imageData.data;
    const w = imageData.width;

    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            const x = bx * 8 + dx;
            const y = by * 8 + dy;
            const idx = (y * w + x) * 4;
            const i = dy * 8 + dx;
            data[i * 3] = pixels[idx];
            data[i * 3 + 1] = pixels[idx + 1];
            data[i * 3 + 2] = pixels[idx + 2];
        }
    }
    return data;
}
