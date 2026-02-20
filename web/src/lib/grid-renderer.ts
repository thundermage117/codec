import { showTooltip, hideTooltip } from './tooltip.js';
import { showBasisPopover, hideBasisPopover } from './basis-popover.js';

const ALL_GRID_IDS = [
    'gridOriginal', 'gridDCT', 'gridQuantized', 'gridQuantized2',
    'gridDequantized', 'gridReconstructed',
    'gridQuantTable', 'gridError'
];

let lastHighlightedKey: string | null = null;

export function clearAllHighlights(): void {
    lastHighlightedKey = null;
    document.querySelectorAll('.grid-cell.cell-highlight').forEach(c => {
        c.classList.remove('cell-highlight');
    });
}

export function highlightAcrossGrids(row: number, col: number): void {
    clearAllHighlights();
    ALL_GRID_IDS.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const idx = row * 8 + col;
        const cell = grid.children[idx] as HTMLElement | undefined;
        if (cell) cell.classList.add('cell-highlight');
    });
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

        cell.innerText = (isRGB && type === 'intensity') ? '' : displayVal;
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
