let tooltipEl: HTMLDivElement | null = null;

function ensureTooltip(): HTMLDivElement {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'grid-cell-tooltip';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

export function showTooltip(e: MouseEvent, value: number | string, row: number | string, col: number | string, desc: string): void {
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

export function hideTooltip(): void {
    if (tooltipEl) tooltipEl.classList.remove('visible');
}
