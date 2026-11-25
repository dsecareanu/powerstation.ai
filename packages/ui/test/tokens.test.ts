import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FUEL_TYPES } from "@powerstation/schema";
import { fuelColorVar } from "../src/tokens";

const css = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `missing block ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const vars: Record<string, string> = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--ps-[\w-]+):\s*([^;]+);/g)) {
    vars[m[1]!] = m[2]!.trim();
  }
  return vars;
}

const light = block(":root {");
const darkMedia = block(':root:not([data-theme="light"])');
const darkAttr = block(':root[data-theme="dark"]');
const dark = { ...light, ...darkAttr };

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("both dark blocks are identical", () => {
  assert.deepEqual(darkMedia, darkAttr);
});

test("every fuel type has a color", () => {
  for (const fuel of FUEL_TYPES) assert.ok(light[fuelColorVar(fuel)], fuelColorVar(fuel));
});

for (const [name, theme] of Object.entries({ light, dark })) {
  test(`${name}: contrast meets WCAG AA`, () => {
    for (const bgVar of ["--ps-color-bg", "--ps-color-surface"]) {
      const bg = theme[bgVar]!;
      for (const v of ["--ps-color-text", "--ps-color-text-muted", "--ps-color-accent"]) {
        assert.ok(contrast(theme[v]!, bg) >= 4.5, `${v} on ${bgVar}: ${contrast(theme[v]!, bg)}`);
      }
      for (const s of ["measured", "planned", "modelled", "missing"]) {
        const v = `--ps-state-${s}`;
        assert.ok(contrast(theme[v]!, bg) >= 3, `${v} on ${bgVar}: ${contrast(theme[v]!, bg)}`);
      }
    }
    const warn = contrast(theme["--ps-color-warning-text"]!, theme["--ps-color-warning-bg"]!);
    assert.ok(warn >= 4.5, `warning text: ${warn}`);
    const onAccent = contrast(theme["--ps-color-on-accent"]!, theme["--ps-color-accent"]!);
    assert.ok(onAccent >= 4.5, `on-accent: ${onAccent}`);
  });
}
