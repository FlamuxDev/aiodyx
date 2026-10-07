// Optional screenshot of the current viewport, compressed for storage in the repo (<= ~300 KB).
// modern-screenshot is loaded on demand so it never weighs on normal page loads.

const TARGET_BYTES = 300_000;
const MAX_WIDTH = 1100;
const TIMEOUT = 10_000;

const bytesOf = (dataUrl: string) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

/** Returns a data URL (webp, or jpeg where webp encoding is unsupported), or null on any failure. */
export async function captureViewport(highlight?: Element | null): Promise<string | null> {
  const prevOutline = highlight instanceof HTMLElement ? highlight.style.outline : '';
  const prevOffset = highlight instanceof HTMLElement ? highlight.style.outlineOffset : '';
  try {
    if (highlight instanceof HTMLElement) {
      highlight.style.outline = '3px solid #0e6b5c';
      highlight.style.outlineOffset = '2px';
    }
    const { domToCanvas } = await import('modern-screenshot');
    const scale = Math.min(1, MAX_WIDTH / innerWidth);
    const job = domToCanvas(document.documentElement, {
      width: innerWidth,
      height: innerHeight,
      scale,
      backgroundColor: '#ffffff',
      style: { transform: `translate(${-scrollX}px, ${-scrollY}px)`, transformOrigin: 'top left' },
      filter: (node) => !(node instanceof Element && (node.classList.contains('fb') || node.localName === 'canvas')),
      timeout: 8000,
    });
    let canvas = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT))]);
    if (!canvas) return null;

    for (let shrink = 0; shrink < 3; shrink++) {
      for (const q of [0.78, 0.6, 0.45]) {
        let url = canvas.toDataURL('image/webp', q);
        if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q); // Safari cannot encode webp
        if (bytesOf(url) <= TARGET_BYTES) return url;
      }
      const small = document.createElement('canvas');
      small.width = Math.round(canvas.width * 0.75);
      small.height = Math.round(canvas.height * 0.75);
      small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
      canvas = small;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (highlight instanceof HTMLElement) {
      highlight.style.outline = prevOutline;
      highlight.style.outlineOffset = prevOffset;
    }
  }
}
