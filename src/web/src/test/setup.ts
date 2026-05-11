import "@testing-library/jest-dom";

// Vitest with the jsdom environment doesn't always wire up localStorage reliably
// (it depends on the jsdom version and Node's experimental storage flag). Install
// a tiny in-memory polyfill so any code that touches localStorage works in tests.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: false,
    configurable: true,
  });
}
