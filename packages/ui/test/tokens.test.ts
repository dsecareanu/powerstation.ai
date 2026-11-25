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

// CIELAB lightness, a and b of a #rrggbb colour (D65).
function lab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

test("no fuel color is violet or lavender", () => {
  for (const theme of [light, dark]) {
    for (const fuel of FUEL_TYPES) {
      const [, a, b] = lab(theme[fuelColorVar(fuel)]!);
      const chroma = Math.hypot(a, b);
      const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
      assert.ok(chroma < 15 || hue < 285 || hue > 335, `${fuel}: hue ${hue.toFixed(0)}`);
    }
  }
});

// Machado et al. (2009) colour-vision-deficiency matrices, severity 1.0 (linear RGB).
const CVD: Record<string, number[][] | null> = {
  normal: null,
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulate(hex: string, m: number[][] | null): string {
  if (!m) return hex;
  const n = parseInt(hex.slice(1), 16);
  const lin = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const out = m.map((row) =>
    Math.min(1, Math.max(0, row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!)),
  );
  return (
    "#" +
    out
      .map((c) => Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

test("nuclear stays apart from every other fuel, also with colour-blind vision", () => {
  for (const theme of [light, dark]) {
    const nuclear = theme["--ps-fuel-nuclear"]!;
    for (const fuel of FUEL_TYPES.filter((f) => f !== "nuclear")) {
      for (const [kind, m] of Object.entries(CVD)) {
        const d = Math.hypot(
          ...lab(simulate(nuclear, m)).map(
            (v, i) => v - lab(simulate(theme[fuelColorVar(fuel)]!, m))[i]!,
          ),
        );
        assert.ok(d >= 15, `nuclear vs ${fuel} (${kind}): delta E ${d.toFixed(1)}`);
      }
    }
  }
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
    for (const bgVar of ["--ps-color-bg", "--ps-color-surface"]) {
      const planned = contrast(theme["--ps-state-planned-text"]!, theme[bgVar]!);
      assert.ok(planned >= 4.5, `planned text on ${bgVar}: ${planned}`);
      const field = contrast(theme["--ps-color-field"]!, theme[bgVar]!);
      assert.ok(field >= 3, `field border on ${bgVar}: ${field}`);
    }
    const signalInk = contrast(theme["--ps-color-text"]!, theme["--ps-color-signal-tint"]!);
    assert.ok(signalInk >= 4.5, `text on signal tint: ${signalInk}`);
    const warn = contrast(theme["--ps-color-warning-text"]!, theme["--ps-color-warning-bg"]!);
    assert.ok(warn >= 4.5, `warning text: ${warn}`);
    const onAccent = contrast(theme["--ps-color-on-accent"]!, theme["--ps-color-accent"]!);
    assert.ok(onAccent >= 4.5, `on-accent: ${onAccent}`);
  });
}
