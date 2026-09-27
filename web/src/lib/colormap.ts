// Viridis-style colormap matching the heatmap legend gradient in
// styles/mode-page.css (.heatmap-scale-bar): black -> viridis -> white.
const STOPS: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0, 0],
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
    [255, 255, 255],
];

// t in [0, 1] (clamped) -> [r, g, b] in 0..255.
export function heatColor(t: number): [number, number, number] {
    const x = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), 1) * (STOPS.length - 1);
    const i = Math.min(Math.floor(x), STOPS.length - 2);
    const f = x - i;
    const a = STOPS[i];
    const b = STOPS[i + 1];
    return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
    ];
}
