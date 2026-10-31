import "@testing-library/jest-dom/vitest";

// Remembered facts and creative ids live in localStorage by design (convenience only); no test may leak them into the next.
afterEach(() => { try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* node-environment tests have no storage */ } });
