/**
 * jsdom has no layout engine, so reactflow's measurement APIs are absent.
 * These stubs let the component tree mount; they do not make layout real, so
 * anything that depends on measured geometry is out of scope for these tests.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnlyStub {
    m22 = 1;
    constructor(_transform?: string) {}
  }
  // @ts-expect-error — minimal stand-in, only what reactflow reads.
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
}

if (typeof Element !== 'undefined' && !Element.prototype.getBoundingClientRect) {
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 }) as DOMRect;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  // @ts-expect-error — only the fields the theme provider reads.
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}
