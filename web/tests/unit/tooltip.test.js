import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showTooltip, hideTooltip } from '../../src/lib/tooltip.js';

describe('tooltip.js', () => {
    beforeEach(() => {
        // Mock window innerWidth since jsdom doesn't have a reliable one by default
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    });

    afterEach(() => {
        // Just hide tooltip instead of clearing DOM, since tooltip is a singleton
        hideTooltip();
    });

    it('creates tooltip element on first showTooltip call', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5, 1, 2, 'Description');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip).not.toBeNull();
        expect(document.body.children.length).toBe(1);
    });

    it('reuses existing tooltip element', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5, 1, 2, 'Description 1');
        showTooltip(event, 10, 3, 4, 'Description 2');

        const tips = document.querySelectorAll('.grid-cell-tooltip');
        expect(tips.length).toBe(1); // Should only be 1 element
    });

    it('formats number values with toFixed(2)', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5.12345, 1, 2, '');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip.innerHTML).toContain('5.12');
    });

    it('handles string values directly', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 'RGB(255,255,255)', 1, 2, '');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip.innerHTML).toContain('RGB(255,255,255)');
    });

    it('renders coordinates when row and col are numbers', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5, 3, 4, '');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip.innerHTML).toContain('(3, 4)');
    });

    it('omits coordinates when row or col is "-"', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5, '-', '-', '');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip.innerHTML).not.toContain('(-, -)');
        expect(tip.innerHTML).not.toContain('tooltip-pos');
    });

    it('renders description if provided', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5, 1, 2, 'Test specific description');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip.innerHTML).toContain('Test specific description');
    });

    it('omits description if empty', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5, 1, 2, '');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip.innerHTML).not.toContain('tooltip-desc');
    });

    it('positions tooltip within window bounds', () => {
        // Mock tooltip height for bounding logic
        const event = new MouseEvent('mousemove', { clientX: 1000, clientY: 5 }); // Near right edge, top edge
        showTooltip(event, 5, 1, 2, '');

        const tip = document.querySelector('.grid-cell-tooltip');

        // window.innerWidth is 1024, max left should be 1024 - 220 = 804
        expect(tip.style.left).toBe('804px');

        // y is 5, tip.offsetHeight is presumably 0 in JSDOM, max(4, 5-10-0) = 4
        expect(tip.style.top).toBe('4px');
    });

    it('hideTooltip removes visible class', () => {
        const event = new MouseEvent('mousemove', { clientX: 100, clientY: 100 });
        showTooltip(event, 5, 1, 2, '');

        const tip = document.querySelector('.grid-cell-tooltip');
        expect(tip.classList.contains('visible')).toBe(true);

        hideTooltip();
        expect(tip.classList.contains('visible')).toBe(false);
    });

    it('hideTooltip gracefully handles null tooltipEl (called before showTooltip)', () => {
        expect(() => hideTooltip()).not.toThrow();
    });
});
