import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import QualityControl from '../../src/lib/components/QualityControl.svelte';
import { appState } from '../../src/lib/state.svelte.js';

describe('QualityControl', () => {
    let target;
    let component;
    let onPreview;

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
        appState.quality = 50;
        appState.wasmReady = true;
        target = document.createElement('div');
        document.body.appendChild(target);
        onPreview = vi.fn();
        component = mount(QualityControl, { target, props: { idPrefix: 'test', onPreview } });
        flushSync();
    });

    afterEach(() => {
        unmount(component);
        target.remove();
        vi.useRealTimers();
    });

    const slider = () => target.querySelector('#testSlider');
    const drag = (v) => {
        slider().value = String(v);
        slider().dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
    };

    it('previews while dragging without committing, throttled to one call per frame', () => {
        drag(40);
        drag(35);
        drag(30);
        expect(onPreview).not.toHaveBeenCalled();
        vi.advanceTimersToNextFrame();
        expect(onPreview).toHaveBeenCalledTimes(1);
        expect(onPreview).toHaveBeenCalledWith(30);
        expect(appState.quality).toBe(50);
        expect(target.querySelector('#testValue').textContent).toBe('30');
    });

    it('commits on release and cancels a pending preview', () => {
        drag(20);
        slider().dispatchEvent(new Event('change', { bubbles: true }));
        flushSync();
        vi.advanceTimersToNextFrame();
        expect(appState.quality).toBe(20);
        expect(onPreview).not.toHaveBeenCalled();
    });

    it('presets commit immediately and the slider follows external changes', () => {
        target.querySelector('[data-quality="90"]').click();
        flushSync();
        expect(appState.quality).toBe(90);
        expect(slider().value).toBe('90');

        appState.quality = 15; // e.g. keyboard shortcut or RD chart click
        flushSync();
        expect(slider().value).toBe('15');
        expect(target.querySelector('[data-quality="90"]').getAttribute('aria-pressed')).toBe('false');
    });
});
