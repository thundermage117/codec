// Fast hover hints for every `title` in the app.
//
// The browser's native title tooltip waits about a second and can't be
// sped up, so this shows the same text in a styled tooltip after a short
// delay. Markup keeps using plain `title` attributes (and SVG <title>
// children); while a hint is showing, the native source is set aside so
// both don't appear, and it is put back when the pointer leaves.

const SHOW_DELAY_MS = 150;
const GAP_PX = 8;
/** Moving to another hint this soon after one was visible shows it at once. */
const SWITCH_WINDOW_MS = 300;

let tip: HTMLDivElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let active: { el: Element; restore: () => void } | null = null;
let lastVisibleAt = -Infinity;
let installed = false;

function ensureTip(): HTMLDivElement {
    if (!tip) {
        tip = document.createElement('div');
        tip.className = 'hover-hint';
        tip.setAttribute('role', 'tooltip');
        tip.id = 'hover-hint';
        document.body.appendChild(tip);
    }
    return tip;
}

/** The nearest element (from `start` up) that carries hint text, and that text. */
function findHint(start: Element | null): { el: Element; text: string } | null {
    for (let el = start; el && el !== document.body; el = el.parentElement) {
        const title = el.getAttribute('title');
        if (title) return { el, text: title };
        // SVG elements describe themselves with a <title> child.
        if (el instanceof SVGElement) {
            const child = Array.from(el.children).find(c => c.tagName.toLowerCase() === 'title');
            if (child?.textContent) return { el, text: child.textContent };
        }
    }
    return null;
}

/** Hide the native tooltip source; returns a function that puts it back. */
function suppressNative(el: Element): () => void {
    const title = el.getAttribute('title');
    if (title !== null) {
        el.removeAttribute('title');
        // Svelte may have set a new title meanwhile; only restore if none.
        return () => { if (!el.hasAttribute('title')) el.setAttribute('title', title); };
    }
    const child = Array.from(el.children).find(c => c.tagName.toLowerCase() === 'title');
    if (child) {
        const next = child.nextSibling;
        child.remove();
        return () => { if (el.isConnected) el.insertBefore(child, next?.parentNode === el ? next : el.firstChild); };
    }
    return () => {};
}

function place(el: Element): void {
    if (!tip) return;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let top = r.top - t.height - GAP_PX;
    if (top < 4) top = r.bottom + GAP_PX; // no room above: go below
    const left = Math.max(4, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - 4));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
}

function hide(): void {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    if (active) {
        active.restore();
        active.el.removeAttribute('aria-describedby');
        active = null;
    }
    if (tip?.classList.contains('visible')) lastVisibleAt = Date.now();
    tip?.classList.remove('visible');
}

function show(el: Element, text: string, immediate: boolean, suppress = true): void {
    hide();
    // Keyboard focus never shows the native tooltip, and the title may be
    // the element's accessible name, so leave it in place then.
    active = { el, restore: suppress ? suppressNative(el) : () => {} };
    el.setAttribute('aria-describedby', 'hover-hint');
    const reveal = () => {
        showTimer = null;
        const t = ensureTip();
        t.textContent = text;
        t.classList.add('visible');
        place(el);
    };
    if (immediate) reveal();
    else showTimer = setTimeout(reveal, SHOW_DELAY_MS);
}

export function installHoverHints(): void {
    if (installed) return;
    installed = true;
    document.addEventListener('pointerover', (e) => {
        if (e.pointerType === 'touch') return;
        // Still inside the hinted element (its title is set aside meanwhile).
        if (active && active.el.contains(e.target as Node)) return;
        const found = findHint(e.target as Element);
        if (!found) {
            if (active) hide();
            return;
        }
        // Moving between hinted elements: switch without waiting again.
        const switching = !!tip?.classList.contains('visible') || Date.now() - lastVisibleAt < SWITCH_WINDOW_MS;
        show(found.el, found.text, switching);
    });

    document.addEventListener('pointerout', (e) => {
        if (!active) return;
        const to = e.relatedTarget as Node | null;
        if (to && active.el.contains(to)) return;
        hide();
    });

    // Keyboard users get the same hint on focus.
    document.addEventListener('focusin', (e) => {
        const target = e.target as Element;
        if (!(target instanceof HTMLElement) || !target.matches(':focus-visible')) return;
        const found = findHint(target);
        if (found && found.el === target) show(found.el, found.text, false, false);
    });
    document.addEventListener('focusout', hide);

    // Clicks, scrolling and Escape all dismiss it.
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    window.addEventListener('scroll', hide, true);
}
