import { renderPair, blockTruth, type Scenario, type FramePair, type BlockTruth } from './synthetic.js';
import {
    initMotionSession, runMotionEstimation, getMotionStats,
    SearchAlgorithm, type SearchAlgorithmValue,
} from './me-bridge.js';
import { summarizeAccuracy } from './metrics.js';
import type { MotionRun, AlgorithmComparisonRow } from './motion-state.svelte.js';
import type { BlockGrid } from './mv-render.js';

export interface SearchParams {
    blockSize: number;
    searchRange: number;
    algorithm: SearchAlgorithmValue;
}

// Builds the frame pair for a scenario and loads it into the estimator.
export function prepareFrames(image: ImageData, scenario: Scenario): FramePair | null {
    const frames = renderPair(image, scenario);
    return initMotionSession(frames.reference, frames.current) ? frames : null;
}

export function groundTruth(scenario: Scenario, grid: BlockGrid, width: number, height: number,
    searchRange: number): BlockTruth[] {
    const truths: BlockTruth[] = [];
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            truths.push(blockTruth(scenario, width, height, col * grid.blockSize, row * grid.blockSize,
                grid.blockSize, searchRange));
        }
    }
    return truths;
}

// Runs one search on the loaded frames and scores it against the truth.
export function runSearch(frames: FramePair, scenario: Scenario, params: SearchParams): MotionRun | null {
    const t0 = performance.now();
    const mvs = runMotionEstimation(params.blockSize, params.searchRange, params.algorithm);
    const elapsedMs = performance.now() - t0;
    if (!mvs) return null;

    const { width, height } = frames.current;
    const grid: BlockGrid = {
        cols: Math.floor(width / params.blockSize),
        rows: Math.floor(height / params.blockSize),
        blockSize: params.blockSize,
    };
    const truths = groundTruth(scenario, grid, width, height, params.searchRange);
    return {
        algorithm: params.algorithm,
        searchRange: params.searchRange,
        grid,
        mvs,
        truths,
        stats: getMotionStats(),
        accuracy: summarizeAccuracy(mvs, truths),
        elapsedMs,
    };
}

// Runs every algorithm with the same block size and range, then re-runs the
// selected one so the estimator's stored result matches the UI again.
export function compareAlgorithms(frames: FramePair, scenario: Scenario,
    params: SearchParams): AlgorithmComparisonRow[] {
    const rows: AlgorithmComparisonRow[] = [];
    for (const algorithm of [SearchAlgorithm.Full, SearchAlgorithm.ThreeStep, SearchAlgorithm.Diamond]) {
        const run = runSearch(frames, scenario, { ...params, algorithm });
        if (!run) continue;
        rows.push({
            algorithm,
            elapsedMs: run.elapsedMs,
            candidates: run.stats.candidates,
            exactPercent: run.accuracy.exactPercent,
            meanEndpointError: run.accuracy.meanEndpointError,
            meanAbsResidual: run.stats.meanAbsResidual,
        });
    }
    runMotionEstimation(params.blockSize, params.searchRange, params.algorithm);
    return rows;
}

export const ALGORITHM_LABELS: Record<SearchAlgorithmValue, string> = {
    [SearchAlgorithm.Full]: 'Full search',
    [SearchAlgorithm.ThreeStep]: 'Three-step',
    [SearchAlgorithm.Diamond]: 'Diamond',
};
