import { hideTooltip } from './tooltip.js';
import { computeBasisPattern, getFreqLabel } from './dct-utils.js';

interface CachedGridData {
    dctData?: Float64Array;
    qtData?: Float64Array;
    quantData?: Float64Array;
    dequantizedData?: Float64Array;
}

let cachedGridData: CachedGridData = {};
let basisPopoverVisible = false;

export function setCachedGridData(data: CachedGridData): void {
    cachedGridData = data;
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

function positionPopover(popover: HTMLElement, e: MouseEvent): void {
    const margin = 16;
    const popW = 260;
    const popH = 240;

    let x = e.clientX + margin;
    let y = e.clientY - popH / 2;

    if (x + popW > window.innerWidth - margin) {
        x = e.clientX - popW - margin;
    }
    if (x < margin) x = margin;
    if (x + popW > window.innerWidth - margin) x = window.innerWidth - popW - margin;

    if (y < margin) y = margin;
    if (y + popH > window.innerHeight - margin) y = window.innerHeight - popH - margin;

    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
}

export function showBasisPopover(e: MouseEvent, row: number, col: number): void {
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

export function hideBasisPopover(): void {
    const popover = document.getElementById('basisPopover');
    if (popover) {
        popover.classList.remove('visible');
        setTimeout(() => {
            if (!basisPopoverVisible) popover.style.display = 'none';
        }, 150);
    }
    basisPopoverVisible = false;
}
