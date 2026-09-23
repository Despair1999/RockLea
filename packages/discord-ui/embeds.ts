import { EmbedBuilder, escapeMarkdown } from "discord.js";
import {
  metrics,
  playlistName,
  type MatchState,
  type GuildConfig,
} from "../shared/model.js";
import { labels as label } from "../shared/labels.js";
const fmt = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v)
    : v === null || v === undefined
      ? "Nicht verfügbar"
      : String(v);
export function matchEmbed(state: MatchState, config: GuildConfig) {
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
  return new EmbedBuilder()
    .setColor(result === "Sieg" ? 0x46cfa4 : 0x698fff)
    .setTitle(
      `${result} · ${playlistName(state.game.PlaylistId, config)}`.slice(
        0,
        256,
      ),
    )
    .setDescription(
      `${scores}\n${escapeMarkdown(state.game.Arena ?? "Arena unbekannt")}${state.game.bOvertime ? " · Overtime" : ""}`,
    )
    .addFields(
      Object.values(state.players)
        .slice(0, 16)
        .map((p) => ({
          name: escapeMarkdown(p.Name).slice(0, 256),
          value:
            metrics
              .filter((k) => p[k] !== undefined)
              .map((k) => `${label[k]} **${p[k]}**`)
              .join(" · ")
              .slice(0, 1024) || "Keine Messwerte",
          inline: false,
        })),
    )
    .setFooter({
      text: `Datenqualität: ${state.quality} · MMR nicht verfügbar`,
    })
    .setTimestamp(new Date(state.endedAt ?? state.updatedAt));
}
function lines(value: unknown, depth = 0): string[] {
  if (value === undefined || value === null)
    return ["Noch keine Daten vorhanden."];
  if (Array.isArray(value))
    return value.flatMap((v, i) => [`**${i + 1}.**`, ...lines(v, depth)]);
  if (typeof value !== "object") return [fmt(value)];
  return Object.entries(value).flatMap(([k, v]) =>
    ["state"].includes(k)
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
    new EmbedBuilder()
      .setColor(0x698fff)
      .setTitle(title.slice(0, 256))
      .setDescription(description || "Noch keine Daten vorhanden.")
      .setFooter({ text: `RockLea · ${i + 1}/${pages.length}` }),
  );
}
