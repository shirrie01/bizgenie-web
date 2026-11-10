// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const rule = (selector) => {
  const match = css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  return match ? match[2] : "";
};

describe("stylesheet accessibility contract", () => {
  it("keeps .eyebrow text at WCAG AA contrast on every surface it appears on", () => {
    const color = rule(".eyebrow").match(/color:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(color).toBeTruthy();
    // page background, white panels, and the tinted account prompt
    for (const background of ["#f3f4f0", "#ffffff", "#f4dfc9"]) {
      expect(contrast(color, background), `${color} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("constrains form controls inside cards to the card width", () => {
    const css = rule(".item select, .item textarea, .item input");
    expect(css).toMatch(/max-width:\s*100%/);
    expect(css).toMatch(/min-width:\s*0/);
    expect(css).toMatch(/width:\s*100%/);
  });
});
