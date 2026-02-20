import { showTooltip, hideTooltip } from './tooltip.js';
import { showBasisPopover, hideBasisPopover } from './basis-popover.js';
import { ZIGZAG_INDICES } from './dct-utils.js';

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
        const zzCell = zzContainer.querySelector(`.zz-cell[data-idx="${idx}"]`) as HTMLElement | null;
        if (zzCell) zzCell.classList.add('cell-highlight');
    }
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

        const isBasis = (gridType === 'dct' || gridType === 'quantized' || gridType === 'dequantized');
        cell.dataset.isBasis = String(isBasis);
        if (isBasis) cell.style.cursor = 'help';
        else cell.style.cursor = 'default';

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
                if (run > 2) {
                    const runEl = document.createElement('div');
                    runEl.className = 'zz-run';
                    runEl.textContent = `${run} Zeros`;
                    el.appendChild(runEl);
                } else {
                    for (let j = 0; j < run; j++) {
                        const zeroIdx = ZIGZAG_INDICES[i - run + j];
                        el.appendChild(createZzCell(0, zeroIdx, i - run + j));
                    }
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

        // Scroll the active zz-cell into view within the container
        const zzContainer = document.getElementById('gridZigzag');
        if (zzContainer) {
            const activeZz = zzContainer.querySelector(`.zz-cell[data-idx="${idx}"]`) as HTMLElement;
            if (activeZz) {
                // simple scroll into view if it's hidden
                activeZz.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }
        }

        currentIndex++;
    }, 100); // 100ms per coefficient = 6.4 seconds for a full block
}

if (typeof window !== 'undefined') {
    window.addEventListener('animate-zigzag', startZigzagAnimation);
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
            let valStr = '-';
            if (s.type === 'AC') valStr = `${s.run} zeros, then ${s.amplitude}`;
            else if (s.type === 'DC') valStr = `value: ${s.amplitude}`;
            else if (s.type === 'ZRL') valStr = `16 zeros`;

            rows += `
                <tr>
                    <td><span class="sym-type ${s.type.toLowerCase()}">${s.type}</span></td>
                    <td>${valStr}</td>
                    <td class="sym-bits-total">${s.totalBits}</td>
                </tr>
            `;
        });
        return `
            <table class="entropy-table mini">
                <thead><tr><th>Symbol</th><th>Value</th><th>Cost</th></tr></thead>
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

        <div class="entropy-cost-header">Bit Cost Breakdown <span class="entropy-cost-hint">(click to expand)</span></div>
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
    `;
}
