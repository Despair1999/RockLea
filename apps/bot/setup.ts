import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  PermissionFlagsBits,
  type Interaction,
  type GuildMember,
} from "discord.js";
import { type GuildConfig } from "../../packages/shared/model.js";
export type InternalAPI = <T = unknown>(
  path: string,
  body: unknown,
) => Promise<T>;
export function setupButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[
      ["identity", "1 · Owner"],
      ["channels", "2 · Kanäle"],
      ["preferences", "3 · Einstellungen"],
      ["pair", "4 · Collector"],
      ["finish", "Fertig"],
    ].map(([key, label]) =>
      new ButtonBuilder()
        .setCustomId(`setup:${key}`)
        .setLabel(label)
        .setStyle(
          key === "finish" ? ButtonStyle.Success : ButtonStyle.Secondary,
        ),
    ),
  );
}
const input = (id: string, label: string, value = "", required = true) =>
  new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(required)
      .setValue(value)
      .setMaxLength(200),
  );
export async function setupInteraction(i: Interaction, api: InternalAPI) {
  if (
    !(i.isButton() || i.isChannelSelectMenu() || i.isModalSubmit()) ||
    !i.customId.startsWith("setup:") ||
    !i.guildId
  )
    return false;
  const cfg = await api<GuildConfig>("action", {
    guild: i.guildId,
    actor: { id: i.user.id, admin: false },
    action: "config.get",
  });
  let admin = !!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  if (!admin) {
    const member = await i.guild?.members.fetch(i.user.id);
    admin =
      !!member &&
      cfg.adminRoleIds.some((id) =>
        (member as GuildMember).roles.cache.has(id),
      );
  }
  if (!admin) {
    await i.reply({
      content: "Für die Einrichtung fehlen dir die Server-Rechte.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const actor = { id: i.user.id, admin };
  const save = (config: Partial<GuildConfig>) =>
    api("action", {
      guild: i.guildId,
      actor,
      action: "config.set",
      args: { config },
    });
  const page = i.customId.slice(6);
  if (i.isButton()) {
    if (page === "identity") {
      await i.showModal(
        new ModalBuilder()
          .setCustomId("setup:identity-save")
          .setTitle("Owner registrieren")
          .addComponents(
            input("discord", "Discord User-ID", i.user.id),
            input("name", "Rocket-League-Name"),
            input("platform", "Plattform (Epic oder Steam)", "Epic"),
            input("primary", "PrimaryId (optional)", "", false),
          ),
      );
      return true;
    }
    if (page === "preferences") {
      await i.showModal(
        new ModalBuilder()
          .setCustomId("setup:preferences-save")
          .setTitle("Server-Einstellungen")
          .addComponents(
            input("timezone", "Zeitzone", cfg.timezone),
            input(
              "timeout",
              "Session-Pause (Minuten)",
              String(cfg.sessionTimeout),
            ),
            input("locale", "Sprache (de-DE oder en-US)", cfg.locale),
            input(
              "roles",
              "Admin-Rollen-IDs, mit Komma getrennt",
              cfg.adminRoleIds.join(","),
              false,
            ),
          ),
      );
      return true;
    }
    if (page === "channels" || page === "channels-extra") {
      const keys =
        page === "channels"
          ? ["matchfeed", "stats", "records", "leaderboard"]
          : ["mmr", "sessions", "system"];
      await i.reply({
        content:
          "Wähle bestehende Textkanäle. Mehrere Bereiche dürfen denselben Kanal verwenden.",
        flags: MessageFlags.Ephemeral,
        components: [
          ...keys.map((key) =>
            new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId(`setup:channel-${key}`)
                .setPlaceholder(key)
                .setChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setMinValues(1)
                .setMaxValues(1),
            ),
          ),
          page === "channels"
            ? new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("setup:channels-extra")
                  .setLabel("MMR / Sessions / System")
                  .setStyle(ButtonStyle.Secondary),
              )
            : setupButtons(),
        ],
      });
      return true;
    }
    if (page === "pair") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const pair = await api<{ code: string }>("action", {
        guild: i.guildId,
        actor,
        action: "collector.pair",
      });
      await i.editReply({
        content: `Collector starten und den Code **${pair.code}** eingeben. Der Code gilt zehn Minuten und nur einmal.`,
        components: [setupButtons()],
      });
      return true;
    }
    if (page === "finish") {
      await i.reply({
        content:
          "✅ Einrichtung gespeichert. Rocket League nach Aktivierung der Stats API neu starten, weitere Mitglieder mit /member add registrieren und ein Match spielen. /status prüft die Verbindungen.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
  }
  if (i.isChannelSelectMenu()) {
    await i.deferUpdate();
    await save({ channels: { ...cfg.channels, [page.slice(8)]: i.values[0] } });
    await i.followUp({
      content: "Kanal gespeichert.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (i.isModalSubmit()) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (page === "identity-save") {
      const name = i.fields.getTextInputValue("name");
      const member = await api<{ id: string }>("action", {
        guild: i.guildId,
        actor,
        action: "member.add",
        args: {
          discordId: i.fields.getTextInputValue("discord"),
          displayName: name,
          name,
          platform: i.fields.getTextInputValue("platform"),
        },
      });
      const primary = i.fields.getTextInputValue("primary");
      if (primary)
        await api("action", {
          guild: i.guildId,
          actor,
          action: "member.link",
          args: { id: member.id, primaryId: primary },
        });
    }
    if (page === "preferences-save")
      await save({
        timezone: i.fields.getTextInputValue("timezone"),
        sessionTimeout: Number(i.fields.getTextInputValue("timeout")),
        locale: i.fields.getTextInputValue("locale") as GuildConfig["locale"],
        adminRoleIds: i.fields
          .getTextInputValue("roles")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
    await i.editReply({
      content: "Schritt gespeichert. Du kannst mit der Einrichtung fortfahren.",
      components: [setupButtons()],
    });
    return true;
  }
  return false;
}
