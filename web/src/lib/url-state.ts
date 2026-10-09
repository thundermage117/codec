import { appState, ViewMode, type ViewModeValue } from './state.svelte.js';
import { TRANSFORMS, type TransformValue } from './transforms.js';

// Codec settings that round-trip through the URL hash, e.g.
//   #q=30&t=cdf97&cs=420&v=subbands&img=3
// so a configuration can be bookmarked or shared.
export interface UrlState {
    quality?: number;
    transformType?: TransformValue;
    csMode?: number;
    viewMode?: ViewModeValue;
    /** Index of a bundled test image (user-uploaded images can't be shared). */
    testImage?: number;
}

const VIEW_SLUGS: Record<string, ViewModeValue> = {
    rgb: ViewMode.RGB,
    error: ViewMode.Artifacts,
    y: ViewMode.Y,
    cr: ViewMode.Cr,
    cb: ViewMode.Cb,
    subbands: ViewMode.Subbands
};

const CS_MODES = [444, 422, 420];

function parseIntInRange(raw: string | null, min: number, max: number): number | undefined {
    if (raw === null || !/^\d+$/.test(raw)) return undefined;
    const n = Number(raw);
    return n >= min && n <= max ? n : undefined;
}

export function parseUrlState(hash: string): UrlState {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const state: UrlState = {};

    const q = parseIntInRange(params.get('q'), 1, 100);
    if (q !== undefined) state.quality = q;

    const t = TRANSFORMS.find(info => info.slug === params.get('t'));
    if (t) state.transformType = t.value;

    const cs = parseIntInRange(params.get('cs'), 0, 999);
    if (cs !== undefined && CS_MODES.includes(cs)) state.csMode = cs;

    const v = params.get('v');
    if (v !== null && v in VIEW_SLUGS) state.viewMode = VIEW_SLUGS[v];

    const img = parseIntInRange(params.get('img'), 0, 999);
    if (img !== undefined) state.testImage = img;

    return state;
}

export function serializeUrlState(state: UrlState): string {
    const params = new URLSearchParams();
    if (state.quality !== undefined) params.set('q', String(state.quality));
    const t = TRANSFORMS.find(info => info.value === state.transformType);
    if (t) params.set('t', t.slug);
    if (state.csMode !== undefined) params.set('cs', String(state.csMode));
    const v = Object.keys(VIEW_SLUGS).find(slug => VIEW_SLUGS[slug] === state.viewMode);
    if (v) params.set('v', v);
    if (state.testImage !== undefined) params.set('img', String(state.testImage));
    return params.toString();
}

/** Applies codec settings from the hash to appState; returns the full parsed state. */
export function restoreFromUrl(hash: string = location.hash): UrlState {
    const state = parseUrlState(hash);
    if (state.quality !== undefined) appState.quality = state.quality;
    if (state.transformType !== undefined) appState.transformType = state.transformType;
    if (state.csMode !== undefined) appState.currentCsMode = state.csMode;
    if (state.viewMode !== undefined) appState.currentViewMode = state.viewMode;
    return state;
}

/** Replaces the hash in place (no history entry per slider tweak). */
export function writeUrlState(state: UrlState): void {
    const next = '#' + serializeUrlState(state);
    if (location.hash === next) return;
    history.replaceState(history.state, '', next);
}
