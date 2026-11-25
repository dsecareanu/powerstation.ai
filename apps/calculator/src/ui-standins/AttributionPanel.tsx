// TODO(D): replace with @powerstation/ui

export interface Attribution {
  name: string;
  license?: string;
  text: string;
  url?: string;
}

export function AttributionPanel(props: { items: Attribution[] }) {
  return (
    <section class="panel" aria-labelledby="attribution-title">
      <h2 id="attribution-title">Data sources and licenses</h2>
      <ul class="plain-list">
        {props.items.map((a) => (
          <li key={`${a.name}|${a.license ?? ""}|${a.text}|${a.url ?? ""}`}>
            <strong>{a.name}</strong>
            {a.license ? <> ({a.license})</> : null}. {a.text}
            {a.url ? (
              <>
                {" "}
                <a href={a.url} rel="noopener noreferrer">
                  Source
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
