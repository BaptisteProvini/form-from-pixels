import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

if (typeof window !== "undefined") Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

if (typeof window !== "undefined") Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
