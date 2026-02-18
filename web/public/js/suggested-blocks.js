/**
 * Suggested Blocks: Auto-detect interesting 8×8 blocks for guided exploration.
 * Scores blocks by edge content, texture complexity, reconstruction error, and smoothness.
 * Uses only pixel data already in memory — no WASM calls.
 */

import { state } from './state.js';

/**
 * Compute suggested blocks from the loaded image data.
 * Reads state.originalImageData and the processedCanvas for error scoring.
 * Stores results in state.suggestedBlocks.
 */
export function computeSuggestedBlocks() {
    if (!state.originalImageData) {
        state.suggestedBlocks = [];
        return;
    }

    const w = state.imgWidth;
    const h = state.imgHeight;
    const blocksX = Math.floor(w / 8);
    const blocksY = Math.floor(h / 8);
    const totalBlocks = blocksX * blocksY;

    if (totalBlocks === 0) {
        state.suggestedBlocks = [];
        return;
    }

    const origData = state.originalImageData.data; // RGBA Uint8ClampedArray

    // Get reconstructed data from processedCanvas
    let reconData = null;
    try {
        const processedCanvas = document.getElementById('processedCanvas');
        if (processedCanvas) {
            const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
            const imgData = ctx.getImageData(0, 0, w, h);
            reconData = imgData.data;
        }
    } catch (e) {
        // If we can't read the canvas, skip error scoring
    }

    // Sampling: pick ~200 candidate blocks (sparse grid)
    const maxCandidates = 200;
    const step = Math.max(1, Math.floor(totalBlocks / maxCandidates));

    const candidates = [];

    for (let idx = 0; idx < totalBlocks; idx += step) {
        const bx = idx % blocksX;
        const by = Math.floor(idx / blocksX);

        const scores = scoreBlock(origData, reconData, bx, by, w, h);
        candidates.push({
            x: bx,
            y: by,
            ...scores
        });
    }

    const topN = 2;
    const sorted = (arr, key) => [...arr].sort((a, b) => b[key] - a[key]);

    const results = [];
    const seen = new Set();

    const categories = [
        { key: 'edge', label: 'Edge', icon: '🔷' },
        { key: 'texture', label: 'Texture', icon: '🔶' },
        { key: 'smooth', label: 'Smooth', icon: '🟢' }
    ];

    for (const cat of categories) {
        const sortedCandidates = sorted(candidates, cat.key);
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

    state.suggestedBlocks = results;
}

/**
 * Score a single 8×8 block on multiple dimensions.
 */
function scoreBlock(origData, reconData, bx, by, imgW, imgH) {
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
            // Luminance approximation from RGB
            const lum = origData[idx] * 0.299 + origData[idx + 1] * 0.587 + origData[idx + 2] * 0.114;
            sumLum += lum;
            sumLum2 += lum * lum;
            count++;

            // Edge detection: simple gradient magnitude (horizontal + vertical)
            if (dx < 7 && dy < 7) {
                const idxR = (y * imgW + (x + 1)) * 4;
                const idxD = ((y + 1) * imgW + x) * 4;
                const lumR = origData[idxR] * 0.299 + origData[idxR + 1] * 0.587 + origData[idxR + 2] * 0.114;
                const lumD = origData[idxD] * 0.299 + origData[idxD + 1] * 0.587 + origData[idxD + 2] * 0.114;
                const gx = Math.abs(lumR - lum);
                const gy = Math.abs(lumD - lum);
                edgeSum += gx + gy;
            }

            // Error scoring: MSE between original and reconstructed
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
        texture: variance, // high variance = complex texture
        smooth: 1 / (1 + variance), // inverse variance = smooth
        error: errorSum / count
    };
}

/**
 * Render a small 8×8 thumbnail canvas for a block.
 */
function renderBlockThumbnail(canvas, bx, by) {
    if (!canvas || !state.originalImageData) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 8;
    canvas.height = 8;

    const origData = state.originalImageData.data;
    const w = state.imgWidth;
    const imgData = ctx.createImageData(8, 8);

    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            const srcX = bx * 8 + dx;
            const srcY = by * 8 + dy;
            const srcIdx = (srcY * w + srcX) * 4;
            const destIdx = (dy * 8 + dx) * 4;

            if (srcX < w && srcY < state.imgHeight) {
                imgData.data[destIdx] = origData[srcIdx];
                imgData.data[destIdx + 1] = origData[srcIdx + 1];
                imgData.data[destIdx + 2] = origData[srcIdx + 2];
                imgData.data[destIdx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

/**
 * Render suggested blocks as clickable buttons in the sidebar, grouped by category.
 * @param {string} containerId - ID of the container element
 * @param {function} onSelect - Callback: (blockX, blockY) => void
 */
export function renderSuggestedBlocks(containerId, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (state.suggestedBlocks.length === 0) {
        container.innerHTML = '<div class="suggested-blocks-empty">No suggestions available</div>';
        return;
    }

    // Group by category
    const categoryOrder = ['edge', 'texture', 'smooth'];
    const categoryLabels = {
        edge: '🔷 Edges',
        texture: '🔶 Textures',
        smooth: '🟢 Smooth'
    };

    const grouped = {};
    state.suggestedBlocks.forEach(block => {
        if (!grouped[block.category]) grouped[block.category] = [];
        grouped[block.category].push(block);
    });

    categoryOrder.forEach(cat => {
        const blocks = grouped[cat];
        if (!blocks || blocks.length === 0) return;

        // Category header
        const header = document.createElement('div');
        header.className = 'suggested-category-header';
        header.textContent = categoryLabels[cat] || cat;
        container.appendChild(header);

        blocks.forEach(block => {
            const btn = document.createElement('button');
            btn.className = 'suggested-block-btn';
            btn.dataset.bx = block.x;
            btn.dataset.by = block.y;

            // Score color
            let scoreColor = 'var(--primary)';
            if (block.category === 'edge') scoreColor = '#3b82f6';
            else if (block.category === 'texture') scoreColor = '#f59e0b';
            else if (block.category === 'smooth') scoreColor = '#10b981';

            // Create thumbnail canvas
            const thumb = document.createElement('canvas');
            thumb.className = 'suggested-block-thumb';
            thumb.width = 8;
            thumb.height = 8;

            btn.innerHTML = `
                <div class="suggested-block-icon" style="color: ${scoreColor}">${block.icon}</div>
                <div class="suggested-block-info">
                    <span class="suggested-block-label">${block.label}</span>
                    <span class="suggested-block-coords">(${block.x}, ${block.y})</span>
                </div>
            `;

            // Insert thumbnail before the info div
            const icon = btn.querySelector('.suggested-block-icon');
            if (icon) {
                icon.insertAdjacentElement('afterend', thumb);
            }

            // Render the thumbnail
            renderBlockThumbnail(thumb, block.x, block.y);

            btn.addEventListener('click', () => {
                container.querySelectorAll('.suggested-block-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                onSelect(block.x, block.y);
            });

            container.appendChild(btn);
        });
    });
}
