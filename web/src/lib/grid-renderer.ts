import { showTooltip, hideTooltip } from './tooltip.js';
import { showBasisPopover, hideBasisPopover, getCachedGridData } from './basis-popover.js';
import { ZIGZAG_INDICES, computeBasisPattern, computeHaarBasisPattern, getFreqLabel, getHaarFreqLabel } from './dct-utils.js';
import { appState } from './state.svelte.js';

function getBasisPattern(u: number, v: number): Float64Array {
    return appState.transformType === 1
        ? computeHaarBasisPattern(u, v)
        : computeBasisPattern(u, v);
}

function getTransformFreqLabel(row: number, col: number): string {
    return appState.transformType === 1
        ? getHaarFreqLabel(row, col)
        : getFreqLabel(row, col);
}

const ALL_GRID_IDS = [
    'gridOriginal', 'gridDCT', 'gridQuantized', 'gridQuantized2',
    'gridQuantizedAdvanced', 'gridDequantized', 'gridReconstructed',
    'gridQuantTable', 'gridError'
];

let lastHighlightedKey: string | null = null;

export function clearAllHighlights(): void {
    lastHighlightedKey = null;
    document.querySelectorAll('.grid-cell.cell-highlight, .zz-cell.cell-highlight').forEach(c => {
        c.classList.remove('cell-highlight');
    });
}

export function highlightAcrossGrids(row: number, col: number): void {
    clearAllHighlights();
    const idx = row * 8 + col;
    ALL_GRID_IDS.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const cell = grid.children[idx] as HTMLElement | undefined;
        if (cell && cell.classList) cell.classList.add('cell-highlight');
    });

    const zzContainer = document.getElementById('gridZigzag');
    if (zzContainer) {
        const zzCell = (zzContainer.querySelector(`.zz-cell[data-idx="${idx}"]`) ||
            zzContainer.querySelector(`.zz-run[data-indices~="${idx}"]`)) as HTMLElement | null;
        if (zzCell) zzCell.classList.add('cell-highlight');
    }
}

export function highlightRunAcrossGrids(indices: number[]): void {
    clearAllHighlights();
    indices.forEach(idx => {
        ALL_GRID_IDS.forEach(gridId => {
            const grid = document.getElementById(gridId);
            if (!grid) return;
            const cell = grid.children[idx] as HTMLElement | undefined;
            if (cell && cell.classList) cell.classList.add('cell-highlight');
        });
    });

    const zzContainer = document.getElementById('gridZigzag');
    if (zzContainer) {
        indices.forEach(idx => {
            const zzCell = zzContainer.querySelector(`.zz-cell[data-idx="${idx}"]`) as HTMLElement | null;
            if (zzCell) zzCell.classList.add('cell-highlight');
        });
    }
}

function getCellDescription(row: number, col: number, gridType: string): string {
    if (gridType === 'transform' || gridType === 'dequantized' || gridType === 'quantized') {
        if (row === 0 && col === 0) return 'DC coefficient (average brightness)';
        const label = getTransformFreqLabel(row, col);
        return `${label} frequency`;
    }
    if (gridType === 'original' || gridType === 'reconstructed') return 'Pixel intensity';
    if (gridType === 'error') return 'Error value';
    if (gridType === 'qtable') return 'Divisor';
    return '';
}

export function renderLossMeter(mse: number, _peakError: number): void {
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

export function renderGrid(
    elementId: string,
    data: Float64Array | Uint8ClampedArray | number[],
    type: string = 'number',
    gridType: string = '',
    isRGB: boolean = false
): void {
    const el = document.getElementById(elementId);
    if (!el) return;

    // Event delegation — one-time setup per grid container
    if (!el.hasAttribute('data-events-attached')) {
        el.setAttribute('data-events-attached', 'true');

        el.addEventListener('mousemove', (e) => {
            const target = e.target as HTMLElement;
            const cell = target.closest('.grid-cell') as HTMLElement;
            if (!cell) return;

            const row = parseInt(cell.dataset.row || '0');
            const col = parseInt(cell.dataset.col || '0');
            const valStr = cell.dataset.val || '';
            const desc = cell.dataset.desc || '';
            const isBasis = cell.dataset.isBasis === 'true';

            const key = `${row},${col}`;
            if (lastHighlightedKey !== key) {
                highlightAcrossGrids(row, col);
                lastHighlightedKey = key;
            }

            if (!isBasis) {
                showTooltip(e, valStr, row, col, desc);
            }
            if (isBasis) {
                showBasisPopover(e, row, col);
            }
        });

        el.addEventListener('mouseleave', () => {
            hideTooltip();
            hideBasisPopover();
            clearAllHighlights();
        });

        el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const cell = target.closest('.grid-cell') as HTMLElement;
            if (!cell) return;

            const isBasis = cell.dataset.isBasis === 'true';
            if (!isBasis) return;

            const row = parseInt(cell.dataset.row || '0');
            const col = parseInt(cell.dataset.col || '0');
            const targetGridId = el.dataset.target || '';

            window.dispatchEvent(new CustomEvent('animate-basis', {
                detail: { row, col, targetGridId }
            }));
            showBannerForCell(row, col);
            if (el.id === 'gridDequantized') {
                applyPartialReconToGrid(row, col);
            }
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

        let cell: HTMLElement;
        if (hasChildren) {
            cell = el.children[i] as HTMLElement;
        } else {
            cell = document.createElement('div');
            cell.className = 'grid-cell';
            el.appendChild(cell);
        }

        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.gridType = gridType;

        const isBasis = (gridType === 'transform' || gridType === 'quantized' || gridType === 'dequantized');
        cell.dataset.isBasis = String(isBasis);
        if (isBasis) {
            cell.classList.add('is-basis');
        } else {
            cell.classList.remove('is-basis');
        }

        let displayVal: string;
        let tooltipVal: string;

        if (type === 'intensity' || type === 'qtable' || gridType === 'quantized') {
            displayVal = String(Math.round(val));
            tooltipVal = isRGB && type === 'intensity' ? `RGB(${r},${g},${b})` : displayVal;
        } else {
            displayVal = val.toFixed(1);
            if (val === 0) displayVal = '0';
            if (displayVal === '-0.0') displayVal = '0';
            tooltipVal = displayVal;
        }

        cell.textContent = (isRGB && type === 'intensity') ? '' : displayVal;
        cell.dataset.val = tooltipVal;
        cell.dataset.desc = getCellDescription(row, col, gridType);

        if (type === 'frequency' && Math.abs(val) >= 0.5) nonZeroCount++;

        cell.className = 'grid-cell'; // reset classes (removes cell-zero, cell-highlight)

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
                cell.style.backgroundColor = '';
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
                    badge.style.cursor = 'help';
                    badge.addEventListener('mouseenter', (e) => {
                        const target = e.currentTarget as HTMLElement;
                        const count = parseInt(target.textContent || '0');
                        showTooltip(e, `${count}/64`, '-', '-', 'Non-zero coefficients (|value| ≥ 0.5)');
                    });
                    badge.addEventListener('mouseleave', () => hideTooltip());
                    header.appendChild(badge);
                }
                badge.textContent = `${nonZeroCount}`;
            }
        }
    }
}

export function renderZigzagArray(data: Float64Array): void {
    const el = document.getElementById('gridZigzag');
    if (!el) return;

    el.innerHTML = '';

    let run = 0;

    for (let i = 0; i < 64; i++) {
        const idx = ZIGZAG_INDICES[i];
        const val = Math.round(data[idx]);

        if (val === 0) {
            run++;
        } else {
            if (run > 0) {
                if (run > 1) {
                    const runIndices = [];
                    for (let j = 0; j < run; j++) {
                        runIndices.push(ZIGZAG_INDICES[i - run + j]);
                    }
                    el.appendChild(createRunElement(run, runIndices, i - run));
                } else {
                    const zeroIdx = ZIGZAG_INDICES[i - 1];
                    el.appendChild(createZzCell(0, zeroIdx, i - 1));
                }
                run = 0;
            }

            el.appendChild(createZzCell(val, idx, i));
        }
    }

    if (run > 0) {
        const eobEl = document.createElement('div');
        eobEl.className = 'zz-eob tooltip-container';
        eobEl.innerHTML = `EOB<div class="tooltip-content-small"><strong>End of Block</strong><br>Remaining ${run} coefficients are all zero.</div>`;
        el.appendChild(eobEl);
    }
}

function createZzCell(val: number, idx: number, zIndex: number): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'zz-cell';
    if (val === 0) cell.classList.add('zz-zero');
    if (zIndex === 0) cell.classList.add('dc-cell');

    cell.dataset.idx = String(idx);
    cell.textContent = String(val);

    const row = Math.floor(idx / 8);
    const col = idx % 8;

    cell.addEventListener('mouseenter', (e) => {
        highlightAcrossGrids(row, col);
        showTooltip(e, String(val), String(row), String(col), `Position ${zIndex} in Zig-zag scan`);
    });
    cell.addEventListener('mouseleave', () => {
        clearAllHighlights();
        hideTooltip();
    });

    return cell;
}

function createRunElement(count: number, indices: number[], startIndex: number): HTMLElement {
    const runEl = document.createElement('div');
    runEl.className = 'zz-run tooltip-container';
    runEl.dataset.indices = indices.join(' ');

    // Create visual dots for the zeros
    let dots = '';
    const maxDots = 8;
    for (let i = 0; i < Math.min(count, maxDots); i++) {
        dots += '<span class="run-dot"></span>';
    }
    if (count > maxDots) dots += '<span class="run-more">+</span>';

    runEl.innerHTML = `
        <span class="run-count">${count} Zeros</span>
        <div class="run-dots">${dots}</div>
    `;

    runEl.addEventListener('mouseenter', (e) => {
        highlightRunAcrossGrids(indices);
        showTooltip(e, `${count} Zeros`, `Pos ${startIndex}-${startIndex + count - 1}`, '', `Run of ${count} zero coefficients in Zig-zag scan`);
    });

    runEl.addEventListener('mouseleave', () => {
        clearAllHighlights();
        hideTooltip();
    });

    return runEl;
}

let animationInterval: number | null = null;

export function startZigzagAnimation(): void {
    if (animationInterval !== null) {
        clearInterval(animationInterval);
        animationInterval = null;
        clearAllHighlights();
        // If clicked again, it just stops the animation.
        return;
    }

    let currentIndex = 0;

    // First, scroll to the zig-zag view if needed
    const advancedSection = document.querySelector('.advanced-section') as HTMLDetailsElement;
    if (advancedSection && !advancedSection.open) {
        advancedSection.open = true;
    }

    animationInterval = window.setInterval(() => {
        if (currentIndex >= 64) {
            if (animationInterval !== null) {
                clearInterval(animationInterval);
                animationInterval = null;
            }
            setTimeout(() => {
                clearAllHighlights();
            }, 1000);
            return;
        }

        const idx = ZIGZAG_INDICES[currentIndex];
        const row = Math.floor(idx / 8);
        const col = idx % 8;

        highlightAcrossGrids(row, col);

        // Scroll the active zz-cell or zz-run into view within the container
        const zzContainer = document.getElementById('gridZigzag');
        if (zzContainer) {
            const activeZz = (zzContainer.querySelector(`.zz-cell[data-idx="${idx}"]`) ||
                zzContainer.querySelector(`.zz-run[data-indices~="${idx}"]`)) as HTMLElement | null;
            if (activeZz) {
                // simple scroll into view if it's hidden
                activeZz.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }
        }

        currentIndex++;
    }, 100); // 100ms per coefficient = 6.4 seconds for a full block
}

const RECON_STEP_MS = 120; // ms per coefficient

interface ReconState {
    dequantized: Float64Array;
    cells: HTMLElement[];
    accumulated: Float64Array;
    currentIndex: number;
    lastBasisPattern: Float64Array | null;
    lastBasisCoeff: number;
    startTime: number;
    // For the info banner: last processed position (even zero coefficients)
    lastZigzagIdx: number;
    lastRawCoeff: number;
}

let reconstructionAnimationId: number | null = null;
let reconState: ReconState | null = null;
let partialReconTimeoutId: ReturnType<typeof setTimeout> | null = null;

function applyPartialReconToGrid(row: number, col: number): void {
    if (reconstructionAnimationId !== null) return; // animation takes priority

    const data = getCachedGridData();
    if (!data?.dequantizedData) return;

    const flatIdx = row * 8 + col;
    let zzPos = -1;
    for (let i = 0; i < 64; i++) {
        if (ZIGZAG_INDICES[i] === flatIdx) { zzPos = i; break; }
    }
    if (zzPos < 0) return;

    const targetGrid = document.getElementById('gridReconstructed');
    if (!targetGrid) return;
    const cells = Array.from(targetGrid.querySelectorAll('.grid-cell')) as HTMLElement[];
    if (cells.length !== 64) return;

    // Compute partial IDCT: sum DC through zzPos in zig-zag order
    const accumulated = new Float64Array(64);
    let currentPattern: Float64Array | null = null;
    let currentCoeff = 0;

    for (let i = 0; i <= zzPos; i++) {
        const zIdx = ZIGZAG_INDICES[i];
        const coeff = data.dequantizedData[zIdx];
        if (Math.abs(coeff) > 0.0001) {
            const r2 = Math.floor(zIdx / 8);
            const c2 = zIdx % 8;
            const pattern = getBasisPattern(c2, r2);
            for (let j = 0; j < 64; j++) accumulated[j] += coeff * pattern[j];
            if (i === zzPos) { currentPattern = pattern; currentCoeff = coeff; }
        }
    }

    // Normalise tint by max absolute contribution of this step
    let maxContrib = 0;
    if (currentPattern) {
        for (let i = 0; i < 64; i++) {
            const v = Math.abs(currentPattern[i] * currentCoeff);
            if (v > maxContrib) maxContrib = v;
        }
    }

    // Flash: render with vivid red/blue basis overlay
    for (let i = 0; i < 64; i++) {
        const baseVal = Math.max(0, Math.min(255, accumulated[i] + 128));
        let r = baseVal, g = baseVal, b = baseVal;
        if (currentPattern && maxContrib > 0) {
            const contrib = currentPattern[i] * currentCoeff;
            const t = Math.min(1, Math.abs(contrib) / maxContrib) * 0.75;
            if (contrib > 0) {
                r = Math.round(r + (239 - r) * t);
                g = Math.round(g + (68  - g) * t);
                b = Math.round(b + (68  - b) * t);
            } else if (contrib < 0) {
                r = Math.round(r + (59  - r) * t);
                g = Math.round(g + (130 - g) * t);
                b = Math.round(b + (246 - b) * t);
            }
        }
        cells[i].style.backgroundColor = `rgb(${r},${g},${b})`;
        cells[i].style.color = baseVal > 128 ? '#1e293b' : '#f1f5f9';
        cells[i].textContent = String(Math.round(baseVal));
    }

    // After flash, settle to clean partial reconstruction
    if (partialReconTimeoutId !== null) clearTimeout(partialReconTimeoutId);
    partialReconTimeoutId = setTimeout(() => {
        partialReconTimeoutId = null;
        if (reconstructionAnimationId !== null) return;
        for (let i = 0; i < 64; i++) {
            const baseVal = Math.max(0, Math.min(255, accumulated[i] + 128));
            cells[i].style.backgroundColor = `rgb(${baseVal},${baseVal},${baseVal})`;
            cells[i].style.color = baseVal > 128 ? '#1e293b' : '#f1f5f9';
            cells[i].textContent = String(Math.round(baseVal));
        }
    }, 600);
}

export function stopReconstructionAnimation(): void {
    if (reconstructionAnimationId !== null) {
        cancelAnimationFrame(reconstructionAnimationId);
        reconstructionAnimationId = null;
    }
    if (partialReconTimeoutId !== null) {
        clearTimeout(partialReconTimeoutId);
        partialReconTimeoutId = null;
    }
    reconState = null;
    setReconstructionButtonIcon(false);
    updateReconstructionProgress(-1);
    hideReconAnimBanner();
}

export function startReconstructionAnimation(): void {
    // Pause if currently playing
    if (reconstructionAnimationId !== null) {
        cancelAnimationFrame(reconstructionAnimationId);
        reconstructionAnimationId = null;
        setReconstructionButtonIcon(false);
        return;
    }

    // Resume if paused mid-animation
    if (reconState !== null) {
        reconState.startTime = performance.now() - reconState.currentIndex * RECON_STEP_MS;
        setReconstructionButtonIcon(true);
        reconstructionAnimationId = requestAnimationFrame(runReconFrame);
        return;
    }

    // Fresh start
    const data = getCachedGridData();
    if (!data || !data.dequantizedData) return;

    const targetGrid = document.getElementById('gridReconstructed');
    if (!targetGrid) return;

    const cells = Array.from(targetGrid.querySelectorAll('.grid-cell')) as HTMLElement[];
    if (cells.length !== 64) return;

    reconState = {
        dequantized: data.dequantizedData,
        cells,
        accumulated: new Float64Array(64),
        currentIndex: 0,
        lastBasisPattern: null,
        lastBasisCoeff: 0,
        startTime: performance.now(),
        lastZigzagIdx: 0,
        lastRawCoeff: 0,
    };

    setReconstructionButtonIcon(true);
    updateReconstructionProgress(0);
    reconstructionAnimationId = requestAnimationFrame(runReconFrame);
}

function runReconFrame(now: number): void {
    if (!reconState) return;

    const elapsed = now - reconState.startTime;
    const targetIdx = Math.floor(elapsed / RECON_STEP_MS);

    let stepped = false;
    while (reconState.currentIndex <= targetIdx && reconState.currentIndex < 64) {
        const zIdx = ZIGZAG_INDICES[reconState.currentIndex];
        const coeff = reconState.dequantized[zIdx];

        reconState.lastZigzagIdx = zIdx;
        reconState.lastRawCoeff = coeff;

        if (Math.abs(coeff) > 0.0001) {
            const row = Math.floor(zIdx / 8);
            const col = zIdx % 8;
            reconState.lastBasisPattern = getBasisPattern(col, row);
            reconState.lastBasisCoeff = coeff;
            for (let i = 0; i < 64; i++) {
                reconState.accumulated[i] += coeff * reconState.lastBasisPattern[i];
            }
        }
        reconState.currentIndex++;
        stepped = true;
    }

    // Cross-highlight and update banner for the step just processed
    if (stepped && reconState.currentIndex < 64) {
        const zIdx = ZIGZAG_INDICES[reconState.currentIndex];
        highlightAcrossGrids(Math.floor(zIdx / 8), zIdx % 8);
        updateReconstructionProgress(reconState.currentIndex);
        updateReconAnimBanner(reconState.currentIndex, reconState.lastZigzagIdx, reconState.lastRawCoeff, reconState.lastBasisPattern);
    }

    renderReconCells(reconState.cells, reconState.accumulated, reconState.lastBasisPattern, reconState.lastBasisCoeff);

    if (reconState.currentIndex < 64) {
        reconstructionAnimationId = requestAnimationFrame(runReconFrame);
    } else {
        // Final pass: render without tint for clean result
        renderReconCells(reconState.cells, reconState.accumulated, null, 0);
        reconstructionAnimationId = null;
        reconState = null;
        clearAllHighlights();
        setReconstructionButtonIcon(false);
        updateReconstructionProgress(64);
        updateReconAnimBanner(64, 0, 0, null);
    }
}

function renderReconCells(
    cells: HTMLElement[],
    accumulated: Float64Array,
    basisPattern: Float64Array | null,
    basisCoeff: number
): void {
    for (let i = 0; i < 64; i++) {
        const val = accumulated[i];
        const baseVal = Math.max(0, Math.min(255, val + 128));
        let r = baseVal, g = baseVal, b = baseVal;

        if (basisPattern) {
            const contrib = basisPattern[i] * basisCoeff;
            if (contrib > 1) {
                r = Math.min(255, r + 30); g = Math.max(0, g - 10); b = Math.max(0, b - 10);
            } else if (contrib < -1) {
                b = Math.min(255, b + 30); r = Math.max(0, r - 10); g = Math.max(0, g - 10);
            }
        }

        cells[i].style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        cells[i].style.color = baseVal > 128 ? '#1e293b' : '#f1f5f9';
        cells[i].textContent = Math.round(baseVal).toString();
    }
}

function setReconstructionButtonIcon(playing: boolean): void {
    const btn = document.querySelector('.pipeline-play-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const svg = btn.querySelector('svg');
    if (!svg) return;
    svg.innerHTML = playing
        ? '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>'
        : '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
}

function updateReconstructionProgress(index: number): void {
    const el = document.getElementById('reconstructionProgress');
    if (!el) return;

    if (index < 0) { el.style.display = 'none'; return; }
    if (index === 0) { el.textContent = ''; el.style.display = 'none'; return; }

    if (index >= 64) {
        el.textContent = '64/64';
        el.style.display = '';
        return;
    }

    // Show label for the coefficient we just finished adding (index - 1)
    const zIdx = ZIGZAG_INDICES[index - 1];
    const label = getTransformFreqLabel(Math.floor(zIdx / 8), zIdx % 8);
    el.textContent = `${index}/64 · ${label}`;
    el.style.display = '';
}

function hideReconAnimBanner(): void {
    const banner = document.getElementById('reconAnimBanner');
    if (banner) banner.style.display = 'none';
}

function showBannerForCell(row: number, col: number): void {
    if (reconstructionAnimationId !== null) return; // animation takes priority
    const data = getCachedGridData();
    if (!data?.dequantizedData) return;

    const flatIdx = row * 8 + col;
    const coeff = data.dequantizedData[flatIdx];

    // Find 1-based zig-zag scan position (capped at 63 to avoid the "done" state)
    let zzPos = 1;
    for (let i = 0; i < 64; i++) {
        if (ZIGZAG_INDICES[i] === flatIdx) { zzPos = Math.min(i + 1, 63); break; }
    }

    const pattern = Math.abs(coeff) > 0.0001 ? getBasisPattern(col, row) : null;
    updateReconAnimBanner(zzPos, flatIdx, coeff, pattern);
}

const FREQ_DESCRIPTIONS: Record<string, string> = {
    'DC':   'Sets the average brightness across the whole block',
    'Low':  'Broad shapes and gentle gradients',
    'Mid':  'Edges and moderate detail',
    'High': 'Sharp edges and fine texture',
};

const FREQ_COLORS: Record<string, string> = {
    'DC':   '#8b5cf6',
    'Low':  '#10b981',
    'Mid':  '#f59e0b',
    'High': '#ef4444',
};

function updateReconAnimBanner(
    processedCount: number,
    zigzagIdx: number,
    coeff: number,
    basisPattern: Float64Array | null
): void {
    const banner = document.getElementById('reconAnimBanner');
    if (!banner) return;

    if (processedCount >= 64) {
        // Done state
        const stepEl  = document.getElementById('reconBannerStep');
        const fillEl  = document.getElementById('reconBannerFill') as HTMLElement | null;
        const freqEl  = document.getElementById('reconBannerFreq');
        const coeffEl = document.getElementById('reconBannerCoeff');
        const descEl  = document.getElementById('reconBannerDesc');
        if (stepEl)  stepEl.textContent  = '64';
        if (fillEl)  fillEl.style.width  = '100%';
        if (freqEl)  { freqEl.textContent = 'Complete'; freqEl.style.background = '#10b981'; freqEl.style.color = 'white'; }
        if (coeffEl) { coeffEl.textContent = ''; coeffEl.style.color = ''; }
        if (descEl)  descEl.textContent  = 'All 64 coefficients applied — reconstruction complete';
        // Clear the canvas
        const canvas = document.getElementById('reconBasisCanvas') as HTMLCanvasElement | null;
        if (canvas) { const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
        banner.style.display = '';
        return;
    }

    banner.style.display = '';

    const row   = Math.floor(zigzagIdx / 8);
    const col   = zigzagIdx % 8;
    const label = getTransformFreqLabel(row, col);
    const isZero = Math.abs(coeff) < 0.0001;

    const stepEl  = document.getElementById('reconBannerStep');
    const fillEl  = document.getElementById('reconBannerFill') as HTMLElement | null;
    const freqEl  = document.getElementById('reconBannerFreq');
    const coeffEl = document.getElementById('reconBannerCoeff');
    const descEl  = document.getElementById('reconBannerDesc');

    if (stepEl)  stepEl.textContent = String(processedCount);
    if (fillEl)  fillEl.style.width = `${(processedCount / 64) * 100}%`;

    if (freqEl) {
        freqEl.textContent = label;
        freqEl.style.background = FREQ_COLORS[label] ?? 'var(--primary)';
        freqEl.style.color = 'white';
    }

    if (coeffEl) {
        if (isZero) {
            coeffEl.textContent = 'coeff = 0  (skipped)';
            coeffEl.style.color = 'var(--text-muted)';
        } else {
            const sign = coeff > 0 ? '+' : '';
            coeffEl.textContent = `coeff = ${sign}${coeff.toFixed(1)}`;
            coeffEl.style.color = coeff > 0 ? '#ef4444' : '#3b82f6';
        }
    }

    if (descEl) {
        descEl.textContent = isZero
            ? 'Quantized to zero — contributes nothing to the image'
            : FREQ_DESCRIPTIONS[label] ?? '';
    }

    const canvas = document.getElementById('reconBasisCanvas') as HTMLCanvasElement | null;
    if (canvas && basisPattern && !isZero) {
        drawContributionOnCanvas(canvas, basisPattern, coeff);
    } else if (canvas && isZero) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'var(--bg-secondary, #f1f5f9)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('zero', canvas.width / 2, canvas.height / 2 + 4);
        }
    }
}

function drawContributionOnCanvas(canvas: HTMLCanvasElement, pattern: Float64Array, coeff: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const cell = size / 8;

    let maxAbs = 0;
    for (let i = 0; i < 64; i++) {
        const v = Math.abs(pattern[i] * coeff);
        if (v > maxAbs) maxAbs = v;
    }
    const range = maxAbs || 1;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const contrib = pattern[y * 8 + x] * coeff;
            const t = contrib / range; // -1..1
            let r: number, g: number, b: number;
            if (t >= 0) {
                // positive → warm red
                r = 239; g = Math.round(220 * (1 - t * 0.7)); b = Math.round(220 * (1 - t * 0.7));
            } else {
                // negative → cool blue
                r = Math.round(220 * (1 + t * 0.7)); g = Math.round(220 * (1 + t * 0.7)); b = 239;
            }
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x * cell, y * cell, cell, cell);
        }
    }
    // Subtle grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('animate-zigzag', startZigzagAnimation);
    window.addEventListener('animate-reconstruction', startReconstructionAnimation);
}

export function renderEntropySummary(symbols: any[]): void {
    const container = document.getElementById('entropySummary');
    if (!container) return;

    let dcBits = 0;
    let acBits = 0;
    let eobBits = 0;
    let totalBits = 0;

    const dcSymbols: any[] = [];
    const acSymbols: any[] = [];
    const eobSymbols: any[] = [];

    symbols.forEach(sym => {
        totalBits += sym.totalBits;
        if (sym.type === 'DC') {
            dcBits += sym.totalBits;
            dcSymbols.push(sym);
        } else if (sym.type === 'EOB') {
            eobBits += sym.totalBits;
            eobSymbols.push(sym);
        } else {
            acBits += sym.totalBits;
            acSymbols.push(sym);
        }
    });

    const renderMiniTable = (symList: any[]) => {
        if (symList.length === 0) return '<div class="empty-detail">No symbols</div>';
        let rows = '';
        symList.forEach(s => {
            let valHtml = '-';
            if (s.type === 'AC') {
                const dots = Array.from({ length: Math.min(s.run, 5) }, () => '<span class="run-dot"></span>').join('');
                const runHtml = s.run > 0 ? (s.run > 1
                    ? `<div class="zz-run mini-zz"><span class="run-count">${s.run} Zeros</span><div class="run-dots">${dots}${s.run > 5 ? '<span class="run-more">+</span>' : ''}</div></div>`
                    : '<div class="zz-cell zz-zero mini-zz">0</div>') : '';
                const valCellHtml = `<div class="zz-cell mini-zz">${s.amplitude}</div>`;
                valHtml = `<div class="sym-val-wrap">${valCellHtml}${runHtml ? '<span class="sym-val-sep">and</span>' : ''}${runHtml}</div>`;
            } else if (s.type === 'DC') {
                valHtml = `<div class="zz-cell dc-cell mini-zz">${s.amplitude}</div>`;
            } else if (s.type === 'ZRL') {
                const dots = Array.from({ length: 5 }, () => '<span class="run-dot"></span>').join('');
                valHtml = `<div class="zz-run mini-zz"><span class="run-count">16 Zeros</span><div class="run-dots">${dots}<span class="run-more">+</span></div></div>`;
            } else if (s.type === 'EOB') {
                valHtml = '<div class="zz-eob mini-zz">EOB</div>';
            }

            rows += `
                <tr>
                    <td class="sym-pos-cell">#${s.zIndex}</td>
                    <td><span class="sym-type ${s.type.toLowerCase()}">${s.type}</span></td>
                    <td class="sym-val-cell">${valHtml}</td>
                    <td class="sym-bits-total">
                        <div class="cost-calc">
                            <span class="calc-part" title="Huffman Code: A variable-length code representing the (Run, Category) pair. Common patterns get shorter codes.">${s.baseBits}</span>
                            <span class="calc-op">+</span>
                            <span class="calc-part" title="Extra Bits: Fixed-length bits used to specify the exact sign and magnitude within the category.">${s.magBits}</span>
                            <span class="calc-eq">=</span>
                            <span class="calc-res">${s.totalBits}</span>
                        </div>
                    </td>
                </tr>
            `;
        });
        return `
            <table class="entropy-table mini">
                <thead>
                    <tr>
                        <th title="Position in the 0-63 zig-zag scan order">Pos</th>
                        <th title="DC = Base color difference, AC = Detail/Edge, ZRL = Zero Run, EOB = End of Block">Symbol</th>
                        <th title="Visual representation of the coefficient and any preceding zeros">Value</th>
                        <th title="Total cost = Category Huffman code + Extra magnitude bits">Cost (H+E=Total)</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    };

    const compressionPct = (totalBits / 512 * 100).toFixed(1);
    const savings = 512 - totalBits;
    const savingsPct = Math.abs(100 - totalBits / 512 * 100).toFixed(1);
    const isSmaller = savings > 0;

    const dcPct = totalBits > 0 ? (dcBits / totalBits * 100).toFixed(1) : '0';
    const acPct = totalBits > 0 ? (acBits / totalBits * 100).toFixed(1) : '0';
    const eobPct = totalBits > 0 ? (eobBits / totalBits * 100).toFixed(1) : '0';

    container.innerHTML = `
        <div class="entropy-summary-header">Data Compression Summary</div>
        <div class="summary-stats">
            <div class="stat-item">
                <div class="stat-label">Original</div>
                <div class="stat-value">512 bits</div>
                <div class="stat-sub">64 px × 8 bits</div>
            </div>
            <div class="stat-item ${isSmaller ? 'highlight-stat' : 'highlight-stat-poor'}">
                <div class="stat-label">${isSmaller ? 'Saved' : 'Overhead'}</div>
                <div class="stat-value ${isSmaller ? '' : 'stat-poor'}">${Math.abs(savings)} bits</div>
                <div class="stat-sub">${savingsPct}% ${isSmaller ? 'smaller' : 'larger'}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Encoded</div>
                <div class="stat-value">${totalBits} bits</div>
                <div class="stat-sub">${(totalBits / 8).toFixed(1)} bytes</div>
            </div>
        </div>

        <div class="compression-ratio-wrap">
            <div class="compression-ratio-label">
                <span>Encoded size</span>
                <span class="compression-ratio-value">${compressionPct}% of original</span>
            </div>
            <div class="compression-ratio-track">
                <div class="compression-ratio-fill ${isSmaller ? '' : 'ratio-over'}" style="width: ${Math.min(100, parseFloat(compressionPct))}%"></div>
            </div>
        </div>

        <div class="breakdown-bar-wrap">
            <div class="breakdown-bar-label">Bit breakdown</div>
            <div class="breakdown-bar">
                <div class="breakdown-segment seg-dc" style="width: ${dcPct}%" title="DC: ${dcBits} bits"></div>
                <div class="breakdown-segment seg-ac" style="width: ${acPct}%" title="AC + Runs: ${acBits} bits"></div>
                <div class="breakdown-segment seg-eob" style="width: ${eobPct}%" title="EOB: ${eobBits} bits"></div>
            </div>
            <div class="breakdown-legend">
                <span class="legend-dot seg-dc"></span><span class="legend-label">DC&nbsp;${dcBits}b</span>
                <span class="legend-dot seg-ac"></span><span class="legend-label">AC&nbsp;${acBits}b</span>
                <span class="legend-dot seg-eob"></span><span class="legend-label">EOB&nbsp;${eobBits}b</span>
            </div>
        </div>

        <div class="entropy-cost-header">
            <span class="cost-title">Bit Cost Breakdown <span class="entropy-cost-hint">(click to expand)</span></span>
            <div class="cost-actions">
                <button class="cost-action-btn" id="expandAllCosts">Expand All</button>
                <button class="cost-action-btn" id="collapseAllCosts">Collapse All</button>
            </div>
        </div>
        <div class="cost-breakdown">
            <details class="cost-details">
                <summary class="cost-row">
                    <span class="cost-label"><svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg><span class="sym-type dc">Base Color</span> (DC)</span>
                    <span class="cost-value">${dcBits} bits</span>
                </summary>
                <div class="cost-expanded">
                    ${renderMiniTable(dcSymbols)}
                </div>
            </details>
            
            <details class="cost-details">
                <summary class="cost-row">
                    <span class="cost-label"><svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg><span class="sym-type ac">Details & Zeros</span> (AC & Runs)</span>
                    <span class="cost-value">${acBits} bits</span>
                </summary>
                <div class="cost-expanded">
                    ${renderMiniTable(acSymbols)}
                </div>
            </details>
            
            <details class="cost-details">
                <summary class="cost-row">
                    <span class="cost-label"><svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg><span class="sym-type eob">End of Block</span> (EOB)</span>
                    <span class="cost-value">${eobBits} bits</span>
                </summary>
                 <div class="cost-expanded">
                    ${renderMiniTable(eobSymbols)}
                </div>
            </details>
        </div>

        <div class="entropy-education">
            <div class="edu-title">How it works</div>
            <p class="edu-text">
                JPEG saves space by grouping <strong>runs of zeros</strong> and <strong>value ranges</strong> into categories. 
                Common categories get short <strong>Huffman Codes</strong> (the first number), while the exact value is specified 
                using <strong>Extra Bits</strong> (the second number). Most high-frequency coefficients become zero after quantization, 
                allowing them to be skipped entirely with a single EOB symbol.
            </p>
        </div>
    `;

    // Add event listeners for expand/collapse all
    const expandBtn = container.querySelector('#expandAllCosts');
    const collapseBtn = container.querySelector('#collapseAllCosts');

    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            container.querySelectorAll('.cost-details').forEach(el => (el as HTMLDetailsElement).open = true);
        });
    }

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            container.querySelectorAll('.cost-details').forEach(el => (el as HTMLDetailsElement).open = false);
        });
    }
}
