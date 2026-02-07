export async function inspectAtPoint(page, x, y) {
    try {
        const elementData = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            if (!el) return null;

            if (!el.getAttribute('data-devoptic-id')) {
                const id = 'dvo_' + Math.random().toString(36).substr(2, 9);
                el.setAttribute('data-devoptic-id', id);
            }

            const s = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();

            return {
                id: el.getAttribute('data-devoptic-id'),
                tagName: el.tagName.toLowerCase(),
                classes: el.className?.toString() || '',
                idAttr: el.id || '',
                innerText: el.innerText?.slice(0, 200) || '',
                outerHTML: el.outerHTML?.slice(0, 500) || '',
                rect: {
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    top: r.top,
                    left: r.left
                },
                styles: {
                    display: s.display,
                    position: s.position,
                    width: s.width,
                    height: s.height,
                    margin: s.margin,
                    padding: s.padding,
                    color: s.color,
                    fontSize: s.fontSize,
                    fontWeight: s.fontWeight,
                    fontFamily: s.fontFamily,
                    textAlign: s.textAlign,
                    lineHeight: s.lineHeight,
                    backgroundColor: s.backgroundColor,
                    borderRadius: s.borderRadius,
                    border: s.border,
                    opacity: s.opacity,
                    flexDirection: s.flexDirection,
                    justifyContent: s.justifyContent,
                    alignItems: s.alignItems,
                    gap: s.gap
                }
            };
        }, { x, y });

        return elementData;
    } catch (err) {
        console.warn(`[MagicSelect] inspectAtPoint failed: ${err.message}`);
        return null;
    }
}

export async function highlightAtPoint(page, x, y) {
    try {
        return await page.evaluate(({ x, y }) => {
            const prev = document.getElementById('devoptic-magic-highlight');
            if (prev) prev.remove();

            const el = document.elementFromPoint(x, y);
            if (!el) return null;

            const r = el.getBoundingClientRect();

            const overlay = document.createElement('div');
            overlay.id = 'devoptic-magic-highlight';
            overlay.style.cssText = `
        position: fixed;
        top: ${r.top}px;
        left: ${r.left}px;
        width: ${r.width}px;
        height: ${r.height}px;
        border: 2px solid #ec4899;
        background: rgba(236, 72, 153, 0.1);
        pointer-events: none;
        z-index: 999999;
        transition: all 0.15s ease;
      `;
            document.body.appendChild(overlay);

            setTimeout(() => overlay.remove(), 2000);

            return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                top: r.top,
                left: r.left
            };
        }, { x, y });
    } catch (err) {
        console.warn(`[MagicSelect] highlightAtPoint failed: ${err.message}`);
        return null;
    }
}

export async function clearHighlight(page) {
    try {
        await page.evaluate(() => {
            const highlight = document.getElementById('devoptic-magic-highlight');
            if (highlight) highlight.remove();
        });
    } catch (err) {
    }
}
