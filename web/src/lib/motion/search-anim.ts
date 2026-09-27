import type { SearchCandidate } from './me-bridge.js';

// Precomputed playback data for one block's search trace.
export interface SearchAnimation {
    trace: SearchCandidate[];
    // Index into trace of the best candidate after each step (inclusive).
    bestAt: number[];
    iterations: number;  // number of distinct iteration values
}

// Same preference as the C++ search: lower SAD, ties to the shorter vector.
function better(a: SearchCandidate, b: SearchCandidate): boolean {
    if (a.sad !== b.sad) return a.sad < b.sad;
    return a.dx * a.dx + a.dy * a.dy < b.dx * b.dx + b.dy * b.dy;
}

export function buildAnimation(trace: SearchCandidate[]): SearchAnimation {
    const bestAt: number[] = [];
    let best = -1;
    const iterations = new Set<number>();
    trace.forEach((c, i) => {
        if (best < 0 || better(c, trace[best])) best = i;
        bestAt.push(best);
        iterations.add(c.iteration);
    });
    return { trace, bestAt, iterations: iterations.size };
}

// Playback speed so the whole search takes about `targetSeconds`, never
// slower than `minPerSecond` steps per second.
export function stepsPerSecond(stepCount: number, targetSeconds = 4, minPerSecond = 6): number {
    return Math.max(minPerSecond, stepCount / targetSeconds);
}

// Candidates shown at `step` (0-based, inclusive).
export function visibleCandidates(anim: SearchAnimation, step: number): SearchCandidate[] {
    if (step < 0) return [];
    return anim.trace.slice(0, Math.min(step + 1, anim.trace.length));
}

// The best candidate once the search has finished (the block's vector).
export function finalBest(anim: SearchAnimation): SearchCandidate | null {
    return anim.trace.length ? anim.trace[anim.bestAt[anim.bestAt.length - 1]] : null;
}
