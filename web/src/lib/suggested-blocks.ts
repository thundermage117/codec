/**
 * Suggested Blocks: Auto-detect interesting 8×8 blocks for guided exploration.
 * Scores blocks by edge content, texture complexity, reconstruction error, and smoothness.
 */

import { appState } from './state.svelte.js';
import type { SuggestedBlock } from './state.svelte.js';

/**
 * Compute suggested blocks from the loaded image data.
 * Reads appState.originalImageData and the processedCanvas for error scoring.
 * Stores results in appState.suggestedBlocks.
 */
export function computeSuggestedBlocks(processedCanvas?: HTMLCanvasElement | null): void {
    if (!appState.originalImageData) {
        appState.suggestedBlocks = [];
        return;
    }

    const w = appState.imgWidth;
    const h = appState.imgHeight;
    const blocksX = Math.floor(w / 8);
    const blocksY = Math.floor(h / 8);
    const totalBlocks = blocksX * blocksY;

    if (totalBlocks === 0) {
        appState.suggestedBlocks = [];
        return;
    }

    const origData = appState.originalImageData.data;

    // Get reconstructed data from processedCanvas
    let reconData: Uint8ClampedArray | null = null;
    try {
        const canvas = processedCanvas ?? (document.getElementById('processedCanvas') as HTMLCanvasElement | null);
        if (canvas) {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                const imgData = ctx.getImageData(0, 0, w, h);
                reconData = imgData.data;
            }
        }
    } catch {
        // If we can't read the canvas, skip error scoring
    }

    const maxCandidates = 200;
    const step = Math.max(1, Math.floor(totalBlocks / maxCandidates));

    const candidates: Array<{ x: number; y: number; edge: number; texture: number; smooth: number; error: number }> = [];

    for (let idx = 0; idx < totalBlocks; idx += step) {
        const bx = idx % blocksX;
        const by = Math.floor(idx / blocksX);
        const scores = scoreBlock(origData, reconData, bx, by, w, h);
        candidates.push({ x: bx, y: by, ...scores });
    }

    const topN = 2;
    const sortedBy = <T extends object>(arr: T[], key: keyof T) => [...arr].sort((a, b) => (b[key] as number) - (a[key] as number));

    const results: SuggestedBlock[] = [];
    const seen = new Set<string>();

    const categories: Array<{ key: 'edge' | 'texture' | 'smooth'; label: string; icon: string }> = [
        { key: 'edge', label: 'Edge', icon: '🔷' },
        { key: 'texture', label: 'Texture', icon: '🔶' },
        { key: 'smooth', label: 'Smooth', icon: '🟢' }
    ];

    for (const cat of categories) {
        const sortedCandidates = sortedBy(candidates, cat.key);
        let count = 0;
        for (const b of sortedCandidates) {
            if (count >= topN) break;
            const key = `${b.x},${b.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push({
                    x: b.x,
                    y: b.y,
                    label: cat.label,
                    icon: cat.icon,
                    score: b[cat.key],
                    category: cat.key
                });
                count++;
            }
        }
    }

    appState.suggestedBlocks = results;
}

function scoreBlock(
    origData: Uint8ClampedArray,
    reconData: Uint8ClampedArray | null,
    bx: number,
    by: number,
    imgW: number,
    imgH: number
) {
    const px0 = bx * 8;
    const py0 = by * 8;

    let sumLum = 0;
    let sumLum2 = 0;
    let edgeSum = 0;
    let errorSum = 0;
    let count = 0;

    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            const x = px0 + dx;
            const y = py0 + dy;
            if (x >= imgW || y >= imgH) continue;

            const idx = (y * imgW + x) * 4;
            const lum = origData[idx] * 0.299 + origData[idx + 1] * 0.587 + origData[idx + 2] * 0.114;
            sumLum += lum;
            sumLum2 += lum * lum;
            count++;

            if (dx < 7 && dy < 7) {
                const idxR = (y * imgW + (x + 1)) * 4;
                const idxD = ((y + 1) * imgW + x) * 4;
                const lumR = origData[idxR] * 0.299 + origData[idxR + 1] * 0.587 + origData[idxR + 2] * 0.114;
                const lumD = origData[idxD] * 0.299 + origData[idxD + 1] * 0.587 + origData[idxD + 2] * 0.114;
                edgeSum += Math.abs(lumR - lum) + Math.abs(lumD - lum);
            }

            if (reconData) {
                const dr = origData[idx] - reconData[idx];
                const dg = origData[idx + 1] - reconData[idx + 1];
                const db = origData[idx + 2] - reconData[idx + 2];
                errorSum += (dr * dr + dg * dg + db * db) / 3;
            }
        }
    }

    if (count === 0) return { edge: 0, texture: 0, smooth: 0, error: 0 };

    const mean = sumLum / count;
    const variance = (sumLum2 / count) - (mean * mean);

    return {
        edge: edgeSum,
        texture: variance,
        smooth: 1 / (1 + variance),
        error: errorSum / count
    };
}

/**
 * Render a small 8×8 thumbnail onto a canvas element.
 */
export function renderBlockThumbnail(canvas: HTMLCanvasElement, bx: number, by: number): void {
    if (!canvas || !appState.originalImageData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 8;
    canvas.height = 8;

    const origData = appState.originalImageData.data;
    const w = appState.imgWidth;
    const imgData = ctx.createImageData(8, 8);

    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            const srcX = bx * 8 + dx;
            const srcY = by * 8 + dy;
            const srcIdx = (srcY * w + srcX) * 4;
            const destIdx = (dy * 8 + dx) * 4;

            if (srcX < w && srcY < appState.imgHeight) {
                imgData.data[destIdx] = origData[srcIdx];
                imgData.data[destIdx + 1] = origData[srcIdx + 1];
                imgData.data[destIdx + 2] = origData[srcIdx + 2];
                imgData.data[destIdx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
}
