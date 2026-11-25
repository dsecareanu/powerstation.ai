// Builders for small synthetic ENTSO-E XML documents. No real ENTSO-E data is used.
export interface PeriodSpec {
  start: string;
  end: string;
  res: string;
  /** [position, quantity] pairs. */
  points: [number, number][];
}

export interface SeriesSpec {
  curve?: string;
  inDomain?: string;
  outDomain?: string;
  inBz?: string;
  outBz?: string;
  contract?: string;
  psr?: string;
  unit?: string;
  periods: PeriodSpec[];
}

const NS = "urn:test:synthetic:document:1:0";

function seriesXml(s: SeriesSpec, i: number): string {
  const tag = (name: string, v: string | undefined) =>
    v === undefined ? "" : `<${name} codingScheme="A01">${v}</${name}>`;
  const periods = s.periods
    .map(
      (p) => `<Period>
  <timeInterval><start>${p.start}</start><end>${p.end}</end></timeInterval>
  <resolution>${p.res}</resolution>
  ${p.points.map(([pos, q]) => `<Point><position>${pos}</position><quantity>${q}</quantity></Point>`).join("\n  ")}
</Period>`,
    )
    .join("\n");
  return `<TimeSeries>
  <mRID>${i + 1}</mRID>
  ${tag("in_Domain.mRID", s.inDomain)}
  ${tag("out_Domain.mRID", s.outDomain)}
  ${tag("inBiddingZone_Domain.mRID", s.inBz)}
  ${tag("outBiddingZone_Domain.mRID", s.outBz)}
  ${s.contract ? `<contract_MarketAgreement.type>${s.contract}</contract_MarketAgreement.type>` : ""}
  <quantity_Measure_Unit.name>${s.unit ?? "MAW"}</quantity_Measure_Unit.name>
  <curveType>${s.curve ?? "A01"}</curveType>
  ${s.psr ? `<MktPSRType><psrType>${s.psr}</psrType></MktPSRType>` : ""}
  ${periods}
</TimeSeries>`;
}

export function docXml(series: SeriesSpec[], root = "Publication_MarketDocument"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${NS}">
  <mRID>test</mRID>
  ${series.map(seriesXml).join("\n")}
</${root}>`;
}

export function ackXml(code: string, text = "No matching data found"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Acknowledgement_MarketDocument xmlns="urn:test:synthetic:ack:1:0">
  <mRID>test</mRID>
  <Reason><code>${code}</code><text>${text}</text></Reason>
</Acknowledgement_MarketDocument>`;
}

/** A PT60M period with one value per hour. */
export function hourlyPeriod(startMs: number, endMs: number, value: (hourIndex: number) => number) {
  const n = Math.round((endMs - startMs) / 3_600_000);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";
  return {
    start: iso(startMs),
    end: iso(endMs),
    res: "PT60M",
    points: Array.from({ length: n }, (_, i) => [i + 1, value(i)] as [number, number]),
  };
}

/** Parses a yyyyMMddHHmm request parameter into ms. */
export function parsePeriodParam(s: string): number {
  return Date.UTC(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
    Number(s.slice(10, 12)),
  );
}
