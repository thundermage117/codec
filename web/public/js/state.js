export const ViewMode = {
    RGB: 0,
    Artifacts: 1,
    Y: 2,
    Cr: 3,
    Cb: 4
};

export const state = {
    originalImageData: null,
    imgWidth: 0,
    imgHeight: 0,
    currentViewMode: ViewMode.RGB,
    currentCsMode: 444, // 4:4:4
    maxDim: 1024,
    wasmReady: false,
    isInspectMode: false,
    highlightBlock: null,
    inspectedBlock: null, // { x, y } of currently inspected block
    isDragging: false
};
