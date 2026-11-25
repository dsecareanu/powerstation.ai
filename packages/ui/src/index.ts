// @powerstation/ui public entry point.
// Styles: import "@powerstation/ui/styles.css" once per app (includes the tokens).
export { DataStateBadge, type DataStateBadgeProps } from "./components/DataStateBadge";
export { DataDelayedBanner, type DataDelayedBannerProps } from "./components/DataDelayedBanner";
export {
  AttributionPanel,
  licenseUrl,
  uniqueSources,
  type AttributionPanelProps,
  type AttributionSource,
} from "./components/AttributionPanel";
export { DATA_STATES, DATA_STATE_COPY, type DataStateCopy } from "./dataStates";
export { getFreshness, type Freshness, type FreshnessOptions } from "./freshness";
export { fuelColorVar, readToken, stateColorVar } from "./tokens";
export {
  HOUSEHOLD_EU,
  HOUSEHOLD_MWH_PER_YEAR,
  HOUSEHOLD_SOURCE,
  describeEnergyInHomes,
  describePowerInHomes,
  formatCount,
  formatEnergy,
  formatPower,
  homesForEnergyPerYear,
  homesForPower,
  householdsFor,
  type HomesTextOptions,
  type HouseholdFigure,
  type HouseholdLookup,
} from "./units";
export { AnimatedNumber, type AnimatedNumberProps } from "./components/AnimatedNumber";
export { Missions, type Mission, type MissionsProps } from "./components/Missions";
export { Mystery, type MysteryProps } from "./components/Mystery";
export { ScoreBar, type ScoreBarProps } from "./components/ScoreBar";
export { StepRail, type Step, type StepRailProps } from "./components/StepRail";
export {
  getLevel,
  LEVELS,
  SCORE_STORAGE_KEY,
  useScore,
  type Level,
  type LevelProgress,
} from "./score";
export { readStorage, writeStorage } from "./storage";
