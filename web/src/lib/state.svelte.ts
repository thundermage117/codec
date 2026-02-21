export const ViewMode = {
    RGB: 0,
    Artifacts: 1,
    Y: 2,
    Cr: 3,
    Cb: 4,
    EdgeDistortion: 5,
    BlockingMap: 6
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

    // Transform type: 0 = DCT, 1 = DWT (Haar wavelet)
    transformType = $state(0);

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
}

export const appState = new AppState();
