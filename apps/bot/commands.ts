import {
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
  type SlashCommandStringOption,
} from "discord.js";
type Options = SlashCommandBuilder | SlashCommandSubcommandBuilder;
function text(
  o: Options,
  name: string,
  description: string,
  required = false,
  autocomplete = false,
) {
  o.addStringOption((v) =>
    v
      .setName(name)
      .setDescription(description)
      .setRequired(required)
      .setAutocomplete(autocomplete),
  );
}
function user(o: Options, name = "discord") {
  o.addUserOption((v) => v.setName(name).setDescription("Discord-Mitglied"));
}
function member(o: Options) {
  text(o, "id", "Mitglied-ID (Autocomplete)", true, true);
}
function period(o: Options) {
  o.addStringOption((v) => {
    v.setName("period").setDescription("Zeitraum");
    for (const p of [
      "all",
      "today",
      "yesterday",
      "week",
      "month",
      "7days",
      "30days",
      "season",
    ])
      v.addChoices({ name: p, value: p });
    return v;
  });
  o.addIntegerOption((v) =>
    v.setName("playlist").setDescription("Playlist-ID"),
  );
}
function group(
  name: string,
  subcommands: Record<string, (s: SlashCommandSubcommandBuilder) => void>,
) {
  const b = new SlashCommandBuilder()
    .setName(name)
    .setDescription(`Rocket League ${name}`)
    .setDMPermission(false);
  for (const [sub, options] of Object.entries(subcommands))
    b.addSubcommand((s) => {
      s.setName(sub).setDescription(`${name} ${sub}`);
      options(s);
      return s;
    });
  return b;
}
const empty = () => {};
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Server einrichten und Kanäle auswählen")
    .setDMPermission(false)
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Zielkanal; Standard: aktueller Kanal"),
    )
    .addBooleanOption((o) =>
      o
        .setName("create_channels")
        .setDescription("Rocket-League-Kategorie und Kanäle erstellen"),
    ),
  group("config", {
    get: empty,
    set: (s) => {
      text(s, "key", "Konfigurationsschlüssel", true);
      text(s, "value", "Wert als JSON (z. B. true oder 45)", true);
    },
  }),
  group("member", {
    me: (s) => {
      text(s, "name", "Dein Rocket-League-Name", true);
      s.addStringOption((v) =>
        v
          .setName("platform")
          .setDescription("Plattform")
          .setRequired(true)
          .addChoices(
            { name: "Epic", value: "Epic" },
            { name: "Steam", value: "Steam" },
          ),
      );
    },
    add: (s) => {
      s.addUserOption((v) =>
        v
          .setName("discord")
          .setDescription("Discord-Mitglied")
          .setRequired(true),
      );
      text(s, "name", "Rocket-League-Anzeigename", true);
      s.addStringOption((v) =>
        v
          .setName("platform")
          .setDescription("Plattform")
          .setRequired(true)
          .addChoices(
            ...["Epic", "Steam", "PS4", "XboxOne", "Switch", "PsyNet"].map(
              (v) => ({ name: v, value: v }),
            ),
          ),
      );
    },
    list: empty,
    info: (s) => user(s),
    detect: empty,
    edit: (s) => {
      member(s);
      text(s, "name", "Neuer Anzeigename", true);
    },
    enable: member,
    disable: member,
    remove: (s) => user(s),
    link: (s) => {
      member(s);
      text(s, "primary_id", "Platform|Uid|Splitscreen", true);
    },
    verify: (s) => {
      member(s);
      text(s, "primary_id", "Bestätigte PrimaryId", true);
    },
    unlink: (s) => text(s, "primary_id", "PrimaryId", true),
  }),
  group("stats", {
    team: (s) => {
      user(s);
      user(s, "other");
      user(s, "third");
      period(s);
    },
    member: (s) => {
      user(s);
      period(s);
    },
    server: period,
    compare: (s) => {
      user(s);
      user(s, "other");
      period(s);
    },
  }),
  group("match", {
    latest: empty,
    history: empty,
    info: (s) => text(s, "id", "Match-ID", true),
  }),
  group("collector", {
    pair: (s) => user(s),
    list: empty,
    status: empty,
    rename: (s) => {
      text(s, "id", "Collector-ID", true);
      text(s, "name", "Name", true);
    },
    revoke: (s) => text(s, "id", "Collector-ID", true),
  }),
  group("session", { current: period, latest: period, list: period }),
  group("mmr", {
    history: (s) => {
      user(s);
      s.addIntegerOption((v) =>
        v.setName("playlist").setDescription("Playlist-ID"),
      );
    },
    compare: (s) => {
      user(s);
      user(s, "other");
      s.addIntegerOption((v) =>
        v.setName("playlist").setDescription("Playlist-ID"),
      );
    },
    set: (s) => {
      member(s);
      s.addIntegerOption((v) =>
        v.setName("playlist").setDescription("Playlist-ID").setRequired(true),
      );
      s.addNumberOption((v) =>
        v
          .setName("value")
          .setDescription("Manuell gemessene MMR")
          .setRequired(true),
      );
    },
  }),
  group("record", {
    submit: (s) => {
      text(s, "category", "Rekordkategorie", true);
      s.addNumberOption((v) =>
        v.setName("value").setDescription("Messwert").setRequired(true),
      );
      text(s, "unit", "Einheit", true);
      text(s, "evidence", "Video-/Replay-Link");
    },
    approve: (s) => text(s, "id", "Rekord-ID", true),
    reject: (s) => text(s, "id", "Rekord-ID", true),
    delete: (s) => text(s, "id", "Rekord-ID", true),
    edit: (s) => {
      text(s, "id", "Rekord-ID", true);
      s.addNumberOption((v) =>
        v
          .setName("value")
          .setDescription("Korrigierter Wert")
          .setRequired(true),
      );
    },
  }),
  group("privacy", { export: empty, delete: empty }),
  ...["status", "health", "rank", "records", "achievements"].map((name) =>
    new SlashCommandBuilder()
      .setName(name)
      .setDescription(`Rocket League ${name}`)
      .setDMPermission(false),
  ),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Bestenliste anzeigen")
    .setDMPermission(false)
    .addStringOption((v: SlashCommandStringOption) =>
      v
        .setName("metric")
        .setDescription("Statistik")
        .addChoices(
          ...[
            "Goals",
            "Assists",
            "Saves",
            "Score",
            "Demos",
            "wins",
            "winrate",
            "matches",
            "streak",
            "GoalsPerMatch",
            "FastestGoal",
            "StrongestBallHit",
            "MMR",
          ].map((v) => ({ name: v, value: v })),
        ),
    )
    .addStringOption((v) =>
      v
        .setName("period")
        .setDescription("Zeitraum")
        .addChoices(
          ...["all", "today", "week", "month", "season"].map((v) => ({
            name: v,
            value: v,
          })),
        ),
    ),
];
export const commandDefinitions = commands.map((c) => c.toJSON());
