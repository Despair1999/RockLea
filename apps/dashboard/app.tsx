import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type Member,
  type GuildConfig,
  type MatchState,
  defaults,
} from "../../packages/shared/model.js";
import "./style.css";
import { dashboardResponse } from "./session.js";
import { CollectorList } from "./collectors.js";
import { labels } from "../../packages/shared/labels.js";
type Match = { id: string; guid: string; state: MatchState };
type Summary = {
  matches: number;
  membersTracked: number;
  memberResults: {
    wins: number;
    losses: number;
    winrate: number | null;
    totals: Record<string, number | null>;
  };
};
const nav = [
  "Übersicht",
  "Mitglieder",
  "Matches",
  "Statistiken",
  "Bestenliste",
  "Rekorde",
  "Achievements",
  "Sessions",
  "MMR",
  "Collector",
  "Einstellungen",
  "Datenschutz",
  "Protokoll",
];
function App() {
  const [me, setMe] = useState<{
      user_id: string;
      guilds: { id: string; name: string }[];
    } | null>(null),
    [loaded, setLoaded] = useState(false),
    [guild, setGuild] = useState(""),
    [tab, setTab] = useState("Übersicht"),
    [period, setPeriod] = useState("month"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null),
    [matches, setMatches] = useState<Match[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [data, setData] = useState<unknown>(null),
    [config, setConfig] = useState<GuildConfig>(defaults);
  useEffect(() => {
    fetch("/api/v1/me")
      .then(async (r) => {
        if (r.ok) {
          const m = await r.json();
          setMe(m);
          setGuild(m.guilds[0]?.id ?? "");
        }
      })
      .catch(() => setError("Backend nicht erreichbar."))
      .finally(() => setLoaded(true));
  }, []);
  async function call<T = unknown>(
    action: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const r = await fetch(`/api/v1/guild/${guild}/action`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rocklea-request": "1" },
      body: JSON.stringify({ action, args }),
    });
    return dashboardResponse<T>(r, () => {
      setMe(null);
      setGuild("");
      setSummary(null);
      setMatches([]);
      setMembers([]);
      setData(null);
      setNotice("");
    });
  }
  async function refresh() {
    if (!guild) return;
    setBusy(true);
    setError("");
    try {
      const [s, m, people, cfg] = await Promise.all([
        call<Summary>("stats.server", { period }),
        call<Match[]>("match.history"),
        call<Member[]>("member.list"),
        call<GuildConfig>("config.get"),
      ]);
      setSummary(s);
      setMatches(m);
      setMembers(people);
      setConfig(cfg);
      const action = (
        {
          Bestenliste: "leaderboard",
          Rekorde: "records",
          Achievements: "achievements",
          Sessions: "session.list",
          MMR: "mmr.history",
          Collector: "collector.list",
          Protokoll: "audit",
          Statistiken: "stats.server",
        } as Record<string, string>
      )[tab];
      setData(action ? await call(action, { period, metric: "Goals" }) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [guild, period, tab]);
  async function mutate(action: string, args: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const result = await call(action, args);
      if (
        action.startsWith("stats.") ||
        action === "leaderboard" ||
        action === "mmr.history"
      ) {
        setData(result);
        return result;
      }
      setNotice(
        action === "collector.pair"
          ? `Pairing-Code: ${(result as { code: string }).code} · 10 Minuten gültig`
          : "Änderung gespeichert.",
      );
      await refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  function form(
    action: string,
    fields: {
      name: string;
      label: string;
      type?: string;
      required?: boolean;
      options?: { value: string; label: string }[];
    }[],
    label = "Speichern",
    map?: (v: Record<string, unknown>) => Record<string, unknown>,
  ) {
    return (
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          const args: Record<string, unknown> = {};
          for (const f of fields)
            if (values[f.name] !== "")
              args[f.name] =
                f.type === "number" ? Number(values[f.name]) : values[f.name];
          try {
            void mutate(action, map ? map(args) : args);
          } catch {
            setError("Bitte einen gültigen JSON-Wert eingeben.");
          }
        }}
      >
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select name={f.name} required={f.required}>
                <option value="">Bitte wählen</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type ?? "text"}
                required={f.required}
                maxLength={10000}
              />
            )}
          </label>
        ))}
        <button disabled={busy} type="submit">
          {label}
        </button>
      </form>
    );
  }
  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.display_name,
  }));
  if (!loaded)
    return (
      <main className="login">
        <p>RockLea wird geladen …</p>
      </main>
    );
  if (!me)
    return (
      <main className="login">
        <div className="brand">
          <span className="mark">R</span> RockLea
        </div>
        <div className="eyebrow">DEIN TEAM. EURE STATISTIK.</div>
        <h1>
          Jedes Match
          <br />
          erzählt eine Geschichte.
        </h1>
        <p>
          Tore, Paraden und gemeinsame Siege. Ein Platz für die
          <br className="desktop" /> Rocket-League-Statistiken deines
          Discord-Servers.
        </p>
        <a className="button" href="/auth/login">
          Mit Discord anmelden <span>↗</span>
        </a>
        <small>Für Server-Administratoren · Nur registrierte Mitglieder</small>
        <div className="login-bottom">
          LOKAL ERFASST <span>→</span> SICHER SYNCHRONISIERT <span>→</span>{" "}
          GEMEINSAM AUSGEWERTET
        </div>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">R</span> RockLea
        </div>
        <small className="eyebrow">TEAM CONTROL</small>
        <nav>
          {nav.map((n, i) => (
            <button
              key={n}
              className={tab === n ? "selected" : ""}
              onClick={() => setTab(n)}
            >
              <span>
                {
                  ["◈", "◉", "▤", "▥", "↗", "◇", "◷", "⌁", "⌘", "⚙", "⊙", "≡"][
                    i
                  ]
                }
              </span>
              {n}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="dot" /> Discord verbunden
          <br />
          <small>Private Stats · v0.1</small>
        </div>
      </aside>
      <main>
        <header>
          <span>WORKSPACE / {tab.toUpperCase()}</span>
          <select
            aria-label="Discord-Server"
            value={guild}
            onChange={(e) => setGuild(e.target.value)}
          >
            {me.guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </header>
        <section className="heading">
          <div>
            <div className="eyebrow">
              ROCKET LEAGUE · {me.guilds.find((g) => g.id === guild)?.name}
            </div>
            <h1>{tab === "Übersicht" ? "Euer Spiel. Im Überblick." : tab}</h1>
            <p>
              {tab === "Übersicht"
                ? "Was ihr gemeinsam auf dem Feld erreicht habt."
                : "Beobachtete Daten. Klare Kontrolle."}
            </p>
          </div>
          <div className="controls">
            <select
              aria-label="Zeitraum"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {Object.entries({
                today: "Heute",
                week: "Diese Woche",
                month: "Dieser Monat",
                season: "Saison",
                all: "Gesamter Zeitraum",
              }).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              ↻ Aktualisieren
            </button>
          </div>
        </section>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {!guild && <p>Kein administrierbarer Discord-Server gefunden.</p>}
        {tab === "Übersicht" && (
          <>
            <div className="cards">
              {[
                [
                  "Matches",
                  summary?.matches,
                  "Ein gemeinsames Match zählt einmal",
                ],
                [
                  "Mitgliedssiege",
                  summary?.memberResults.wins,
                  "Ergebnisse registrierter Spieler",
                ],
                [
                  "Tore",
                  summary?.memberResults.totals.Goals,
                  "Beobachtete Tore im Zeitraum",
                ],
                [
                  "Aktive Mitglieder",
                  summary?.membersTracked,
                  "Freigegebene Spieler",
                ],
              ].map(([label, value, sub]) => (
                <article className="stat-card" key={String(label)}>
                  <span>{label}</span>
                  <strong>{value ?? "—"}</strong>
                  <small>{sub}</small>
                </article>
              ))}
            </div>
            <div className="two-columns">
              <section className="panel">
                <div className="panel-title">
                  <h2>Letzte Matches</h2>
                  <button
                    className="text-button"
                    onClick={() => setTab("Matches")}
                  >
                    Alle ansehen ↗
                  </button>
                </div>
                <MatchTable
                  timezone={config.timezone}
                  matches={matches.slice(0, 6)}
                  onClick={(id) =>
                    void call("match.info", { id })
                      .then(setData)
                      .catch(() =>
                        setError("Match konnte nicht geladen werden."),
                      )
                  }
                />
              </section>
              <section className="panel accent">
                <div className="eyebrow">VERBUNDEN SPIELEN</div>
                <h2>Dein Team ist der Anfang.</h2>
                <p>
                  Ein Collector erfasst alle registrierten Mitglieder im selben
                  Match. Für Spiele ohne diesen PC braucht mindestens ein
                  Mitspieler einen eigenen Collector.
                </p>
                <button onClick={() => setTab("Collector")}>
                  Collector verbinden ↗
                </button>
                <div className="mmr-note">
                  <span>MMR</span>
                  <strong>Nicht verfügbar</strong>
                  <small>
                    Keine verifizierte automatische Quelle verbunden.
                  </small>
                </div>
              </section>
            </div>
            <section className="panel">
              <h2>Tore in den letzten beobachteten Matches</h2>
              <div className="bars">
                {matches.length ? (
                  matches
                    .slice(0, 20)
                    .reverse()
                    .map((m, i) => {
                      const goals = m.state.game.Teams?.reduce(
                        (a, t) => a + t.Score,
                        0,
                      );
                      return (
                        <div
                          key={m.id}
                          className="bar"
                          title={`${goals ?? "Unbekannt"} Tore`}
                        >
                          <meter
                            min="0"
                            max={Math.max(
                              10,
                              ...matches.map(
                                (x) =>
                                  x.state.game.Teams?.reduce(
                                    (a, t) => a + t.Score,
                                    0,
                                  ) ?? 0,
                              ),
                            )}
                            value={goals ?? 0}
                          />
                          <span>{i + 1}</span>
                        </div>
                      );
                    })
                ) : (
                  <p className="empty">
                    Nach dem ersten Match erscheint hier euer Verlauf.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
        {tab === "Mitglieder" && (
          <>
            <section className="panel">
              <h2>Mitglied registrieren</h2>
              {form(
                "member.add",
                [
                  {
                    name: "discordId",
                    label: "Discord User-ID",
                    required: true,
                  },
                  { name: "displayName", label: "Anzeigename", required: true },
                  { name: "name", label: "Rocket-League-Name", required: true },
                  {
                    name: "platform",
                    label: "Plattform",
                    required: true,
                    options: ["Epic", "Steam", "PS4", "XboxOne", "Switch"].map(
                      (x) => ({ value: x, label: x }),
                    ),
                  },
                ],
                "Hinzufügen",
              )}
            </section>
            <section className="panel">
              <h2>Registrierte Mitglieder</h2>
              <table>
                <thead>
                  <tr>
                    <th>Mitglied</th>
                    <th>Identität</th>
                    <th>Status</th>
                    <th>Tracking</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.display_name}
                        <small>{m.discord_id}</small>
                      </td>
                      <td>
                        {m.identities.join(", ") ||
                          `${m.pending_platform} · ${m.pending_name}`}
                      </td>
                      <td>
                        {m.identities.length
                          ? "Verknüpft"
                          : "Identität ausstehend"}
                      </td>
                      <td>
                        <button
                          className="secondary"
                          onClick={() =>
                            void mutate(
                              m.active ? "member.disable" : "member.enable",
                              { id: m.id },
                            )
                          }
                        >
                          {m.active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel">
              <h2>Identität bestätigen</h2>
              {form(
                "member.link",
                [
                  {
                    name: "id",
                    label: "Mitglied",
                    required: true,
                    options: memberOptions,
                  },
                  {
                    name: "primaryId",
                    label: "PrimaryId (Platform|Uid|Splitscreen)",
                    required: true,
                  },
                ],
                "Verknüpfen",
              )}
            </section>
          </>
        )}
        {tab === "Mitglieder" && (
          <section className="panel">
            <h2>Mitglied verwalten</h2>
            {form("member.edit", [
              {
                name: "id",
                label: "Mitglied",
                options: memberOptions,
                required: true,
              },
              {
                name: "displayName",
                label: "Neuer Anzeigename",
                required: true,
              },
            ])}
            {form(
              "member.unlink",
              [
                {
                  name: "primaryId",
                  label: "Identität entfernen",
                  options: members.flatMap((m) =>
                    m.identities.map((value) => ({
                      value,
                      label: `${m.display_name} · ${value}`,
                    })),
                  ),
                  required: true,
                },
              ],
              "Verknüpfung entfernen",
            )}
            {form(
              "member.remove",
              [
                {
                  name: "discordId",
                  label: "Mitglied endgültig löschen",
                  options: members.map((m) => ({
                    value: m.discord_id,
                    label: m.display_name,
                  })),
                  required: true,
                },
              ],
              "Mitglied und persönliche Daten löschen",
            )}
          </section>
        )}
        {tab === "Matches" && (
          <section className="panel">
            <MatchTable
              timezone={config.timezone}
              matches={matches}
              onClick={(id) =>
                void call("match.info", { id })
                  .then(setData)
                  .catch(() => setError("Match konnte nicht geladen werden."))
              }
            />
          </section>
        )}
        {tab === "Statistiken" && (
          <section className="panel">
            <h2>Persönliche Statistik</h2>
            {form(
              "stats.team",
              [
                {
                  name: "first",
                  label: "Mitglied 1",
                  options: memberOptions,
                  required: true,
                },
                {
                  name: "second",
                  label: "Mitglied 2",
                  options: memberOptions,
                  required: true,
                },
                {
                  name: "third",
                  label: "Mitglied 3 (optional)",
                  options: memberOptions,
                },
              ],
              "Team auswerten",
              (v) => ({
                period,
                teamMembers: [v.first, v.second, v.third].filter(Boolean),
              }),
            )}
            <select
              aria-label="Mitglied auswählen"
              onChange={(e) =>
                void call("stats.member", {
                  memberId: e.target.value,
                  period,
                })
                  .then(setData)
                  .catch(() =>
                    setError("Bitte ein gültiges Mitglied auswählen."),
                  )
              }
            >
              <option value="">Mitglied auswählen</option>
              {memberOptions.map((m) => (
                <option value={m.value} key={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </section>
        )}
        {tab === "Collector" && (
          <section className="panel">
            <h2>Einen Gaming-PC verbinden</h2>
            <p>
              Collector starten, Pairing-Code eingeben und Rocket League neu
              starten. Der Code gilt zehn Minuten.
            </p>
            <button
              disabled={busy}
              onClick={() => void mutate("collector.pair", {})}
            >
              Pairing-Code erstellen
            </button>
            <CollectorList data={data} busy={busy} mutate={mutate} />
          </section>
        )}
        {tab === "Rekorde" && (
          <section className="panel">
            <h2>Community-Rekord einreichen</h2>
            {form(
              "record.submit",
              [
                { name: "category", label: "Kategorie", required: true },
                {
                  name: "value",
                  label: "Messwert",
                  type: "number",
                  required: true,
                },
                { name: "unit", label: "Einheit", required: true },
                { name: "evidence", label: "Nachweis-Link", type: "url" },
              ],
              "Zur Prüfung einreichen",
            )}
            {form(
              "record.approve",
              [{ name: "id", label: "Rekord-ID", required: true }],
              "Rekord bestätigen",
            )}
            {form(
              "record.reject",
              [{ name: "id", label: "Rekord-ID", required: true }],
              "Rekord ablehnen",
            )}
            {form(
              "record.edit",
              [
                { name: "id", label: "Rekord-ID", required: true },
                {
                  name: "value",
                  label: "Korrigierter Messwert",
                  type: "number",
                  required: true,
                },
              ],
              "Korrigieren (erneute Prüfung)",
            )}
            {form(
              "record.delete",
              [{ name: "id", label: "Zu löschende Rekord-ID", required: true }],
              "Rekord endgültig löschen",
            )}
          </section>
        )}
        {tab === "MMR" && (
          <section className="panel">
            <h2>Automatische MMR nicht verfügbar</h2>
            {form(
              "mmr.history",
              [
                {
                  name: "memberId",
                  label: "Verlauf für Mitglied",
                  options: memberOptions,
                  required: true,
                },
                {
                  name: "playlist",
                  label: "Playlist-ID",
                  type: "number",
                  required: true,
                },
              ],
              "Verlauf anzeigen",
            )}
            {data !== null &&
              typeof data === "object" &&
              "snapshots" in data && (
                <RatingChart
                  snapshots={
                    (
                      data as {
                        snapshots: {
                          memberId: string;
                          playlistId: number;
                          mmr: number;
                          timestamp: string;
                          source: string;
                        }[];
                      }
                    ).snapshots
                  }
                />
              )}
            <p>
              Die lokale Stats API liefert keine dokumentierte MMR. Manuelle
              Messwerte bleiben ausdrücklich als manuell gekennzeichnet.
            </p>
            {form(
              "mmr.set",
              [
                {
                  name: "memberId",
                  label: "Mitglied",
                  options: memberOptions,
                  required: true,
                },
                {
                  name: "playlist",
                  label: "Playlist-ID",
                  type: "number",
                  required: true,
                },
                {
                  name: "mmr",
                  label: "Manuelle MMR",
                  type: "number",
                  required: true,
                },
              ],
              "Messwert speichern",
            )}
          </section>
        )}
        {tab === "Einstellungen" && (
          <section className="panel">
            <h2>Server-Konfiguration</h2>
            <form
              className="settings"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate("config.set", { config });
              }}
            >
              <label>
                Zeitzone
                <input
                  value={config.timezone}
                  onChange={(e) =>
                    setConfig({ ...config, timezone: e.target.value })
                  }
                />
              </label>
              <label>
                Session-Pause in Minuten
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={config.sessionTimeout}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      sessionTimeout: Number(e.target.value),
                    })
                  }
                />
              </label>
              {(["matchPosts", "recordPosts", "achievements"] as const).map(
                (key) => (
                  <label key={key} className="check">
                    <input
                      type="checkbox"
                      checked={config[key]}
                      onChange={(e) =>
                        setConfig({ ...config, [key]: e.target.checked })
                      }
                    />
                    {
                      {
                        matchPosts: "Match-Nachrichten",
                        recordPosts: "Rekord-Nachrichten",
                        achievements: "Achievements",
                      }[key]
                    }
                  </label>
                ),
              )}
              {[
                "matchfeed",
                "stats",
                "leaderboard",
                "records",
                "recordAnnouncements",
                "sessions",
                "system",
              ].map((key) => (
                <label key={key}>
                  Discord-Kanal-ID · {key}
                  <input
                    value={config.channels[key] ?? ""}
                    onChange={(e) => {
                      const channels = { ...config.channels };
                      if (e.target.value) channels[key] = e.target.value;
                      else delete channels[key];
                      setConfig({ ...config, channels });
                    }}
                  />
                </label>
              ))}
              <button disabled={busy}>Einstellungen speichern</button>
            </form>
            <h2>Alle Optionen</h2>
            <p>
              Auch Playlistfilter, Rollen, Rekordkategorien und
              Achievement-Regeln lassen sich hier ändern. Der Wert muss gültiges
              JSON sein.
            </p>
            {form(
              "config.set",
              [
                {
                  name: "key",
                  label: "Konfigurationsschlüssel",
                  required: true,
                },
                { name: "value", label: "Wert als JSON", required: true },
              ],
              "Option speichern",
              (v) => ({
                config: { [String(v.key)]: JSON.parse(String(v.value)) },
              }),
            )}
          </section>
        )}
        {tab === "Datenschutz" && (
          <section className="panel">
            <h2>Deine Daten gehören dir.</h2>
            <p>
              Nur registrierte Mitglieder erhalten persönliche Statistiken.
              Unbekannte Gegnernamen und IDs werden vor der lokalen Speicherung
              entfernt. Anonyme Spielstände bleiben erhalten.
            </p>
            <button
              onClick={() =>
                void call("privacy.export").then((value) => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(value, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "rocklea-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              Meine Daten exportieren
            </button>
            <p>Zum endgültigen Löschen gib LÖSCHEN ein.</p>
            <input id="confirm-delete" aria-label="Löschung bestätigen" />
            <button
              className="danger"
              onClick={() => {
                if (
                  (
                    document.getElementById(
                      "confirm-delete",
                    ) as HTMLInputElement
                  ).value === "LÖSCHEN"
                )
                  void mutate("privacy.delete", { confirm: true });
              }}
            >
              Meine Daten löschen
            </button>
          </section>
        )}
        {data !== null && (
          <section className="panel">
            <h2>
              {tab === "Matches" || tab === "Übersicht"
                ? "Matchdetails"
                : "Auswertung"}
            </h2>
            <DataView value={data} />
          </section>
        )}
        <footer>
          RockLea · Nur beobachtete Daten · Zeiten: {config.timezone}
          <button
            className="text-button"
            onClick={() =>
              void fetch("/auth/logout", { method: "POST" }).then(() =>
                location.reload(),
              )
            }
          >
            Abmelden ↗
          </button>
        </footer>
      </main>
    </div>
  );
}
function RatingChart({
  snapshots,
}: {
  snapshots: {
    memberId: string;
    playlistId: number;
    mmr: number;
    timestamp: string;
    source: string;
  }[];
}) {
  if (!snapshots.length) return <p>Keine gemessenen Ratings vorhanden.</p>;
  const first = snapshots[0];
  const points = snapshots
    .filter(
      (s) =>
        s.memberId === first.memberId &&
        s.playlistId === first.playlistId &&
        s.source === first.source,
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const low = Math.min(...points.map((p) => p.mmr)),
    high = Math.max(...points.map((p) => p.mmr));
  const coordinates = points
    .map(
      (p, i) =>
        `${30 + (i * 540) / Math.max(points.length - 1, 1)},${150 - ((p.mmr - low) * 120) / Math.max(high - low, 1)}`,
    )
    .join(" ");
  return (
    <figure className="rating-chart">
      <figcaption>
        Gemessene MMR · Playlist {first.playlistId} · Quelle: {first.source} ·{" "}
        {low}–{high}
      </figcaption>
      <svg
        viewBox="0 0 600 180"
        role="img"
        aria-label={`Ratingverlauf von ${points[0].mmr} bis ${points.at(-1)!.mmr}`}
      >
        <polyline points={coordinates} />
        {points.map((p, i) => (
          <circle
            key={`${p.timestamp}-${i}`}
            cx={30 + (i * 540) / Math.max(points.length - 1, 1)}
            cy={150 - ((p.mmr - low) * 120) / Math.max(high - low, 1)}
            r="4"
          >
            <title>
              {p.timestamp}: {p.mmr}
            </title>
          </circle>
        ))}
      </svg>
      <small>
        {new Date(points[0].timestamp).toLocaleDateString("de-DE")} —{" "}
        {new Date(points.at(-1)!.timestamp).toLocaleDateString("de-DE")}
      </small>
    </figure>
  );
}
function MatchTable({
  matches,
  onClick,
  timezone,
}: {
  matches: Match[];
  onClick: (id: string) => void;
  timezone: string;
}) {
  return matches.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Match</th>
            <th>Spielstand</th>
            <th>Qualität</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id}>
              <td>
                {m.state.game.Arena ?? "Arena unbekannt"}
                <small>
                  {new Date(m.state.startedAt).toLocaleString("de-DE", {
                    timeZone: timezone,
                  })}{" "}
                  · Playlist {m.state.game.PlaylistId ?? "—"}
                </small>
              </td>
              <td className="score">
                {m.state.game.Teams?.map((t) => t.Score).join(" : ") ?? "—"}{" "}
                {m.state.game.bOvertime && <em>OT</em>}
              </td>
              <td>
                <span className="badge">{m.state.quality}</span>
              </td>
              <td>
                <button className="text-button" onClick={() => onClick(m.id)}>
                  Details ↗
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="empty">
      Noch keine Matches. Verbinde einen Collector und registriere dein Team.
    </p>
  );
}
function DataView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>Keine Daten</span>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="data-list">
        {value.map((v, i) => (
          <div key={i}>
            <DataView value={v} />
          </div>
        ))}
      </div>
    ) : (
      <p className="empty">Noch keine Einträge vorhanden.</p>
    );
  if (typeof value === "object")
    return (
      <dl>
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{labels[k] ?? k}</dt>
            <dd>
              <DataView value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <span>
      {typeof value === "boolean"
        ? value
          ? "Ja"
          : "Nein"
        : (labels[String(value)] ?? String(value))}
    </span>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
