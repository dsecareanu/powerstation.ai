export interface Mission {
  id: string;
  title: string;
  description?: string;
  done: boolean;
}

export interface MissionsProps {
  missions: readonly Mission[];
  title?: string;
  /** Message shown when every mission is done. Pass null to hide it. */
  cheer?: string | null;
  class?: string;
}

/** Missions list with check marks and a short cheer message when all are done. */
export function Missions({
  missions,
  title = "Missions",
  cheer = "All missions done. Nice work!",
  class: className,
}: MissionsProps) {
  const done = missions.filter((m) => m.done).length;
  const allDone = missions.length > 0 && done === missions.length;
  return (
    <section class={["ps-missions", className].filter(Boolean).join(" ")} aria-label={title}>
      <div class="ps-missions__header">
        <h3 class="ps-missions__title">{title}</h3>
        <span class="ps-missions__count">
          {done} of {missions.length} done
        </span>
      </div>
      <ul class="ps-missions__list">
        {missions.map((m) => (
          <li key={m.id} class={`ps-mission${m.done ? " ps-mission--done" : ""}`}>
            <span class="ps-mission__check" aria-hidden="true">
              {m.done ? "✓" : ""}
            </span>
            <span class="ps-mission__text">
              <span class="ps-mission__title">{m.title}</span>
              <span class="ps-visually-hidden">{m.done ? " (done)" : " (not done)"}</span>
              {m.description ? <span class="ps-mission__desc">{m.description}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p class="ps-missions__cheer" role="status">
        {allDone && cheer ? cheer : ""}
      </p>
    </section>
  );
}
