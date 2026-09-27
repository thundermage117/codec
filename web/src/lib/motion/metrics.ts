import type { MotionVector } from './me-bridge.js';
import type { BlockTruth } from './synthetic.js';

// How an estimated vector compares with the ground truth.
//   exact:    equals the truth rounded to whole pixels (best an integer search can do)
//   close:    within 1 px of the truth in both components
//   wrong:    anything else
//   excluded: no reliable truth for this block (see BlockTruth)
export type BlockVerdict = 'exact' | 'close' | 'wrong' | 'excluded';

export interface AccuracySummary {
    scored: number;
    excluded: number;
    exact: number;
    close: number;
    wrong: number;
    exactPercent: number;
    meanEndpointError: number;  // mean Euclidean distance to the (unrounded) truth, px
}

export function blockVerdict(mv: MotionVector, truth: BlockTruth): BlockVerdict {
    if (truth.excluded) return 'excluded';
    if (mv.dx === Math.round(truth.dx) && mv.dy === Math.round(truth.dy)) return 'exact';
    if (Math.abs(mv.dx - truth.dx) <= 1 && Math.abs(mv.dy - truth.dy) <= 1) return 'close';
    return 'wrong';
}

export function summarizeAccuracy(mvs: MotionVector[], truths: BlockTruth[]): AccuracySummary {
    const summary: AccuracySummary = {
        scored: 0, excluded: 0, exact: 0, close: 0, wrong: 0, exactPercent: 0, meanEndpointError: 0,
    };
    let epeSum = 0;
    const n = Math.min(mvs.length, truths.length);
    for (let i = 0; i < n; i++) {
        const truth = truths[i];
        const verdict = blockVerdict(mvs[i], truth);
        if (verdict === 'excluded' || truth.excluded) {
            summary.excluded++;
            continue;
        }
        summary.scored++;
        summary[verdict]++;
        epeSum += Math.hypot(mvs[i].dx - truth.dx, mvs[i].dy - truth.dy);
    }
    if (summary.scored > 0) {
        summary.exactPercent = (summary.exact / summary.scored) * 100;
        summary.meanEndpointError = epeSum / summary.scored;
    }
    return summary;
}

// Share of the frame-difference error that motion compensation removes, in %.
export function compensationGain(meanAbsResidual: number, meanAbsFrameDiff: number): number {
    if (!(meanAbsFrameDiff > 0)) return 0;
    return Math.max(0, (1 - meanAbsResidual / meanAbsFrameDiff) * 100);
}
