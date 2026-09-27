import { defaultScenario, type Scenario, type FramePair, type BlockTruth } from './synthetic.js';
import { SearchAlgorithm, type SearchAlgorithmValue, type MotionVector, type MotionStats } from './me-bridge.js';
import type { AccuracySummary } from './metrics.js';
import type { BlockGrid } from './mv-render.js';

export type MotionViewKind = 'reference' | 'current' | 'prediction' | 'residual' | 'difference';

export interface MotionRun {
    algorithm: SearchAlgorithmValue;
    searchRange: number;
    grid: BlockGrid;
    mvs: MotionVector[];
    truths: BlockTruth[];
    stats: MotionStats;
    accuracy: AccuracySummary;
    elapsedMs: number;
}

export interface AlgorithmComparisonRow {
    algorithm: SearchAlgorithmValue;
    elapsedMs: number;
    candidates: number;
    exactPercent: number;
    meanEndpointError: number;
    meanAbsResidual: number;
}

// State for the Motion Explorer mode, kept separate from the global appState.
class MotionState {
    scenario = $state<Scenario>(defaultScenario('pan'));
    blockSize = $state(16);
    searchRange = $state(16);
    algorithm = $state<SearchAlgorithmValue>(SearchAlgorithm.Full);

    view = $state<MotionViewKind>('residual');
    compareWithCurrent = $state(false);

    showVectors = $state(true);
    showCost = $state(false);
    showAccuracy = $state(false);
    showGrid = $state(false);

    // Large, replaced wholesale: keep them raw (no deep proxies).
    frames = $state.raw<FramePair | null>(null);
    run = $state.raw<MotionRun | null>(null);
    comparison = $state.raw<AlgorithmComparisonRow[] | null>(null);

    computing = $state(false);
    comparing = $state(false);
    error = $state('');

    selectedBlock = $state<{ col: number; row: number } | null>(null);

    reset(): void {
        this.frames = null;
        this.run = null;
        this.comparison = null;
        this.selectedBlock = null;
        this.error = '';
    }
}

export const motionState = new MotionState();
