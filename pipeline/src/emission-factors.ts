// Life-cycle emission factors per fuel type (gCO2eq/kWh), with their citations.
// Used for the real v1/meta/emission-factors.json and for the fixture.
//
// Sources (both checked against the PDFs on 2026-11-25):
// - IPCC AR5 WG III Annex III, Table A.III.2, "Lifecycle emissions (incl. albedo
//   effect)", median column.
// - IPCC SRREN (2011) Annex II, Table A.II.4, 50th percentile. Used for oil only:
//   AR5 Annex III has no oil row. NREL's 2021 fact sheet (NREL/FS-6A50-80580,
//   Table 1) gives the same oil value (840) and cites this table.
// No source gives lignite separately, so lignite uses the hard-coal row (decision:
// Daniel, 2026-11-25).
import type { EmissionFactorsFile } from "@powerstation/schema";

export type EmissionFactorsContent = Pick<
  EmissionFactorsFile,
  "dataset" | "unit" | "basis" | "sources" | "factors"
>;

const AR5 = "ipcc-ar5-wg3-annex-iii";
const SRREN = "ipcc-srren-annex-ii";
const AR5_TABLE = "Table A.III.2";
const SRREN_TABLE = "Table A.II.4";

const direct = (value: number, row: string, source = AR5, table = AR5_TABLE) =>
  ({ value, match: "direct", source_id: source, table, row }) as const;
const proxy = (value: number, row: string, note: string) =>
  ({ value, match: "proxy", source_id: AR5, table: AR5_TABLE, row, note }) as const;
const none = (note: string) =>
  ({ value: null, match: "none", source_id: null, table: null, row: null, note }) as const;

export const EMISSION_FACTORS: EmissionFactorsContent = {
  dataset: "emission_factors",
  unit: "gCO2eq/kWh",
  basis: "lifecycle",
  sources: [
    {
      id: AR5,
      title:
        "Climate Change 2014: Mitigation of Climate Change. Working Group III contribution to the IPCC Fifth Assessment Report. Annex III: Technology-specific Cost and Performance Parameters",
      publisher: "Intergovernmental Panel on Climate Change (IPCC)",
      year: 2014,
      url: "https://www.ipcc.ch/site/assets/uploads/2018/02/ipcc_wg3_ar5_annex-iii.pdf",
    },
    {
      id: SRREN,
      title:
        "IPCC Special Report on Renewable Energy Sources and Climate Change Mitigation. Annex II: Methodology",
      publisher: "Intergovernmental Panel on Climate Change (IPCC)",
      year: 2011,
      url: "https://www.ipcc.ch/site/assets/uploads/2018/03/Annex-II-Methodology-1.pdf",
    },
  ],
  factors: {
    nuclear: direct(12, "Nuclear"),
    lignite: proxy(820, "Coal — PC", "No lignite row in the sources. Uses pulverised hard coal."),
    hard_coal: direct(820, "Coal — PC"),
    gas: proxy(
      490,
      "Gas — Combined Cycle",
      "The source has combined-cycle plants only. Open-cycle plants emit more.",
    ),
    oil: direct(840, "Oil", SRREN, SRREN_TABLE),
    biomass: direct(230, "Biomass — dedicated"),
    waste: none("The sources have no factor for waste incineration."),
    geothermal: direct(38, "Geothermal"),
    hydro_run_of_river: direct(24, "Hydropower"),
    hydro_reservoir: direct(24, "Hydropower"),
    hydro_pumped_storage: none(
      "Storage, not a primary source. Its emissions depend on the power used for pumping.",
    ),
    wind_onshore: direct(11, "Wind onshore"),
    wind_offshore: direct(12, "Wind offshore"),
    solar: proxy(48, "Solar PV — utility", "Solar mixes rooftop (41) and utility-scale (48) PV."),
    other_renewable: none("Mixed category. The sources have no single factor."),
    other: none("Mixed category. The sources have no single factor."),
  },
};

/** License text for the real file (Daniel's proposal, adapted to two IPCC reports). */
export const EMISSION_FACTORS_LICENSE =
  "Values cited from IPCC AR5 WG III Annex III (© IPCC 2014) and IPCC SRREN Annex II (© IPCC 2011) with attribution; no IPCC figure or table is reproduced.";

export const EMISSION_FACTORS_ATTRIBUTION =
  "Emission factors: IPCC AR5 WG III Annex III, Table A.III.2 (2014), life-cycle medians; oil: IPCC SRREN Annex II, Table A.II.4 (2011), 50th percentile. Proxies and gaps are marked per fuel.";

/** The real (published) emission-factor file. */
export function emissionFactorsFile(
  schemaVersion: EmissionFactorsFile["schema_version"],
  generatedAt: string,
): EmissionFactorsFile {
  return {
    schema_version: schemaVersion,
    generated_at: generatedAt,
    mock: false,
    source: "IPCC (AR5 WG III Annex III; SRREN Annex II)",
    source_url: "https://www.ipcc.ch/",
    license: EMISSION_FACTORS_LICENSE,
    attribution: EMISSION_FACTORS_ATTRIBUTION,
    ...EMISSION_FACTORS,
  };
}
