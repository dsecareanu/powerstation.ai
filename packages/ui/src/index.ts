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
  HOME_AVERAGE_MW,
  HOUSEHOLD_ELECTRICITY,
  describeEnergyInHomes,
  describePowerInHomes,
  formatCount,
  formatEnergy,
  formatPower,
  homesForEnergyPerYear,
  homesForPower,
} from "./units";
