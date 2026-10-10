import { Transform, type TransformValue } from './transforms.js';

export const ViewMode = {
    RGB: 0,
    Artifacts: 1,
    Y: 2,
    Cr: 3,
    Cb: 4,
    EdgeDistortion: 5,
    BlockingMap: 6,
    Subbands: 7
} as const;

export type ViewModeValue = typeof ViewMode[keyof typeof ViewMode];

export interface SuggestedBlock {
    x: number;
    y: number;
    label: string;
    icon: string;
    score: number;
    category: string;
}

export interface FileSizeInfo {
    original: string;
    estimated: string;
    reduction: number;
    ratio: string;
    fillPercent: number;
}

class AppState {
    originalImageData = $state<ImageData | null>(null);
    imgWidth = $state(0);
    imgHeight = $state(0);
    currentViewMode = $state<ViewModeValue>(0);
    currentCsMode = $state<number>(444);
    maxDim = $state(1024);
    wasmReady = $state(false);
    isInspectMode = $state(false);
    highlightBlock = $state<{ x: number; y: number } | null>(null);
    inspectedBlock = $state<{ x: number; y: number } | null>(null);
    isDragging = $state(false);
    appMode = $state<'viewer' | 'inspector' | 'artifact_inspector'>('viewer');
    suggestedBlocks = $state<SuggestedBlock[]>([]);

    // Shared quality (synced between viewer and inspector sliders)
    quality = $state(50);

    // Transform type: see Transform in transforms.ts (DCT, Haar, CDF 9/7)
    transformType = $state<TransformValue>(Transform.DCT);

    // Index of the bundled test image currently loaded (null for uploads)
    activeTestImage = $state<number | null>(null);

    // Render stats
    psnr = $state({ y: 0, cr: 0, cb: 0 });
    ssim = $state({ y: 0, cr: 0, cb: 0 });

    // Tint toggle
    tintEnabled = $state(true);

    // Status message
    status = $state('Initializing...');

    // Comparison slider
    comparisonPercent = $state(50);

    // File size display
    fileSizeInfo = $state<FileSizeInfo | null>(null);

    // Where Back / Escape in the block inspector should return to, when it was
    // opened from another mode (e.g. clicking a block in the artifact map).
    inspectorReturn = $state<{ mode: 'artifact_inspector'; viewMode: ViewModeValue } | null>(null);
}

export const appState = new AppState();

/** Back / Escape: leave the current full-page mode. */
export function leaveCurrentMode(): void {
    const ret = appState.appMode === 'inspector' ? appState.inspectorReturn : null;
    appState.inspectorReturn = null;
    appState.isInspectMode = false;
    appState.highlightBlock = null;
    if (ret) {
        appState.appMode = ret.mode;
        appState.currentViewMode = ret.viewMode;
    } else {
        appState.appMode = 'viewer';
        appState.currentViewMode = ViewMode.RGB;
    }
}

/** Opens the block inspector on one block, remembering how to get back. */
export function openBlockInspector(block: { x: number; y: number }, returnTo: AppState['inspectorReturn'] = null): void {
    appState.inspectorReturn = returnTo;
    appState.inspectedBlock = { ...block };
    appState.isInspectMode = true;
    appState.appMode = 'inspector';
}
