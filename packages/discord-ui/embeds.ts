import { EmbedBuilder, escapeMarkdown } from "discord.js";
import {
  playlistName,
  type MatchState,
  type GuildConfig,
} from "../shared/model.js";
import { labels as label } from "../shared/labels.js";
import { finalScoreboard, projectScoreboard } from "../shared/scoreboard.js";
const fmt = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v)
    : v === null || v === undefined
      ? "Nicht verfügbar"
      : String(v);
export function baseEmbed(title: string, color = 0x20c8c0) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title.slice(0, 256))
    .setFooter({ text: "RockLea · Gemeinsam besser spielen" })
    .setTimestamp();
}
const text = (value: unknown, max = 128) =>
  escapeMarkdown(
    String(value ?? "—")
      .replace(/[\r\n\t]/g, " ")
      .replace(/@/g, "＠")
      .slice(0, max),
  );
export function matchEmbed(
  state: MatchState,
  config: GuildConfig,
  scoreboard?: unknown,
) {
  const scores =
    state.game.Teams?.map(
      (t) => `${t.TeamNum === 0 ? "Blau" : "Orange"} **${t.Score}**`,
    ).join(" : ") ?? "Spielstand nicht verfügbar";
  const teams = new Set(Object.values(state.players).map((p) => p.TeamNum));
  const result =
    state.winner === undefined
      ? "Ergebnis unbekannt"
      : teams.size > 1
        ? "Match beendet"
        : teams.has(state.winner)
          ? "Sieg"
          : "Niederlage";
  const board =
    scoreboard === undefined
      ? projectScoreboard(Object.values(state.players))
      : finalScoreboard(scoreboard);
  const embed = baseEmbed(
    `${result} · ${playlistName(state.game.PlaylistId, config)}`,
  )
    .setColor(
      result === "Sieg"
        ? 0x46cfa4
        : result === "Niederlage"
          ? 0xe76f72
          : 0x698fff,
    )
    .setTitle(
      `${result} · ${playlistName(state.game.PlaylistId, config)}`.slice(
        0,
        256,
      ),
    )
    .setDescription(
      `${scores}\n${escapeMarkdown(state.game.Arena ?? "Arena unbekannt")}${state.game.bOvertime ? " · Overtime" : ""}`,
    )
    .setFooter({
      text: `RockLea · ${state.quality === "complete" ? "Vollständiges Match" : "Teilweise erfasst"} · ${scoreboard === undefined ? "Registrierte Mitglieder" : "Finales Scoreboard"} · MMR nicht verfügbar`,
    })
    .setTimestamp(new Date(state.endedAt ?? state.updatedAt));
  for (const team of [0, 1]) {
    const players = board.filter((p) => p.team === team);
    if (!players.length) continue;
    const chunks: string[] = [""];
    for (const p of players) {
      const line = `**${text(p.name, board.length > 8 ? 80 : 128)}** · **${p.score ?? "—"}** Punkte\nT ${p.goals ?? "—"} · A ${p.assists ?? "—"} · P ${p.saves ?? "—"} · S ${p.shots ?? "—"}${p.demos === undefined ? "" : ` · D ${p.demos}`}\n`;
      if (chunks.at(-1)!.length + line.length > 950) chunks.push("");
      chunks[chunks.length - 1] += line;
    }
    chunks.forEach((value, i) =>
      embed.addFields({
        name: `${team === 0 ? "🔵 Blau" : "🟠 Orange"}${i ? " · Fortsetzung" : ""}`,
        value,
        inline: false,
      }),
    );
  }
  embed.addFields({
    name: "Scoreboard",
    value:
      "T Tore · A Assists · P Paraden · S Schüsse · D Demos\n— = nicht gemessen",
    inline: false,
  });
  return embed;
}
type View = Record<string, unknown>;
const obj = (v: unknown): View =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as View) : {};
const number = (v: unknown) => (v === null || v === undefined ? "—" : fmt(v));
export function statsEmbed(value: unknown, title = "Deine Statistik") {
  const v = obj(value),
    s = obj(v.stats ?? v.memberResults ?? v);
  const e = baseEmbed(`📊 ${v.member ? text(v.member, 80) : title}`);
  e.setDescription(
    `**${number(v.memberResults ? v.matches : s.matches)} Matches** · ${number(s.wins)} Siege · ${number(s.losses)} Niederlagen\n**${number(s.winrate)} %** Winrate`,
  );
  const per = obj(s.perMatch),
    total = obj(s.totals);
  const values = (source: View, keys: string[]) =>
    keys
      .filter((k) => source[k] !== undefined && source[k] !== null)
      .map((k) => `${label[k]} **${number(source[k])}**`)
      .join("\n") || "Noch keine Messwerte";
  e.addFields(
    {
      name: "⚡ Pro Match",
      value: values(per, ["Score", "Goals", "Assists", "Saves", "Shots"]),
      inline: true,
    },
    {
      name: "🏁 Gesamt",
      value: values(total, ["Score", "Goals", "Assists", "Saves", "Shots"]),
      inline: true,
    },
    { name: "🎯 Trefferquote", value: `${number(s.shooting)} %`, inline: true },
    {
      name: "🔥 Serien",
      value: `Siege aktuell **${number(s.winStreak)}** · Rekord **${number(s.bestWinStreak)}**\nNiederlagen aktuell **${number(s.lossStreak)}**`,
      inline: false,
    },
    {
      name: "⏱ Overtime",
      value: `**${number(s.overtimeMatches)}** Matches · **${number(s.otWins)}** Siege · **${number(s.otLosses)}** Niederlagen`,
      inline: false,
    },
    {
      name: "Wichscounter",
      value: `**${number(s.wichscounter)}** · Beendete 3v3-Matches mit weniger als 300 Punkten`,
      inline: false,
    },
    {
      name: "Kontakte & Extras",
      value: values(total, ["Touches", "CarTouches", "Demos"]),
      inline: false,
    },
  );
  e.setFooter({
    text: "RockLea · — = nicht gemessen · Durchschnitte nur aus gemessenen Werten",
  });
  const events = obj(v.events);
  const speeds = [
    ["fastestGoal", "Schnellstes Tor"],
    ["strongestBallHit", "Stärkster Ballkontakt"],
  ]
    .filter(([key]) => typeof events[key] === "number")
    .map(([key, name]) => `${name} **${number(events[key])} UU/s**`);
  if (speeds.length)
    e.addFields({
      name: "Beobachtete Geschwindigkeiten",
      value: speeds.join("\n"),
      inline: false,
    });
  return e;
}
/** Public record view is an allowlist. IDs, previous values and audit fields cannot leak. */
export function recordEmbeds(value: unknown, title = "🏆 Serverrekorde") {
  const v = obj(value);
  const records = Array.isArray(value)
    ? value
    : Array.isArray(v.allTime)
      ? v.allTime
      : Array.isArray(v.records)
        ? v.records
        : Array.isArray(v.automatic)
          ? v.automatic
          : v.value !== undefined
            ? [v]
            : [];
  const pages = [baseEmbed(title, 0xf2c35b)];
  for (const raw of records) {
    const r = obj(raw);
    if (r.value === undefined || r.value === null) continue;
    const category = String(r.metric ?? r.category ?? "Rekord");
    const date = new Date(
      String(r.achieved_at ?? r.achievedAt ?? r.created_at ?? ""),
    );
    const unit =
      r.unit === "count"
        ? category === "Score"
          ? "Punkte"
          : ["BestWinStreak", "SessionMatches"].includes(category)
            ? "Matches"
            : category === "DailyWins"
              ? "Siege"
              : (label[category] ?? "Anzahl")
        : r.unit === "Unreal Units/second"
          ? "UU/s"
          : text(r.unit ?? "", 24);
    const field = {
      name: text(label[category] ?? category, 100),
      value: `**${number(r.value)} ${unit}** · ${text(r.member ?? r.display_name)}\n${Number.isNaN(date.getTime()) ? "Datum nicht erfasst" : date.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`,
      inline: true,
    };
    if ((pages.at(-1)!.data.fields?.length ?? 0) >= 18)
      pages.push(baseEmbed(title, 0xf2c35b));
    pages.at(-1)!.addFields(field);
  }
  if (!pages[0].data.fields?.length)
    pages[0].setDescription(
      "Noch keine gemessenen Rekorde. Das nächste abgeschlossene Match kann den Anfang machen.",
    );
  return pages;
}
export function leaderboardEmbeds(value: unknown, title = "🏅 Rangliste") {
  const rows = Array.isArray(value) ? value : [];
  const pages = [];
  for (let start = 0; start < rows.length || start === 0; start += 15) {
    pages.push(
      baseEmbed(title).setDescription(
        rows
          .slice(start, start + 15)
          .map((raw, i) => {
            const r = obj(raw);
            return `**${start + i + 1}. ${text(r.member, 60)}** · **${number(r.value)}**${r.unit ? ` ${text(r.unit, 24)}` : ""}\n${number(r.matches)} Matches`;
          })
          .join("\n\n") || "Noch keine Ergebnisse für diesen Zeitraum.",
      ),
    );
  }
  return pages;
}
export function memberEmbeds(value: unknown) {
  const members = Array.isArray(value) ? value : [value];
  return members.length
    ? members.map((raw) => {
        const m = obj(raw);
        return baseEmbed(
          `👤 ${text(m.display_name ?? m.member ?? "Mitglied")}`,
        ).addFields(
          {
            name: "Status",
            value: m.active === false ? "Pausiert" : "Aktiv",
            inline: true,
          },
          {
            name: "Verbindung",
            value:
              Array.isArray(m.identities) && m.identities.length
                ? "Identität bestätigt"
                : "Wartet auf Zuordnung",
            inline: true,
          },
        );
      })
    : [
        baseEmbed("👥 Mitglieder").setDescription(
          "Noch keine Mitglieder registriert.",
        ),
      ];
}
export function actionEmbeds(action: string, value: unknown, title?: string) {
  if (action === "records") {
    const v = obj(value),
      manual = Array.isArray(v.manual)
        ? v.manual.filter((r) => obj(r).status === "approved")
        : [];
    return [
      ...recordEmbeds(value, title),
      ...(manual.length
        ? recordEmbeds(manual, "🏆 Bestätigte manuelle Rekorde")
        : []),
    ];
  }
  if (action.startsWith("record."))
    return [
      baseEmbed("🏆 Rekordverwaltung").setDescription(
        action === "record.submit"
          ? "Dein Rekord wurde zur Prüfung eingereicht."
          : "Die Änderung wurde gespeichert.",
      ),
    ];
  if (action === "leaderboard") return leaderboardEmbeds(value, title);
  if (action === "stats.compare")
    return Array.isArray(value) && value.length
      ? value.map((v) => statsEmbed(v))
      : [
          baseEmbed("📊 Vergleich").setDescription(
            "Bitte zwei registrierte Mitglieder auswählen.",
          ),
        ];
  if (["stats.member", "stats.server"].includes(action))
    return [statsEmbed(value, title)];
  if (["member.list", "member.add", "member.edit"].includes(action))
    return memberEmbeds(value);
  return resultEmbeds(title ?? "RockLea", value);
}
function lines(value: unknown, depth = 0): string[] {
  if (value === undefined || value === null)
    return ["Noch keine Daten vorhanden."];
  if (Array.isArray(value))
    return value.flatMap((v, i) => [`**${i + 1}.**`, ...lines(v, depth)]);
  if (typeof value !== "object") return [fmt(value)];
  return Object.entries(value).flatMap(([k, v]) =>
    [
      "state",
      "id",
      "memberId",
      "member_id",
      "matchId",
      "match_id",
      "previous",
      "PrimaryId",
      "identities",
      "guild_id",
      "reviewer",
      "calculation_version",
    ].includes(k)
      ? []
      : v && typeof v === "object"
        ? depth < 5
          ? [`**${label[k] ?? k}**`, ...lines(v, depth + 1)]
          : []
        : [`${label[k] ?? k}: **${escapeMarkdown(fmt(v))}**`],
  );
}
export function resultEmbeds(title: string, value: unknown) {
  const pages: string[] = [""];
  for (const line of lines(value)) {
    const safe = line.slice(0, 1500);
    if (pages.at(-1)!.length + safe.length > 3500) pages.push("");
    pages[pages.length - 1] += safe + "\n";
  }
  return pages.map((description, i) =>
    baseEmbed(title)
      .setDescription(description || "Noch keine Daten vorhanden.")
      .setFooter({ text: `RockLea · ${i + 1}/${pages.length}` }),
  );
}
