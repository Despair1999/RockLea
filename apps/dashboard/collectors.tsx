import React from "react";
export type CollectorRow = {
  id: string;
  name: string;
  revoked: boolean;
  last_seen_at: string | null;
  owner_name?: string | null;
  status?: { version?: string; gameConnected?: boolean; queueDepth?: number };
};
export function collectorStatus(collector: CollectorRow, now = Date.now()) {
  if (collector.revoked) return "Zugang widerrufen";
  return collector.last_seen_at &&
    now - new Date(collector.last_seen_at).getTime() < 120000
    ? "Online"
    : "Offline";
}
export function CollectorList({
  data,
  busy,
  mutate,
}: {
  data: unknown;
  busy: boolean;
  mutate: (action: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const rows = (Array.isArray(data) ? data : []) as CollectorRow[];
  if (!rows.length) return <p>Noch kein Collector verbunden.</p>;
  return (
    <div className="collector-list">
      {rows.map((row) => (
        <article className="panel" key={row.id}>
          <h3>
            {row.name} · {collectorStatus(row)}
          </h3>
          <p>
            Version {row.status?.version ?? "unbekannt"} · Rocket League:{" "}
            {row.status?.gameConnected ? "Verbunden" : "Wartet"} · Puffer:{" "}
            {row.status?.queueDepth ?? 0}
          </p>
          <p>
            Letzter Kontakt:{" "}
            {row.last_seen_at
              ? new Date(row.last_seen_at).toLocaleString("de-DE")
              : "Noch keiner"}{" "}
            · Owner: {row.owner_name ?? "Nicht zugeordnet"} · Widerrufen:{" "}
            {row.revoked ? "Ja" : "Nein"}
          </p>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = new FormData(event.currentTarget).get("name");
              void mutate("collector.rename", { id: row.id, name });
            }}
          >
            <label>
              Name
              <input
                name="name"
                defaultValue={row.name}
                maxLength={120}
                required
              />
            </label>
            <button disabled={busy}>Umbenennen</button>
            <button
              type="button"
              disabled={busy || row.revoked}
              onClick={() => {
                if (window.confirm(`Zugang für ${row.name} widerrufen?`))
                  void mutate("collector.revoke", { id: row.id });
              }}
            >
              Zugang widerrufen
            </button>
          </form>
        </article>
      ))}
    </div>
  );
}
