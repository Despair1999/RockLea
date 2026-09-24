import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  type EmbedBuilder,
  type SendableChannels,
  type ChatInputCommandInteraction,
} from "discord.js";
import { commandDefinitions } from "./commands.js";
import { setupButtons, setupInteraction } from "./setup.js";
import { matchEmbed, resultEmbeds } from "../../packages/discord-ui/embeds.js";
import { adminActions } from "../../packages/shared/actions.js";
import {
  type GuildConfig,
  type Member,
  type MatchState,
} from "../../packages/shared/model.js";
import { createHash } from "node:crypto";
export async function startDiscordBot(
  status: (connected: boolean) => void = () => {},
) {
  const token = process.env.DISCORD_TOKEN,
    clientId = process.env.DISCORD_CLIENT_ID,
    internalToken = process.env.INTERNAL_TOKEN;
  if (!token || !clientId || !internalToken)
    throw new Error(
      "DISCORD_TOKEN, DISCORD_CLIENT_ID und INTERNAL_TOKEN konfigurieren.",
    );
  const backend =
    process.env.BACKEND_INTERNAL_URL ??
    process.env.BACKEND_PUBLIC_URL ??
    "http://localhost:3000";
  async function api<T = unknown>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${backend}/api/v1/internal/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      throw new Error(
        "Backend-Anfrage fehlgeschlagen. Eingaben, Rechte und Verbindung prüfen.",
      );
    return r.json() as Promise<T>;
  }
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });
  const pages = new Map<
    string,
    { owner: string; embeds: EmbedBuilder[]; expires: number }
  >();
  const pagination = (id: string, index: number, count: number) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`page:${id}:${index - 1}`)
        .setLabel("◀ Zurück")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index === 0),
      new ButtonBuilder()
        .setCustomId(`page:${id}:${index + 1}`)
        .setLabel("Weiter ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index >= count - 1),
    );
  async function context(i: ChatInputCommandInteraction) {
    let admin = !!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!admin) {
      try {
        const cfg = await api<GuildConfig>("action", {
          guild: i.guildId,
          actor: { id: i.user.id, admin: false },
          action: "config.get",
        });
        const member = await i.guild!.members.fetch(i.user.id);
        admin = cfg.adminRoleIds.some((id) => member.roles.cache.has(id));
      } catch {
        /* Setup requires native ManageGuild permissions. */
      }
    }
    return { id: i.user.id, admin };
  }
  client.on(Events.InteractionCreate, async (i) => {
    try {
      if (await setupInteraction(i, api)) return;
      if (i.isAutocomplete()) {
        const members = await api<Member[]>("action", {
          guild: i.guildId,
          actor: { id: i.user.id, admin: false },
          action: "member.list",
        });
        const needle = String(i.options.getFocused()).toLowerCase();
        await i.respond(
          members
            .filter((m) => m.display_name.toLowerCase().includes(needle))
            .slice(0, 25)
            .map((m) => ({ name: m.display_name.slice(0, 100), value: m.id })),
        );
        return;
      }
      if (i.isStringSelectMenu() && i.customId.startsWith("verify:")) {
        if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await i.reply({
            content: "Server-verwalten-Rechte erforderlich.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await i.deferUpdate();
        await api("action", {
          guild: i.guildId,
          actor: { id: i.user.id, admin: true },
          action: "member.verify",
          args: { id: i.customId.slice(7), primaryId: i.values[0] },
        });
        await i.editReply({
          content: "Identität bestätigt.",
          components: [],
          embeds: [],
        });
        return;
      }
      if (i.isButton()) {
        if (i.customId.startsWith("delete:")) {
          if (i.customId !== `delete:${i.user.id}`) {
            await i.reply({
              content: "Diese Bestätigung gehört einem anderen Mitglied.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await i.deferUpdate();
          await api("action", {
            guild: i.guildId,
            actor: { id: i.user.id, admin: false },
            action: "privacy.delete",
            args: { confirm: true },
          });
          await i.editReply({
            content: "Deine gespeicherten Mitgliedsdaten wurden gelöscht.",
            components: [],
            embeds: [],
          });
          return;
        }
        const [, id, page] = i.customId.split(":");
        const data = pages.get(id);
        const index = Number(page);
        if (
          !data ||
          data.owner !== i.user.id ||
          data.expires < Date.now() ||
          !data.embeds[index]
        ) {
          await i.reply({
            content:
              "Diese Ansicht ist abgelaufen. Bitte den Befehl erneut aufrufen.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await i.update({
          embeds: [data.embeds[index]],
          components: [pagination(id, index, data.embeds.length)],
        });
        return;
      }
      if (!i.isChatInputCommand() || !i.guildId) return;
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const actor = await context(i);
      const sub = i.options.getSubcommand(false);
      const name = sub ? `${i.commandName}.${sub}` : i.commandName;
      if (adminActions.has(name) && !actor.admin) {
        await i.editReply("Dafür fehlen dir die erforderlichen Server-Rechte.");
        return;
      }
      const args: Record<string, unknown> = {};
      for (const o of sub ? (i.options.data[0].options ?? []) : i.options.data)
        if (o.value !== undefined) args[o.name] = o.value;
      if (args.discord) {
        args.discordId = args.discord;
        delete args.discord;
      }
      if (args.other) {
        args.otherDiscordId = args.other;
        delete args.other;
      }
      if (args.third) {
        args.thirdDiscordId = args.third;
        delete args.third;
      }
      if (args.primary_id) {
        args.primaryId = args.primary_id;
        delete args.primary_id;
      }
      if (name === "member.add")
        args.displayName =
          i.options.getUser("discord")?.globalName ??
          i.options.getUser("discord")?.username;
      if (name === "member.edit") {
        args.displayName = args.name;
        delete args.name;
      }
      if (name === "member.remove" && !args.discordId) {
        await i.editReply("Bitte das zu entfernende Mitglied auswählen.");
        return;
      }
      if (name === "mmr.set") {
        args.memberId = args.id;
        args.mmr = args.value;
      }
      if (name === "config.set")
        args.config = { [String(args.key)]: JSON.parse(String(args.value)) };
      if (name === "setup") {
        const existing = await api<GuildConfig>("action", {
          guild: i.guildId,
          actor,
          action: "setup",
        });
        const channels: Record<string, string> =
          !args.channel &&
          !args.create_channels &&
          Object.keys(existing.channels).length
            ? { ...existing.channels }
            : {
                matchfeed: String(args.channel ?? i.channelId),
                stats: String(args.channel ?? i.channelId),
                leaderboard: String(args.channel ?? i.channelId),
                records: String(args.channel ?? i.channelId),
                mmr: String(args.channel ?? i.channelId),
                sessions: String(args.channel ?? i.channelId),
                system: String(args.channel ?? i.channelId),
              };
        if (args.create_channels) {
          const category = await i.guild!.channels.create({
            name: "🚀 ROCKET LEAGUE",
            type: ChannelType.GuildCategory,
          });
          for (const key of Object.keys(channels)) {
            const channel = await i.guild!.channels.create({
              name: `rl-${key}`,
              type: ChannelType.GuildText,
              parent: category.id,
            });
            channels[key] = channel.id;
          }
        }
        await api("action", {
          guild: i.guildId,
          actor,
          action: "config.set",
          args: { config: { channels } },
        });
        await i.editReply({
          content:
            "🚀 RockLea einrichten: Registriere den Owner, wähle Kanäle und Einstellungen und verbinde anschließend den Collector. Du kannst jeden Schritt später erneut öffnen.",
          components: [setupButtons()],
        });
        return;
      }
      if (name === "privacy.delete") {
        await i.editReply({
          content:
            "Alle deine Mitgliedsdaten, Identitäten und persönlichen Statistiken löschen? Historische anonyme Spielstände bleiben erhalten. Bereits gepostete Discord-Nachrichten bleiben sichtbar.",
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`delete:${i.user.id}`)
                .setLabel("Meine Daten endgültig löschen")
                .setStyle(ButtonStyle.Danger),
            ),
          ],
        });
        return;
      }
      const value = await api("action", {
        guild: i.guildId,
        actor,
        action: name,
        args,
      });
      if (name === "member.detect" && actor.admin) {
        const detected = value as {
          members: Member[];
          candidates: { Name: string; PrimaryId: string }[];
        };
        const pending = detected.members.find(
          (m) =>
            m.pending_name &&
            detected.candidates.some((p) => p.Name === m.pending_name),
        );
        if (pending) {
          await i.editReply({
            content: `Identität für ${pending.display_name} auswählen (nur bei sicherer Zuordnung):`,
            components: [
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`verify:${pending.id}`)
                  .setPlaceholder("PrimaryId auswählen")
                  .addOptions(
                    detected.candidates
                      .filter((p) => p.Name === pending.pending_name)
                      .slice(0, 25)
                      .map((p) => ({
                        label: `${p.Name} · ${p.PrimaryId}`.slice(0, 100),
                        value: p.PrimaryId,
                      })),
                  ),
              ),
            ],
          });
          return;
        }
      }
      if (name === "privacy.export") {
        await i.editReply({
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(value, null, 2)), {
              name: "rocklea-export.json",
            }),
          ],
        });
        return;
      }
      if (name === "collector.pair") {
        const pair = value as { code: string };
        await i.editReply(
          `Pairing-Code: **${pair.code}**\n10 Minuten gültig, einmal verwendbar. Im Collector eingeben.`,
        );
        return;
      }
      let embeds = resultEmbeds(`Rocket League · ${i.commandName}`, value);
      if (name.startsWith("match.")) {
        const cfg = await api<GuildConfig>("action", {
          guild: i.guildId,
          actor,
          action: "config.get",
        });
        const matches = (
          Array.isArray(value) ? value : value ? [value] : []
        ) as {
          state: MatchState;
        }[];
        if (matches.length)
          embeds = matches.map((m) => matchEmbed(m.state, cfg));
      }
      pages.set(i.id, {
        owner: i.user.id,
        embeds,
        expires: Date.now() + 600000,
      });
      await i.editReply({
        embeds: [embeds[0]],
        components:
          embeds.length > 1 ? [pagination(i.id, 0, embeds.length)] : [],
      });
    } catch {
      if (i.isRepliable()) {
        const text =
          "Die Anfrage konnte nicht verarbeitet werden. Bitte prüfe Eingaben, Rechte und Backend-Verbindung.";
        if (i.deferred || i.replied)
          await i.editReply({ content: text }).catch(() => {});
        else
          await i
            .reply({ content: text, flags: MessageFlags.Ephemeral })
            .catch(() => {});
      }
    }
  });
  async function persistMessage(
    channel: SendableChannels,
    guild: string,
    key: string,
    embeds: EmbedBuilder[],
    existing: { message_id: string } | null,
  ) {
    if (existing) {
      try {
        await channel.messages.edit(existing.message_id, {
          embeds,
          allowedMentions: { parse: [] },
        });
        return;
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 10008
        ))
          throw error;
      }
    }
    const sent = await channel.send({
      embeds,
      nonce: createHash("sha256").update(key).digest("hex").slice(0, 24),
      enforceNonce: true,
      allowedMentions: { parse: [] },
    });
    await api("message", { guild, key, channel: channel.id, message: sent.id });
  }
  let boardBusy = false;
  async function refreshBoards() {
    if (boardBusy || !client.isReady()) return;
    boardBusy = true;
    try {
      for (const guild of client.guilds.cache.values()) {
        try {
          const actor = { id: client.user!.id, admin: false };
          const cfg = await api<GuildConfig>("action", {
            guild: guild.id,
            actor,
            action: "config.get",
          });
          for (const kind of ["leaderboard", "stats"] as const) {
            const channelId = cfg.channels[kind];
            if (!channelId) continue;
            const channel = await client.channels.fetch(channelId);
            if (!channel?.isSendable()) continue;
            const key =
              kind === "leaderboard"
                ? "leaderboard:Goals:week"
                : "stats:server:week";
            const values = await api("action", {
              guild: guild.id,
              actor,
              action: kind === "leaderboard" ? "leaderboard" : "stats.server",
              args: { metric: "Goals", period: "week" },
            });
            const old = await api<{ message_id: string } | null>("message", {
              guild: guild.id,
              key,
              channel: channel.id,
            });
            await persistMessage(
              channel,
              guild.id,
              key,
              resultEmbeds(
                kind === "leaderboard"
                  ? "Tore · Diese Woche"
                  : "Serverstatistik · Diese Woche",
                values,
              ).slice(0, 1),
              old,
            );
          }
        } catch {
          console.warn(
            "Persistente Serverübersicht konnte nicht aktualisiert werden; neuer Versuch folgt.",
          );
        }
      }
    } finally {
      boardBusy = false;
    }
  }
  let busy = false;
  async function worker() {
    if (busy || !client.isReady()) return;
    busy = true;
    let job: {
      id: string;
      key: string;
      guild_id: string;
      kind: string;
      payload: unknown;
      config: GuildConfig;
      match?: { id: string; state: MatchState };
    } | null = null;
    try {
      job = await api("queue/claim", {});
      if (!job) return;
      if (
        job.kind === "match" &&
        job.config.matchPosts &&
        job.config.channels.matchfeed &&
        job.match
      ) {
        const channel = await client.channels.fetch(
          job.config.channels.matchfeed,
        );
        if (!channel?.isSendable()) throw new Error("Kanal nicht verfügbar.");
        const key = `match:${job.match.id}`;
        const existing = await api<{ message_id: string } | null>("message", {
          guild: job.guild_id,
          key,
          channel: channel.id,
        });
        const embed = matchEmbed(job.match.state, job.config);
        await persistMessage(channel, job.guild_id, key, [embed], existing);
      }
      if (job.kind !== "match") {
        const category =
          job.kind === "goal"
            ? "matchfeed"
            : job.kind === "session"
              ? "sessions"
              : job.kind === "recap"
                ? "stats"
                : "records";
        const channelId =
          job.config.channels[category] ?? job.config.channels.matchfeed;
        if (channelId) {
          const channel = await client.channels.fetch(channelId);
          if (!channel?.isSendable()) throw new Error("Kanal nicht verfügbar.");
          const titles: Record<string, string> = {
            goal: "⚽ Tor",
            record: "🏆 Neuer Serverrekord",
            achievement: "◇ Achievement erreicht",
            session: "Session beendet",
            recap: "Zeitraum-Rückblick",
          };
          const embeds = resultEmbeds(
            titles[job.kind] ?? "Rocket League",
            job.payload,
          ).slice(0, 1);
          const old = await api<{ message_id: string } | null>("message", {
            guild: job.guild_id,
            key: job.key,
            channel: channel.id,
          });
          await persistMessage(channel, job.guild_id, job.key, embeds, old);
        }
      }
      await api("queue/ack", { id: job.id, ok: true });
    } catch {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "Discord-Queue wird erneut versucht.",
        }),
      );
      if (job)
        await api("queue/ack", { id: job.id, ok: false }).catch(() => {});
    } finally {
      busy = false;
    }
  }
  client.once(Events.ClientReady, () => {
    console.log("RockLea Discord verbunden.");
    status(true);
    void refreshBoards();
  });
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(
    process.env.DISCORD_GUILD_ID
      ? Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID)
      : Routes.applicationCommands(clientId),
    { body: commandDefinitions },
  );
  try {
    await client.login(token);
  } catch (error) {
    client.destroy();
    throw error;
  }
  const boardTimer = setInterval(() => void refreshBoards(), 60000);
  const timer = setInterval(() => {
    for (const [id, p] of pages) if (p.expires < Date.now()) pages.delete(id);
    void worker();
  }, 3000);
  client.on(Events.ShardDisconnect, () => status(false));
  client.on(Events.ShardResume, () => status(true));
  return {
    stop: async () => {
      clearInterval(timer);
      clearInterval(boardTimer);
      await client.destroy();
      while (busy || boardBusy) await new Promise((r) => setTimeout(r, 20));
      status(false);
    },
  };
}
