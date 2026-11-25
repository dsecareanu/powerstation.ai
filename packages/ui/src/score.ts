import { useCallback, useState } from "preact/hooks";
import { readStorage, writeStorage } from "./storage";

export interface Level {
  name: string;
  /** Points needed to reach this level. The first level must start at 0. */
  minPoints: number;
}

/** Proposal from the plan: "Grid apprentice" → … → "Grid operator". Thresholds are a first guess. */
export const LEVELS: readonly Level[] = [
  { name: "Grid apprentice", minPoints: 0 },
  { name: "Grid watcher", minPoints: 100 },
  { name: "Grid balancer", minPoints: 300 },
  { name: "Grid dispatcher", minPoints: 600 },
  { name: "Grid operator", minPoints: 1000 },
];

export interface LevelProgress {
  level: Level;
  /** null at the top level. */
  next: Level | null;
  /** 0–1 progress from this level to the next. 1 at the top level. */
  progress: number;
}

export function getLevel(points: number, levels: readonly Level[] = LEVELS): LevelProgress {
  const sorted = [...levels].sort((a, b) => a.minPoints - b.minPoints);
  let i = 0;
  while (i + 1 < sorted.length && points >= sorted[i + 1]!.minPoints) i++;
  const level = sorted[i]!;
  const next = sorted[i + 1] ?? null;
  const progress = next
    ? Math.min(1, Math.max(0, (points - level.minPoints) / (next.minPoints - level.minPoints)))
    : 1;
  return { level, next, progress };
}

export const SCORE_STORAGE_KEY = "powerstation:score";

/** Points kept in localStorage. Works (without saving) when storage is blocked. */
export function useScore(key: string = SCORE_STORAGE_KEY) {
  const [points, setPoints] = useState<number>(() => {
    const stored = readStorage<unknown>(key, 0);
    return typeof stored === "number" && Number.isFinite(stored) && stored >= 0 ? stored : 0;
  });
  const addPoints = useCallback(
    (n: number) =>
      setPoints((p) => {
        const value = Math.max(0, p + n);
        writeStorage(key, value);
        return value;
      }),
    [key],
  );
  const resetPoints = useCallback(() => {
    writeStorage(key, 0);
    setPoints(0);
  }, [key]);
  return { points, addPoints, resetPoints };
}
