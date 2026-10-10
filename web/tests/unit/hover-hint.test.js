import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installHoverHints } from '../../src/lib/hover-hint.js';

function hover(el, related = null) {
    el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: related }));
}

function leave(el, to = document.body) {
    el.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: to }));
}

const tip = () => document.querySelector('.hover-hint');

describe('hover-hint', () => {
    beforeAll(() => installHoverHints());

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.querySelectorAll(':not(.hover-hint)').forEach(n => n.remove());
    });

    afterEach(() => {
        document.dispatchEvent(new MouseEvent('pointerdown'));
        vi.advanceTimersByTime(1000); // let the quick-switch window lapse
        vi.useRealTimers();
    });

    it('shows the title text after a short delay, not the native tooltip', () => {
        document.body.insertAdjacentHTML('beforeend', '<button id="b" title="Explains b">b</button>');
        const b = document.getElementById('b');

        hover(b);
        expect(b.hasAttribute('title')).toBe(false); // native tooltip suppressed
        expect(tip()?.classList.contains('visible') ?? false).toBe(false);

        vi.advanceTimersByTime(200);
        expect(tip().classList.contains('visible')).toBe(true);
        expect(tip().textContent).toBe('Explains b');
        expect(b.getAttribute('aria-describedby')).toBe('hover-hint');
    });

    it('restores the title when the pointer leaves', () => {
        document.body.insertAdjacentHTML('beforeend', '<span id="s" title="Explains s">s</span>');
        const s = document.getElementById('s');

        hover(s);
        vi.advanceTimersByTime(200);
        leave(s);

        expect(s.getAttribute('title')).toBe('Explains s');
        expect(s.hasAttribute('aria-describedby')).toBe(false);
        expect(tip().classList.contains('visible')).toBe(false);
    });

    it('keeps the hint while moving over the element\'s children', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="d" title="Explains d"><strong id="c">child</strong></div>');
        const d = document.getElementById('d');
        const c = document.getElementById('c');

        hover(d);
        vi.advanceTimersByTime(200);
        leave(d, c);
        hover(c);

        expect(tip().classList.contains('visible')).toBe(true);
        expect(tip().textContent).toBe('Explains d');
    });

    it('switches straight to the next hint without waiting again', () => {
        document.body.insertAdjacentHTML('beforeend', '<i id="a" title="A">a</i><i id="z" title="Z">z</i>');
        const a = document.getElementById('a');
        const z = document.getElementById('z');

        hover(a);
        vi.advanceTimersByTime(200);
        leave(a, z);
        hover(z);

        expect(tip().classList.contains('visible')).toBe(true);
        expect(tip().textContent).toBe('Z');
        expect(a.getAttribute('title')).toBe('A');
    });

    it('reads SVG <title> children and puts them back', () => {
        document.body.insertAdjacentHTML('beforeend', '<svg><text id="t"><title>Axis hint</title>Axis</text></svg>');
        const t = document.getElementById('t');

        hover(t);
        vi.advanceTimersByTime(200);
        expect(tip().textContent).toBe('Axis hint');
        expect(t.querySelector('title')).toBeNull();

        leave(t);
        expect(t.querySelector('title')?.textContent).toBe('Axis hint');
    });

    it('ignores elements without hints', () => {
        document.body.insertAdjacentHTML('beforeend', '<p id="p">plain</p>');
        hover(document.getElementById('p'));
        vi.advanceTimersByTime(200);
        expect(tip()?.classList.contains('visible') ?? false).toBe(false);
    });
});
