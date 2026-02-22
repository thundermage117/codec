import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import {
    clearAllHighlights,
    highlightAcrossGrids,
    highlightRunAcrossGrids,
    renderLossMeter,
    renderGrid,
    renderZigzagArray,
    renderEntropySummary,
    startZigzagAnimation,
    startReconstructionAnimation,
    stopReconstructionAnimation
} from '../../src/lib/grid-renderer';
import { ZIGZAG_INDICES } from '../../src/lib/dct-utils';

vi.mock('../../src/lib/basis-popover', () => ({
    showBasisPopover: vi.fn(),
    hideBasisPopover: vi.fn(),
    getCachedGridData: vi.fn(() => ({
        dequantizedData: new Float64Array(64).fill(10)
    }))
}));

const { mockAppState } = vi.hoisted(() => ({
    mockAppState: {
        transformType: 0,
        quality: 50,
        appMode: 'inspector',
        currentViewMode: 'Y'
    }
}));

vi.mock('../../src/lib/state.svelte', () => ({
    appState: mockAppState,
    ViewMode: { Y: 'Y', Cr: 'Cr', Cb: 'Cb', RGB: 'RGB' }
}));

describe('grid-renderer', () => {
    beforeEach(() => {
        HTMLElement.prototype.scrollIntoView = vi.fn();
        document.body.innerHTML = `
            <div class="pipeline-block">
                <div class="pipeline-block-header"></div>
                <div id="gridOriginal"></div>
            </div>
            <div class="pipeline-block">
                <div class="pipeline-block-header"></div>
                <div id="gridDCT"></div>
            </div>
            <div id="gridError"></div>
            <div id="gridZigzag"></div>
            <div id="lossMeterContainer"></div>
            <div id="entropySummary"></div>
            <details class="advanced-section"></details>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    describe('highlightAcrossGrids', () => {
        test('adds and clears cell-highlight correctly', () => {
            const gridOriginal = document.getElementById('gridOriginal');
            // Populate grid
            for (let i = 0; i < 64; i++) {
                const div = document.createElement('div');
                div.className = 'grid-cell';
                gridOriginal.appendChild(div);
            }

            // Highlight row 0, col 5 -> idx 5
            highlightAcrossGrids(0, 5);
            expect(gridOriginal.children[5].classList.contains('cell-highlight')).toBe(true);
            // Let's clear the container for this specific test
            gridOriginal.innerHTML = '';
            for (let i = 0; i < 64; i++) {
                const div = document.createElement('div');
                div.className = 'grid-cell';
                gridOriginal.appendChild(div);
            }

            highlightAcrossGrids(0, 5);
            expect(gridOriginal.children[5].classList.contains('cell-highlight')).toBe(true);
            expect(gridOriginal.children[4].classList.contains('cell-highlight')).toBe(false);

            clearAllHighlights();
            expect(gridOriginal.children[5].classList.contains('cell-highlight')).toBe(false);
        });
    });

    describe('renderLossMeter', () => {
        test('renders 100% quality for 0 MSE', () => {
            renderLossMeter(0, 0);
            const value = document.querySelector('.loss-meter-value');
            expect(value).not.toBeNull();
            expect(value.textContent).toBe('100%');
        });

        test('renders 0% quality for very high MSE', () => {
            renderLossMeter(255 * 255, 0);
            const value = document.querySelector('.loss-meter-value');
            expect(value.textContent).toBe('0%');
        });

        test('updates existing loss meter', () => {
            renderLossMeter(0, 0);
            renderLossMeter(100, 0);
            const value = document.querySelector('.loss-meter-value');
            expect(value.textContent).not.toBe('100%');
        });
    });

    describe('renderGrid', () => {
        test('renders 64 cells with float numbers and handles mouse events', () => {
            const data = new Float64Array(64).fill(10.5);
            renderGrid('gridOriginal', data, 'number', 'original');

            const grid = document.getElementById('gridOriginal');
            expect(grid.children.length).toBe(64);

            const firstCell = grid.children[0];
            expect(firstCell.classList.contains('grid-cell')).toBe(true);
            expect(firstCell.textContent).toBe('10.5');
            expect(firstCell.dataset.row).toBe("0");
            expect(firstCell.dataset.col).toBe("0");

            // trigger mouseenter and mouseleave to hit event handlers
            grid.dispatchEvent(new MouseEvent('mouseleave'));
        });

        test('renders RGB intensity type correctly', () => {
            const data = new Uint8ClampedArray(64 * 3).fill(255); // all white
            renderGrid('gridOriginal', data, 'intensity', 'original', true);

            const grid = document.getElementById('gridOriginal');
            const firstCell = grid.children[0];

            expect(firstCell.style.backgroundColor).toBe('rgb(255, 255, 255)');
            expect(firstCell.textContent).toBe('');
            expect(firstCell.dataset.val).toBe('RGB(255,255,255)');
        });

        test('renders grayscale intensity type correctly', () => {
            const data = new Float64Array(64).fill(200); // lightly colored
            renderGrid('gridOriginal', data, 'intensity', 'original', false);

            const grid = document.getElementById('gridOriginal');
            const firstCell = grid.children[0];

            expect(firstCell.style.backgroundColor).toBe('rgb(200, 200, 200)');
            expect(firstCell.style.color).toBe('rgb(30, 41, 59)'); // #1e293b
            expect(firstCell.textContent).toBe('200');
            expect(firstCell.dataset.val).toBe('200');
        });

        test('renders frequency type and non-zero badge', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 5;
            data[1] = -5;
            renderGrid('gridDCT', data, 'frequency', 'dct');

            const badge = document.querySelector('.nonzero-badge');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe('2'); // 2 non-zero elements

            // Trigger mouseenter on badge
            const mouseEnterEvent = new MouseEvent('mouseenter');
            badge.dispatchEvent(mouseEnterEvent);

            // Trigger mouseleave on badge
            const mouseLeaveEvent = new MouseEvent('mouseleave');
            badge.dispatchEvent(mouseLeaveEvent);

            // Trigger mouseenter on cell to cover showBasisPopover
            const grid = document.getElementById('gridDCT');
            const cell = grid.children[0];
            const cellEnter = new MouseEvent('mouseenter');
            cell.dispatchEvent(cellEnter);
        });

        test('renders qtable type correctly', () => {
            const data = new Float64Array(64).fill(100);
            renderGrid('gridOriginal', data, 'qtable', 'qtable');
            const grid = document.getElementById('gridOriginal');
            const firstCell = grid.children[0];
            expect(firstCell.textContent).toBe('100');
        });

        test('renders error type correctly', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 15; // Positive error
            data[1] = -15; // Negative error
            renderGrid('gridError', data, 'error', 'error');
            const grid = document.getElementById('gridError');
            const posErrorCell = grid.children[0];
            const negErrorCell = grid.children[1];
            expect(posErrorCell.style.backgroundColor).toContain('rgba');
            expect(negErrorCell.style.backgroundColor).toContain('rgba');
        });

        test('updates existing grid (hasChildren)', () => {
            const data = new Float64Array(64).fill(1);
            // First call creates 64 children
            renderGrid('gridOriginal', data, 'number', 'original');
            // Second call reuses them
            renderGrid('gridOriginal', data, 'number', 'original');
            const grid = document.getElementById('gridOriginal');
            expect(grid.children.length).toBe(64);
        });

        test('covers all gridTypes for getCellDescription', () => {
            const data = new Float64Array(64).fill(1);
            renderGrid('gridOriginal', data, 'number', 'quantized');
            renderGrid('gridOriginal', data, 'number', 'dequantized');
            renderGrid('gridOriginal', data, 'number', 'reconstructed');
            renderGrid('gridOriginal', data, 'number', 'unknown_type');
        });
    });

    describe('renderZigzagArray', () => {
        test('renders runs and EOB correctly', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 50;
            data[ZIGZAG_INDICES[1]] = 20;

            renderZigzagArray(data);
            const zz = document.getElementById('gridZigzag');

            expect(zz.innerHTML).toContain('zz-cell');
            expect(zz.innerHTML).toContain('zz-eob');
            expect(zz.innerHTML).toContain('50');
            expect(zz.innerHTML).toContain('20');
        });

        test('handles long runs of zeros', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 50;
            data[ZIGZAG_INDICES[50]] = 5; // create a long run of zeros

            renderZigzagArray(data);
            const zz = document.getElementById('gridZigzag');
            expect(zz.innerHTML).toContain('zz-run');
            expect(zz.innerHTML).toContain('Zeros');
        });

        test('handles short runs of zeros (<= 2)', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 50;
            data[ZIGZAG_INDICES[2]] = 5; // run of 1 zero

            renderZigzagArray(data);
            const zz = document.getElementById('gridZigzag');
            expect(zz.innerHTML).not.toContain('zz-run');
            const zeroCells = zz.querySelectorAll('.zz-zero');
            expect(zeroCells.length).toBeGreaterThan(0);
        });

        test('handles mouse events on zz-cells', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 50;
            renderZigzagArray(data);

            const zz = document.getElementById('gridZigzag');
            const cell = zz.querySelector('.zz-cell');

            // Trigger mouseenter
            const mouseEnterEvent = new MouseEvent('mouseenter');
            cell.dispatchEvent(mouseEnterEvent);

            // Tooltip should be shown, highlight applied
            // Instead of asserting dom for tooltip (which is in another file), just ensure no error
            expect(cell).toBeDefined();

            // Trigger mouseleave
            const mouseLeaveEvent = new MouseEvent('mouseleave');
            cell.dispatchEvent(mouseLeaveEvent);
        });
    });

    describe('renderEntropySummary', () => {
        test('renders entropy breakdown calculations', () => {
            const symbols = [
                { type: 'DC', totalBits: 5, amplitude: 10 },
                { type: 'AC', totalBits: 10, run: 0, amplitude: 5 },
                { type: 'EOB', totalBits: 4 }
            ];

            renderEntropySummary(symbols);
            const summary = document.getElementById('entropySummary');

            // Total bits 19
            expect(summary.innerHTML).toContain('19 bits');

            // Compression ratio < 100% since 19 < 512
            expect(summary.innerHTML).toContain('smaller');

            // Specific segments
            expect(summary.innerHTML).toContain('DC&nbsp;5b');
            expect(summary.innerHTML).toContain('AC&nbsp;10b');
            expect(summary.innerHTML).toContain('EOB&nbsp;4b');
        });
    });

    describe('startZigzagAnimation', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        test('starts and stops animation loop', () => {
            const data = new Float64Array(64).fill(0);
            renderZigzagArray(data);

            // Ensure advanced section is closed initially
            const advancedSection = document.querySelector('.advanced-section');
            advancedSection.open = false;

            // Start animation
            startZigzagAnimation();
            expect(advancedSection.open).toBe(true);

            // Fast forward timers
            vi.advanceTimersByTime(150); // One interval should pass

            // Stop animation by calling it again
            startZigzagAnimation();

            // Advance more to clearHighlights timeout
            vi.advanceTimersByTime(1500);
        });

        test('animation auto-stops after 64 elements', () => {
            const data = new Float64Array(64).fill(0);
            renderZigzagArray(data);

            startZigzagAnimation();

            // Fast forward past 64 * 100ms
            vi.advanceTimersByTime(6500 + 1500); // 6.5s + 1.5s for clearAllHighlights timeout
        });
    });

    describe('highlightRunAcrossGrids', () => {
        test('highlights multiple indices', () => {
            const gridOriginal = document.getElementById('gridOriginal');
            for (let i = 0; i < 64; i += 1) {
                const div = document.createElement('div');
                div.className = 'grid-cell';
                gridOriginal.appendChild(div);
            }
            highlightRunAcrossGrids([10, 11, 12]);
            expect(gridOriginal.children[10].classList.contains('cell-highlight')).toBe(true);
            expect(gridOriginal.children[11].classList.contains('cell-highlight')).toBe(true);
            expect(gridOriginal.children[12].classList.contains('cell-highlight')).toBe(true);
        });
    });

    describe('renderGrid additional coverage', () => {
        test('handles click events and animate-basis event', () => {
            const data = new Float64Array(64).fill(10);
            renderGrid('gridOriginal', data, 'number', 'transform');
            const grid = document.getElementById('gridOriginal');
            const cell = grid.children[0];

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
            cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(dispatchSpy).toHaveBeenCalled();
            expect(dispatchSpy.mock.calls[0][0].type).toBe('animate-basis');
        });

        test('handles Haar transform type for frequency labels', () => {
            mockAppState.transformType = 1; // Haar
            const data = new Float64Array(64).fill(10);
            renderGrid('gridDCT', data, 'frequency', 'transform');
            // Hits getTransformFreqLabel -> getHaarFreqLabel
            const badge = document.querySelector('.nonzero-badge');
            badge.dispatchEvent(new MouseEvent('mouseenter'));
            expect(badge.textContent).toBe('64');
            mockAppState.transformType = 0; // Reset
        });
    });

    describe('renderEntropySummary interactivity', () => {
        test('expand and collapse all buttons work', () => {
            const symbols = [{ type: 'DC', totalBits: 5, amplitude: 10, zIndex: 0 }];
            renderEntropySummary(symbols);
            const container = document.getElementById('entropySummary');
            const expandBtn = container.querySelector('#expandAllCosts');
            const collapseBtn = container.querySelector('#collapseAllCosts');
            const details = container.querySelector('.cost-details');

            expandBtn.click();
            expect(details.open).toBe(true);

            collapseBtn.click();
            expect(details.open).toBe(false);
        });

        test('renders different symbol types in mini table', () => {
            const symbols = [
                { type: 'DC', totalBits: 5, amplitude: 10, zIndex: 0, baseBits: 3, magBits: 2 },
                { type: 'AC', totalBits: 10, run: 2, amplitude: 5, zIndex: 1, baseBits: 6, magBits: 4 },
                { type: 'ZRL', totalBits: 8, zIndex: 5, baseBits: 8, magBits: 0 },
                { type: 'EOB', totalBits: 4, zIndex: 6, baseBits: 4, magBits: 0 }
            ];
            renderEntropySummary(symbols);
            const summary = document.getElementById('entropySummary');
            expect(summary.innerHTML).toContain('EOB');
            expect(summary.innerHTML).toContain('16 Zeros'); // ZRL
            expect(summary.innerHTML).toContain('2 Zeros'); // AC run
        });
    });

    describe('reconstruction animation', () => {
        beforeEach(() => {
            document.body.innerHTML += `
                <button class="pipeline-play-btn"><svg></svg></button>
                <div id="reconstructionProgress"></div>
                <div id="reconAnimBanner" style="display:none">
                    <span id="reconBannerStep"></span>
                    <div id="reconBannerFill"></div>
                    <span id="reconBannerFreq"></span>
                    <span id="reconBannerCoeff"></span>
                    <span id="reconBannerDesc"></span>
                    <canvas id="reconBasisCanvas" width="64" height="64"></canvas>
                </div>
                <div id="gridReconstructed"></div>
            `;
            const grid = document.getElementById('gridReconstructed');
            for (let i = 0; i < 64; i += 1) {
                const div = document.createElement('div');
                div.className = 'grid-cell';
                grid.appendChild(div);
            }

            vi.stubGlobal('requestAnimationFrame', vi.fn(cb => setTimeout(() => cb(Date.now()), 16)));
            vi.stubGlobal('cancelAnimationFrame', vi.fn());

            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
            vi.restoreAllMocks();
            stopReconstructionAnimation(); // Cleanup global state
        });

        test('starts, pause/resume and stops reconstruction animation', async () => {
            startReconstructionAnimation();
            const progress = document.getElementById('reconstructionProgress');
            expect(progress.style.display).not.toBe('none');

            // Wait for one frame
            await vi.advanceTimersByTimeAsync(100);

            // Pause
            startReconstructionAnimation();
            // Resume
            startReconstructionAnimation();

            stopReconstructionAnimation();
            expect(progress.style.display).toBe('none');
        });

        test('runs reconstruction animation frames', async () => {
            startReconstructionAnimation();

            // Advance time in many steps to allow multiple frames of requestAnimationFrame
            for (let i = 0; i < 100; i++) {
                await vi.advanceTimersByTimeAsync(100);
            }

            const progress = document.getElementById('reconstructionProgress');
            expect(progress.textContent).toBe('64/64');
        });

        test('showBannerForCell works', () => {
            // Setup a grid that can be clicked
            const data = new Float64Array(64).fill(10);
            document.body.innerHTML += '<div id="gridDequantized"></div>';
            renderGrid('gridDequantized', data, 'frequency', 'dequantized');

            const dqGrid = document.getElementById('gridDequantized');
            dqGrid.children[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

            const banner = document.getElementById('reconAnimBanner');
            expect(banner.style.display).not.toBe('none');
            // Check that it shows step 1 (1-based index)
            expect(document.getElementById('reconBannerStep').textContent).toBe('1');
        });

        test('handles starts when already playing', () => {
            startReconstructionAnimation();
            const spy = vi.spyOn(window, 'cancelAnimationFrame');
            startReconstructionAnimation(); // Should pause
            expect(spy).toHaveBeenCalled();
        });
    });

    describe('renderGrid corner cases', () => {
        test('renders negative zero correctly', () => {
            const data = new Float64Array(64).fill(-0.0);
            renderGrid('gridOriginal', data, 'number', 'original');
            const firstCell = document.getElementById('gridOriginal').children[0];
            expect(firstCell.textContent).toBe('0');
        });

        test('renders error colors and opacities', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 50; // Above visualMax 30
            data[1] = -5;
            renderGrid('gridError', data, 'error', 'error');
            const grid = document.getElementById('gridError');
            // JSDOM might return rgb() for opaque colors
            expect(grid.children[0].style.backgroundColor).toMatch(/rgb\(239, 68, 68\)/);
            expect(grid.children[1].style.backgroundColor).toContain('rgba(59, 130, 246');
        });
    });

    describe('renderZigzagArray corner cases', () => {
        test('renders more than 8 dots in a run', () => {
            const data = new Float64Array(64).fill(0);
            renderZigzagArray(data); // EOB will handle it, but let's put a value at the end
            data[63] = 10;
            renderZigzagArray(data);
            const run = document.querySelector('.zz-run');
            expect(run.innerHTML).toContain('run-more');
        });
    });

    describe('highlightAcrossGrids additional', () => {
        test('highlights zz-run in gridZigzag', () => {
            const data = new Float64Array(64).fill(0);
            data[0] = 10;
            data[63] = 10;
            renderZigzagArray(data); // indices 1-62 is a run
            highlightAcrossGrids(Math.floor(ZIGZAG_INDICES[1] / 8), ZIGZAG_INDICES[1] % 8);
            const run = document.querySelector('.zz-run');
            expect(run.classList.contains('cell-highlight')).toBe(true);
        });
    });
});
