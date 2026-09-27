import type { MotionVector } from './me-bridge.js';
import type { BlockVerdict } from './metrics.js';
import { heatColor } from '../colormap.js';

export interface BlockGrid {
    cols: number;
    rows: number;
    blockSize: number;
}

export interface Arrow {
    x0: number; y0: number;  // tail (block centre)
    x1: number; y1: number;  // tip
    head: [number, number, number, number];  // two barb end points: x, y, x, y
}

// Arrows show how the content moved, from the reference into the current
// frame. That is the opposite of the stored motion vector, which points from
// the current block back to its match in the reference. Arrows are centred on
// their block and multiplied by `lengthScale` (see arrowLengthScale).
export function motionArrow(col: number, row: number, blockSize: number, mv: MotionVector,
    lengthScale = 1): Arrow | null {
    const mx = -mv.dx * lengthScale;
    const my = -mv.dy * lengthScale;
    const len = Math.hypot(mx, my);
    if (len === 0) return null;
    const cx = (col + 0.5) * blockSize;
    const cy = (row + 0.5) * blockSize;
    const x0 = cx - mx / 2;
    const y0 = cy - my / 2;
    const x1 = cx + mx / 2;
    const y1 = cy + my / 2;
    const headLen = Math.min(Math.max(len * 0.28, 2), blockSize * 0.3);
    const angle = Math.atan2(my, mx);
    const spread = Math.PI / 7;
    return {
        x0, y0, x1, y1,
        head: [
            x1 - headLen * Math.cos(angle - spread), y1 - headLen * Math.sin(angle - spread),
            x1 - headLen * Math.cos(angle + spread), y1 - headLen * Math.sin(angle + spread),
        ],
    };
}

// One factor for the whole field so relative lengths stay true: the longest
// arrow spans ~85% of a block. Never shrinks, and at most 4x.
export function arrowLengthScale(blockSize: number, maxLength: number): number {
    if (!(maxLength > 0)) return 1;
    return Math.min(4, Math.max(1, (0.85 * blockSize) / maxLength));
}

// Direction -> hue (the colour wheel in the legend), length -> lightness.
export function motionColor(mv: MotionVector, maxLength: number): string {
    const mx = -mv.dx;
    const my = -mv.dy;
    const hue = ((Math.atan2(my, mx) * 180) / Math.PI + 360) % 360;
    const t = maxLength > 0 ? Math.min(Math.hypot(mx, my) / maxLength, 1) : 0;
    return `hsl(${hue.toFixed(0)}, 90%, ${(70 - 20 * t).toFixed(0)}%)`;
}

export const VERDICT_COLORS: Record<BlockVerdict, string> = {
    exact: 'rgba(34, 197, 94, 0.35)',
    close: 'rgba(245, 158, 11, 0.4)',
    wrong: 'rgba(239, 68, 68, 0.45)',
    excluded: 'rgba(148, 163, 184, 0.25)',
};

// Canvas drawing in image-pixel units; `scale` maps image px -> canvas px.

export function drawVectorField(ctx: CanvasRenderingContext2D, grid: BlockGrid,
    mvs: MotionVector[], scale: number, maxLength: number): void {
    const lengthScale = arrowLengthScale(grid.blockSize, maxLength);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            const mv = mvs[row * grid.cols + col];
            if (!mv) continue;
            const arrow = motionArrow(col, row, grid.blockSize, mv, lengthScale);
            const colour = motionColor(mv, maxLength);
            if (!arrow) {
                // Zero vector: small dot so still blocks are visible but quiet.
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.beginPath();
                ctx.arc((col + 0.5) * grid.blockSize * scale, (row + 0.5) * grid.blockSize * scale,
                    Math.max(1, scale), 0, Math.PI * 2);
                ctx.fill();
                continue;
            }
            const path = () => {
                ctx.beginPath();
                ctx.moveTo(arrow.x0 * scale, arrow.y0 * scale);
                ctx.lineTo(arrow.x1 * scale, arrow.y1 * scale);
                ctx.moveTo(arrow.head[0] * scale, arrow.head[1] * scale);
                ctx.lineTo(arrow.x1 * scale, arrow.y1 * scale);
                ctx.lineTo(arrow.head[2] * scale, arrow.head[3] * scale);
            };
            // Dark halo keeps arrows readable on bright image areas.
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 2.6 * scale;
            path();
            ctx.stroke();
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1.3 * scale;
            path();
            ctx.stroke();
        }
    }
    ctx.restore();
}

export function drawBlockFill(ctx: CanvasRenderingContext2D, grid: BlockGrid, scale: number,
    colorAt: (index: number) => string | null): void {
    const size = grid.blockSize * scale;
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            const colour = colorAt(row * grid.cols + col);
            if (!colour) continue;
            ctx.fillStyle = colour;
            ctx.fillRect(col * size, row * size, size, size);
        }
    }
}

// Per-block match cost (mean absolute difference per pixel) as a heatmap.
export function sadHeatColor(mv: MotionVector, blockSize: number, maxMad: number): string {
    const mad = mv.sad / (blockSize * blockSize);
    const [r, g, b] = heatColor(maxMad > 0 ? mad / maxMad : 0);
    return `rgba(${r}, ${g}, ${b}, 0.6)`;
}

export function drawBlockOutline(ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
    scale: number, colour: string, dashed = false): void {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2 * scale;
    if (dashed) ctx.setLineDash([4 * scale, 3 * scale]);
    ctx.strokeRect(x * scale, y * scale, size * scale, size * scale);
    ctx.restore();
}
