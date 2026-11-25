// Query parameters for each ENTSO-E data item. Times are UTC ms.
import { formatPeriod } from "./client";

export type Params = Record<string, string>;

const period = (startMs: number, endMs: number): Params => ({
  periodStart: formatPeriod(startMs),
  periodEnd: formatPeriod(endMs),
});

/** Physical flows (12.1.G). Flow from `from` to `to`. */
export const physicalFlowQuery = (from: string, to: string, s: number, e: number): Params => ({
  documentType: "A11",
  out_Domain: from,
  in_Domain: to,
  ...period(s, e),
});

/** Scheduled commercial exchanges (12.1.F). Restricted data. */
export const scheduledQuery = (from: string, to: string, s: number, e: number): Params => ({
  documentType: "A09",
  out_Domain: from,
  in_Domain: to,
  ...period(s, e),
});

/** Forecasted transfer capacity, day-ahead (11.1.A). */
export const capacityQuery = (from: string, to: string, s: number, e: number): Params => ({
  documentType: "A61",
  "contract_MarketAgreement.Type": "A01",
  out_Domain: from,
  in_Domain: to,
  ...period(s, e),
});

/** Actual generation per production type (16.1.B&C). Restricted data. */
export const generationQuery = (zone: string, s: number, e: number): Params => ({
  documentType: "A75",
  processType: "A16",
  in_Domain: zone,
  ...period(s, e),
});

/** Actual total load (6.1.A). Restricted data. */
export const loadQuery = (zone: string, s: number, e: number): Params => ({
  documentType: "A65",
  processType: "A16",
  outBiddingZone_Domain: zone,
  ...period(s, e),
});

/** Day-ahead total load forecast (6.1.B). */
export const loadForecastQuery = (zone: string, s: number, e: number): Params => ({
  documentType: "A65",
  processType: "A01",
  outBiddingZone_Domain: zone,
  ...period(s, e),
});

/** Day-ahead wind and solar forecast (14.1.D). Restricted data. */
export const windSolarForecastQuery = (zone: string, s: number, e: number): Params => ({
  documentType: "A69",
  processType: "A01",
  in_Domain: zone,
  ...period(s, e),
});
