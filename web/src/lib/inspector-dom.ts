// Element IDs that the Block Inspector's imperative code (inspection.ts,
// grid-renderer.ts, basis-popover.ts) looks up in InspectorMode.svelte.
//
// Those lookups skip missing elements silently, so a renamed or removed
// element would just stop updating with no error. Always refer to these IDs
// through INSPECTOR_IDS (never a string literal): tests/unit/inspector-dom.test.js
// checks that every one is rendered by a component, and that lib code doesn't
// look up IDs that bypass this list.
//
// To add an element the TS code updates: give it an id in the markup and add
// it here.

export const INSPECTOR_IDS = {
    // Top bar and block header
    blockCoords: 'blockCoords',
    qTableType: 'qTableType',

    // Pipeline grids
    gridOriginal: 'gridOriginal',
    gridDCT: 'gridDCT',
    gridQuantized: 'gridQuantized',
    gridDequantized: 'gridDequantized',
    gridReconstructed: 'gridReconstructed',
    gridError: 'gridError',
    gridQuantTable: 'gridQuantTable',

    // Block statistics
    statEstBits: 'statEstBits',
    statBpp: 'statBpp',
    statZeros: 'statZeros',
    statCompression: 'statCompression',
    statMSE: 'statMSE',
    statPeakError: 'statPeakError',
    lossMeterContainer: 'lossMeterContainer',

    // Reconstruction animation
    reconstructionProgress: 'reconstructionProgress',
    reconAnimBanner: 'reconAnimBanner',
    reconBasisCanvas: 'reconBasisCanvas',
    reconBannerStep: 'reconBannerStep',
    reconBannerFreq: 'reconBannerFreq',
    reconBannerCoeff: 'reconBannerCoeff',
    reconBannerDesc: 'reconBannerDesc',
    reconBannerFill: 'reconBannerFill',

    // Entropy encoding (advanced section)
    gridQuantizedAdvanced: 'gridQuantizedAdvanced',
    gridZigzag: 'gridZigzag',
    entropySummary: 'entropySummary',

    // Basis-function popover
    basisPopover: 'basisPopover',
    basisCoord: 'basisCoord',
    basisFreqLabel: 'basisFreqLabel',
    basisValue: 'basisValue',
    basisValueLabel: 'basisValueLabel',
    basisQuantized: 'basisQuantized',
    basisDivisor: 'basisDivisor',
    basisCanvas: 'basisCanvas',
    contributionCanvas: 'contributionCanvas'
} as const;

export type InspectorId = typeof INSPECTOR_IDS[keyof typeof INSPECTOR_IDS];
