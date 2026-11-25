// Candidate bidding zones for v1, with ENTSO-E EIC codes.
//
// EIC codes: checked against the ENTSO-E Transparency Platform help page
// "Area List with Energy Identification Code (EIC)" (article 15885757676308,
// updated 2026-09-21), rows of area type BZN (bidding zone). Checked 2026-11-25.
// https://transparencyplatform.zendesk.com/hc/en-us/articles/15885757676308
//
// This is a candidate list. scripts/discover-borders.ts queries physical flows
// between every pair and keeps only zones that publish flows. Neighbours come
// from that query, not from this file.
//
// Left out on purpose:
// - MD and TR: not on ENTSO-E's open-data list (all their data is excluded).
// - RU, RU-KGD, BY, AM, AZ, GE: outside the v1 map area / not publishing to the
//   EU market.
// - CY and IS: no interconnection to another zone.
// - Virtual or historical zones (IT-North-SI, IT-GR, IT-Priolo, IT-Rossano,
//   IT-Brindisi, IT-Foggia, IT-SACOAC, IT-SACODC, IT-Malta, DK1A, NO1A, NO2A,
//   NO2NSL, DK1-NO1, DE-AT-LU, GB(IFA), GB(IFA2), GB(ElecLink), UA-BEI,
//   UA-IPS, UA-DobTPP).

export interface ZoneReference {
  /** Our zone id (schema ZoneId). */
  id: string;
  /** ENTSO-E EIC code of the bidding zone (area type BZN). */
  eic: string;
  /** Display name for the UI. */
  name: string;
  /** ISO 3166-1 alpha-2 codes (XK for Kosovo, as ENTSO-E uses). */
  countries: [string, ...string[]];
  /** Why the zone is here, when that is not obvious. */
  note?: string;
}

export const ZONE_REFERENCE: ZoneReference[] = [
  { id: "AL", eic: "10YAL-KESH-----5", name: "Albania", countries: ["AL"] },
  { id: "AT", eic: "10YAT-APG------L", name: "Austria", countries: ["AT"] },
  { id: "BA", eic: "10YBA-JPCC-----D", name: "Bosnia and Herzegovina", countries: ["BA"] },
  { id: "BE", eic: "10YBE----------2", name: "Belgium", countries: ["BE"] },
  { id: "BG", eic: "10YCA-BULGARIA-R", name: "Bulgaria", countries: ["BG"] },
  { id: "CH", eic: "10YCH-SWISSGRIDZ", name: "Switzerland", countries: ["CH"] },
  { id: "CZ", eic: "10YCZ-CEPS-----N", name: "Czechia", countries: ["CZ"] },
  { id: "DE-LU", eic: "10Y1001A1001A82H", name: "Germany–Luxembourg", countries: ["DE", "LU"] },
  { id: "DK1", eic: "10YDK-1--------W", name: "Denmark West", countries: ["DK"] },
  { id: "DK2", eic: "10YDK-2--------M", name: "Denmark East", countries: ["DK"] },
  { id: "EE", eic: "10Y1001A1001A39I", name: "Estonia", countries: ["EE"] },
  { id: "ES", eic: "10YES-REE------0", name: "Spain", countries: ["ES"] },
  { id: "FI", eic: "10YFI-1--------U", name: "Finland", countries: ["FI"] },
  { id: "FR", eic: "10YFR-RTE------C", name: "France", countries: ["FR"] },
  {
    id: "GB",
    eic: "10YGB----------A",
    name: "Great Britain",
    countries: ["GB"],
    note: "Candidate only. Kept if continental TSOs publish flows on GB borders.",
  },
  { id: "GR", eic: "10YGR-HTSO-----Y", name: "Greece", countries: ["GR"] },
  { id: "HR", eic: "10YHR-HEP------M", name: "Croatia", countries: ["HR"] },
  { id: "HU", eic: "10YHU-MAVIR----U", name: "Hungary", countries: ["HU"] },
  {
    id: "IE-SEM",
    eic: "10Y1001A1001A59C",
    name: "Ireland (single market, incl. Northern Ireland)",
    countries: ["IE"],
    note: "The SEM zone covers Ireland and Northern Ireland. Listed under IE only, so the UK country does not show SEM data.",
  },
  { id: "IT-North", eic: "10Y1001A1001A73I", name: "Italy North", countries: ["IT"] },
  { id: "IT-Centre-North", eic: "10Y1001A1001A70O", name: "Italy Centre-North", countries: ["IT"] },
  { id: "IT-Centre-South", eic: "10Y1001A1001A71M", name: "Italy Centre-South", countries: ["IT"] },
  { id: "IT-South", eic: "10Y1001A1001A788", name: "Italy South", countries: ["IT"] },
  { id: "IT-Calabria", eic: "10Y1001C--00096J", name: "Italy Calabria", countries: ["IT"] },
  { id: "IT-Sicily", eic: "10Y1001A1001A75E", name: "Italy Sicily", countries: ["IT"] },
  { id: "IT-Sardinia", eic: "10Y1001A1001A74G", name: "Italy Sardinia", countries: ["IT"] },
  { id: "LT", eic: "10YLT-1001A0008Q", name: "Lithuania", countries: ["LT"] },
  { id: "LV", eic: "10YLV-1001A00074", name: "Latvia", countries: ["LV"] },
  { id: "ME", eic: "10YCS-CG-TSO---S", name: "Montenegro", countries: ["ME"] },
  { id: "MK", eic: "10YMK-MEPSO----8", name: "North Macedonia", countries: ["MK"] },
  {
    id: "MT",
    eic: "10Y1001A1001A93C",
    name: "Malta",
    countries: ["MT"],
    note: "Candidate only. Kept if the Malta–Sicily link publishes flows.",
  },
  { id: "NL", eic: "10YNL----------L", name: "Netherlands", countries: ["NL"] },
  { id: "NO1", eic: "10YNO-1--------2", name: "Norway South-East", countries: ["NO"] },
  { id: "NO2", eic: "10YNO-2--------T", name: "Norway South-West", countries: ["NO"] },
  { id: "NO3", eic: "10YNO-3--------J", name: "Norway Central", countries: ["NO"] },
  { id: "NO4", eic: "10YNO-4--------9", name: "Norway North", countries: ["NO"] },
  { id: "NO5", eic: "10Y1001A1001A48H", name: "Norway West", countries: ["NO"] },
  { id: "PL", eic: "10YPL-AREA-----S", name: "Poland", countries: ["PL"] },
  { id: "PT", eic: "10YPT-REN------W", name: "Portugal", countries: ["PT"] },
  { id: "RO", eic: "10YRO-TEL------P", name: "Romania", countries: ["RO"] },
  { id: "RS", eic: "10YCS-SERBIATSOV", name: "Serbia", countries: ["RS"] },
  { id: "SE1", eic: "10Y1001A1001A44P", name: "Sweden North", countries: ["SE"] },
  { id: "SE2", eic: "10Y1001A1001A45N", name: "Sweden North-Central", countries: ["SE"] },
  { id: "SE3", eic: "10Y1001A1001A46L", name: "Sweden South-Central", countries: ["SE"] },
  { id: "SE4", eic: "10Y1001A1001A47J", name: "Sweden South", countries: ["SE"] },
  { id: "SI", eic: "10YSI-ELES-----O", name: "Slovenia", countries: ["SI"] },
  { id: "SK", eic: "10YSK-SEPS-----K", name: "Slovakia", countries: ["SK"] },
  { id: "UA", eic: "10Y1001C--00003F", name: "Ukraine", countries: ["UA"] },
  { id: "XK", eic: "10Y1001C--00100H", name: "Kosovo", countries: ["XK"] },
];

/** Country display names for zones.json. */
export const COUNTRY_NAMES: Record<string, string> = {
  AL: "Albania",
  AT: "Austria",
  BA: "Bosnia and Herzegovina",
  BE: "Belgium",
  BG: "Bulgaria",
  CH: "Switzerland",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  EE: "Estonia",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HR: "Croatia",
  HU: "Hungary",
  IE: "Ireland",
  IT: "Italy",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  ME: "Montenegro",
  MK: "North Macedonia",
  MT: "Malta",
  NL: "Netherlands",
  NO: "Norway",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  RS: "Serbia",
  SE: "Sweden",
  SI: "Slovenia",
  SK: "Slovakia",
  UA: "Ukraine",
  XK: "Kosovo",
};
