import type { ZonesFile } from "@powerstation/schema";

export interface Place {
  zone: string;
  country: string;
}

/** Pick a country; if it has more than one grid zone, pick the zone too. */
export function ZonePicker(props: {
  idPrefix: string;
  zones: ZonesFile;
  value: Place;
  onChange: (p: Place) => void;
}) {
  const { idPrefix, zones, value, onChange } = props;
  const countries = [...zones.countries].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const country = zones.countries.find((c) => c.code === value.country);
  const zone = zones.zones.find((z) => z.id === value.zone);
  const zoneName = (id: string) => zones.zones.find((z) => z.id === id)?.name ?? id;

  return (
    <div class="field-row">
      <div class="field">
        <label for={`${idPrefix}-country`}>Country</label>
        <select
          id={`${idPrefix}-country`}
          value={value.country}
          onChange={(e) => {
            const c = zones.countries.find((x) => x.code === e.currentTarget.value);
            if (c) onChange({ country: c.code, zone: c.zones[0] });
          }}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {country && country.zones.length > 1 ? (
        <div class="field">
          <label for={`${idPrefix}-zone`}>Grid zone</label>
          <select
            id={`${idPrefix}-zone`}
            value={value.zone}
            onChange={(e) => onChange({ country: value.country, zone: e.currentTarget.value })}
          >
            {country.zones.map((id) => (
              <option key={id} value={id}>
                {zoneName(id)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {zone && zone.countries.length > 1 ? (
        <p class="hint">
          The grid zone {zone.name} covers {zone.countries.length} countries. Results are for the
          whole zone.
        </p>
      ) : null}
    </div>
  );
}
