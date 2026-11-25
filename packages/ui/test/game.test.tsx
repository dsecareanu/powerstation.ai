import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { render } from "preact-render-to-string";
import {
  AnimatedNumber,
  getLevel,
  LEVELS,
  Missions,
  Mystery,
  readStorage,
  ScoreBar,
  StepRail,
  useScore,
  writeStorage,
} from "../src/index";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function setStorage(value: unknown) {
  Object.defineProperty(globalThis, "localStorage", { value, configurable: true, writable: true });
}
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test("getLevel finds the level and progress", () => {
  assert.equal(getLevel(0).level.name, "Grid apprentice");
  assert.equal(getLevel(150).level.name, "Grid watcher");
  assert.equal(getLevel(200).progress, 0.5);
  const top = getLevel(5000);
  assert.equal(top.level.name, LEVELS.at(-1)!.name);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test("storage helpers never throw", () => {
  setStorage({
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
  });
  assert.equal(readStorage("k", 7), 7);
  assert.equal(writeStorage("k", 1), false);
  setStorage(undefined);
  assert.equal(readStorage("k", 7), 7);
  assert.equal(writeStorage("k", 1), false);
  setStorage(memoryStorage());
  assert.equal(writeStorage("k", { a: 1 }), true);
  assert.deepEqual(readStorage("k", null), { a: 1 });
});

test("useScore reads stored points and ignores bad values", () => {
  function Show() {
    return <span>{useScore("test:score").points}</span>;
  }
  setStorage(memoryStorage());
  writeStorage("test:score", 320);
  assert.equal(render(<Show />), "<span>320</span>");
  writeStorage("test:score", "lots");
  assert.equal(render(<Show />), "<span>0</span>");
});

test("ScoreBar shows level, points and an accessible progress bar", () => {
  const html = render(<ScoreBar points={200} />);
  assert.match(html, /Grid watcher/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="50"/);
  assert.match(html, /100 more to reach Grid balancer/);
  assert.match(render(<ScoreBar points={1200} />), /Top level reached/);
});

test("Missions counts done items and cheers when all are done", () => {
  const some = render(
    <Missions
      missions={[
        { id: "a", title: "Find a planned flow", done: true },
        { id: "b", title: "Place a data center", done: false },
      ]}
    />,
  );
  assert.match(some, /1 of 2 done/);
  assert.match(some, /\(done\)/);
  assert.doesNotMatch(some, /Nice work/);
  const all = render(
    <Missions missions={[{ id: "a", title: "A", done: true }]} cheer="Grid hero!" />,
  );
  assert.match(all, /Grid hero!/);
});

test("StepRail marks the current step", () => {
  const steps = [
    { id: "watch", label: "Watch" },
    { id: "place", label: "Place a data center" },
  ];
  const html = render(<StepRail steps={steps} current="place" />);
  assert.match(html, /ps-step--done/);
  assert.match(html, /aria-current="step"/);
  assert.doesNotMatch(html, /<button/);
  assert.match(
    render(<StepRail steps={steps} current="watch" onSelect={() => {}} />),
    /<button type="button"/,
  );
});

test("Mystery uses details and summary", () => {
  const html = render(<Mystery question="Why do prices go negative?">Too much supply.</Mystery>);
  assert.match(html, /<details/);
  assert.match(html, /<summary[^>]*>.*Why do prices go negative\?/);
  assert.match(html, /Too much supply\./);
});

test("AnimatedNumber renders the value for sight and for screen readers", () => {
  const html = render(<AnimatedNumber value={12345} />);
  assert.equal((html.match(/12,345/g) ?? []).length, 2);
  assert.match(
    render(<AnimatedNumber value={0.5} format={(n) => `${n.toFixed(1)} GW`} />),
    /0\.5 GW/,
  );
});
