import type { aggregate } from "../stats-engine/stats.js";
import { baseEmbed, statsEmbed } from "./embeds.js";
import { escapeMarkdown } from "discord.js";
export type MemberBoard = {
  memberId: string;
  member: string;
  stats: ReturnType<typeof aggregate>;
};
export function memberBoard(row: MemberBoard) {
  return statsEmbed(row).setTitle(
    `📊 ${escapeMarkdown(row.member).slice(0, 180)} · Allzeit`,
  );
}
export function lifetimeLeaderboard(rows: MemberBoard[]) {
  const metrics = [
    ["Goals", "⚽ Tore"],
    ["Saves", "🧤 Paraden"],
    ["Score", "💯 Score · Summe"],
    ["Shots", "🎯 Schüsse"],
    ["wichscounter", "Abwichscounter"],
    ["matches", "🎮 Spiele"],
  ];
  const pages = [];
  const value = (r: MemberBoard, k: string) =>
    k === "matches"
      ? r.stats.matches
      : k === "wichscounter"
        ? r.stats.wichscounter
        : r.stats.totals[k];
  for (let offset = 0; offset < Math.max(rows.length, 1); offset += 10) {
    const e = baseEmbed(
      `🏅 Bestenliste · Allzeit${offset ? ` · ${offset + 1}–${Math.min(offset + 10, rows.length)}` : ""}`,
    );
    e.setDescription(
      "Gesamtwerte aus beendeten Spielen mit bekanntem Ergebnis.",
    );
    for (const [key, title] of metrics) {
      const ranked = rows
        .filter((r) => value(r, key) !== null)
        .sort(
          (a, b) =>
            Number(value(b, key)) - Number(value(a, key)) ||
            a.member.localeCompare(b.member) ||
            a.memberId.localeCompare(b.memberId),
        );
      e.addFields({
        name: title,
        value:
          ranked
            .slice(offset, offset + 10)
            .map(
              (r, i) =>
                `${offset + i + 1}. **${escapeMarkdown(r.member.replace(/[\r\n@]/g, " ").slice(0, 32))}** · ${Number(value(r, key)).toLocaleString("de-DE")}`,
            )
            .join("\n") || "Noch keine Messwerte",
        inline: true,
      });
    }
    pages.push(e);
  }
  return pages;
}
/** Existing installs need no manual channel configuration. Never mix notices into the table. */
export async function splitRecordChannels(
  channels: Record<string, string>,
  ensure: (name: string) => Promise<string>,
) {
  if (!channels.records) return channels;
  const announcements =
    channels.recordAnnouncements ?? (await ensure("rl-records"));
  const records =
    channels.records === announcements
      ? await ensure("rl-rekordtabelle")
      : channels.records;
  return { ...channels, records, recordAnnouncements: announcements };
}
