import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { LAYERS } from "../src/layers";

// CIELAB lightness and hue of a #rrggbb colour (D65).
function lab(hex: string): { l: number; c: number; h: number } {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);
  return {
    l: 116 * fy - 16,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

test("no layer colour is violet or lavender", () => {
  for (const layer of Object.values(LAYERS)) {
    for (const bin of layer.bins) {
      const { c, h } = lab(bin.color);
      assert.ok(c < 15 || h < 270 || h > 335, `${layer.id} ${bin.color}: hue ${h.toFixed(0)}`);
    }
  }
});

test("renewables: each bin is lighter than the one before (more renewables = lighter)", () => {
  const l = LAYERS.renewables.bins.map((b) => lab(b.color).l);
  for (let i = 1; i < l.length; i++) assert.ok(l[i]! > l[i - 1]!, `bin ${i}`);
});

test("no ramp colour is the brand signal yellow", () => {
  const css = readFileSync(
    join(import.meta.dirname, "../../../packages/ui/src/tokens.css"),
    "utf8",
  );
  const signal = css.match(/--ps-color-signal:\s*(#[0-9a-fA-F]{6})/)![1]!.toLowerCase();
  for (const layer of Object.values(LAYERS))
    for (const bin of layer.bins) assert.notEqual(bin.color.toLowerCase(), signal, layer.id);
});

test("imports and exports: both arms get darker away from 'about balanced'", () => {
  const l = LAYERS.netImport.bins.map((b) => lab(b.color).l);
  const mid = LAYERS.netImport.bins.findIndex((b) => b.label === "about balanced");
  for (let i = mid; i > 0; i--) assert.ok(l[i - 1]! < l[i]!, `export bin ${i - 1}`);
  for (let i = mid; i < l.length - 1; i++) assert.ok(l[i + 1]! < l[i]!, `import bin ${i + 1}`);
});

test("expected demand: each bin is darker than the one before", () => {
  const l = LAYERS.loadForecast.bins.map((b) => lab(b.color).l);
  for (let i = 1; i < l.length; i++) assert.ok(l[i]! < l[i - 1]!, `bin ${i}`);
});

test("expected demand is labelled as a forecast, never as measured", () => {
  const L = LAYERS.loadForecast;
  assert.match(L.name, /forecast/i);
  assert.match(L.explain, /not a measurement/);
});
