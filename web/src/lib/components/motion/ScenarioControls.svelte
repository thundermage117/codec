<script lang="ts">
    import { motionState } from '../../motion/motion-state.svelte.js';

    type Slider = { key: string; label: string; min: number; max: number; step: number; unit: string };

    const SLIDERS: Record<string, Slider[]> = {
        pan: [
            { key: 'dx', label: 'Horizontal', min: -16, max: 16, step: 0.5, unit: 'px' },
            { key: 'dy', label: 'Vertical', min: -16, max: 16, step: 0.5, unit: 'px' },
        ],
        zoom: [{ key: 'scale', label: 'Scale', min: 0.9, max: 1.1, step: 0.005, unit: '×' }],
        rotate: [{ key: 'degrees', label: 'Angle', min: -6, max: 6, step: 0.25, unit: '°' }],
        object: [
            { key: 'dx', label: 'Object horizontal', min: -24, max: 24, step: 1, unit: 'px' },
            { key: 'dy', label: 'Object vertical', min: -24, max: 24, step: 1, unit: 'px' },
        ],
    };

    const HINTS: Record<string, string> = {
        pan: 'The whole frame shifts, like a camera pan. Half-pixel steps show why integer search has an error floor.',
        zoom: 'Motion grows towards the edges and is zero at the centre, so every block needs a different vector.',
        rotate: 'Rotation about the centre: vectors circle around it. Block matching only models translation.',
        object: 'A patch moves over a still background. Blocks on its edge and the background it uncovers have no single true vector.',
    };

    const sliders = $derived(SLIDERS[motionState.scenario.kind]);

    function value(key: string): number {
        return (motionState.scenario as unknown as Record<string, number>)[key];
    }

    function set(key: string, e: Event) {
        const v = Number((e.target as HTMLInputElement).value);
        (motionState.scenario as unknown as Record<string, number>)[key] = v;
    }

    function format(v: number, s: Slider): string {
        const digits = s.step < 0.01 ? 3 : s.step < 1 ? (s.step < 0.5 ? 2 : 1) : 0;
        return `${v > 0 && s.unit !== '×' ? '+' : ''}${v.toFixed(digits)}${s.unit}`;
    }
</script>

{#each sliders as s (motionState.scenario.kind + s.key)}
<div class="control-group">
    <label for="me-{s.key}">
        {s.label}
        <span>{format(value(s.key), s)}</span>
    </label>
    <input type="range" id="me-{s.key}" min={s.min} max={s.max} step={s.step}
        value={value(s.key)} oninput={(e) => set(s.key, e)}>
</div>
{/each}

<div class="control-group">
    <label for="me-noise">
        Sensor noise
        <span>σ {motionState.scenario.noise.toFixed(0)}</span>
    </label>
    <input type="range" id="me-noise" min="0" max="20" step="1"
        value={motionState.scenario.noise} oninput={(e) => set('noise', e)}>
</div>

<p class="me-hint">{HINTS[motionState.scenario.kind]}</p>

<style>
    .me-hint {
        margin: 4px 0 0;
        font-size: 0.72rem;
        line-height: 1.45;
        color: var(--text-muted);
    }
</style>
