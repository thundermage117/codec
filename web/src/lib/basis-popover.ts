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

export function getCachedGridData(): CachedGridData {
    return cachedGridData;
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

let animationId: number | null = null;
let originalColors: string[] = [];
let currentTargetGridId: string | null = null;

export function startBasisAnimation(row: number, col: number, targetGridId: string = 'gridOriginal'): void {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
        restoreOriginalColors();
    }

    if (!targetGridId) targetGridId = 'gridOriginal';
    currentTargetGridId = targetGridId;

    const targetGrid = document.getElementById(targetGridId);
    if (!targetGrid) return;

    const cells = Array.from(targetGrid.querySelectorAll('.grid-cell')) as HTMLElement[];
    if (cells.length !== 64) return;

    // Save original colors
    originalColors = cells.map(c => c.style.backgroundColor);

    const basisPattern = computeBasisPattern(col, row);
    const startTime = performance.now();
    const duration = 2000; // 2 seconds

    function frame(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Multiplier for the wave intensity: ramps up then down
        const intensity = Math.sin(progress * Math.PI) * 0.9;

        for (let i = 0; i < 64; i++) {
            const val = basisPattern[i];
            const cell = cells[i];

            // Draw the basis pattern as an overlay
            // val is -0.125 to 0.125 roughly. 
            // We want red for positive, blue for negative.
            const t = val * 8; // Normalize to ~ -1 to 1
            let overlayR = 0, overlayG = 0, overlayB = 0;
            if (t > 0) {
                overlayR = 255; overlayG = 50; overlayB = 50;
            } else {
                overlayR = 50; overlayG = 50; overlayB = 255;
            }

            const alpha = Math.abs(t) * intensity * 0.8;
            cell.style.backgroundColor = `rgba(${overlayR}, ${overlayG}, ${overlayB}, ${alpha})`;

            // Blend with original? Actually, let's just use semi-transparent overlay on top
            // But since background-color doesn't stack, we can manually blend or use a pseudoelement.
            // Simplified: we'll set background to a composite color.
            // For now, let's try just setting it and see how it looks.
            // If we want it to look "laid over", we should probably use a separate layer or just blend.

            // To blend: parse original color.
            const orig = originalColors[i]; // e.g. "rgb(200, 200, 200)"
            const rgb = orig.match(/\d+/g)?.map(Number) || [255, 255, 255];

            const r = Math.round(rgb[0] * (1 - alpha) + overlayR * alpha);
            const g = Math.round(rgb[1] * (1 - alpha) + overlayG * alpha);
            const b = Math.round(rgb[2] * (1 - alpha) + overlayB * alpha);

            cell.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        }

        if (progress < 1) {
            animationId = requestAnimationFrame(frame);
        } else {
            animationId = null;
            restoreOriginalColors();
        }
    }

    animationId = requestAnimationFrame(frame);
}

function restoreOriginalColors() {
    if (!currentTargetGridId) return;
    const targetGrid = document.getElementById(currentTargetGridId);
    if (!targetGrid) return;
    const cells = Array.from(targetGrid.querySelectorAll('.grid-cell')) as HTMLElement[];
    cells.forEach((cell, i) => {
        if (originalColors[i]) {
            cell.style.backgroundColor = originalColors[i];
        }
    });

    // Also clear title if we set it (actually we should move title to popover)
    currentTargetGridId = null;
    originalColors = [];
}

if (typeof window !== 'undefined') {
    window.addEventListener('animate-basis', (e: any) => {
        const { row, col, targetGridId } = e.detail;
        startBasisAnimation(row, col, targetGridId);
    });
}
