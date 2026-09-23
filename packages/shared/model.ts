import { z } from "zod";
export const metrics = [
  "Score",
  "Goals",
  "Shots",
  "Assists",
  "Saves",
  "Touches",
  "CarTouches",
  "Demos",
] as const;
export type Metric = (typeof metrics)[number];
export const primaryId = z
  .string()
  .regex(/^[^|\s]{1,32}\|[^|\s]{1,128}\|\d{1,3}$/);
export const counters = Object.fromEntries(
  metrics.map((k) => [k, z.number().int().min(0).max(1000000).optional()]),
);
export const playerSchema = z.object({
  PrimaryId: primaryId,
  Name: z.string().max(128),
  TeamNum: z.number().int().min(0).max(255),
  Shortcut: z.number().int().optional(),
  ...counters,
});
export type Player = {
  PrimaryId: string;
  Name: string;
  TeamNum: number;
  Shortcut?: number;
} & Partial<Record<Metric, number>>;
export type Member = {
  id: string;
  discord_id: string;
  display_name: string;
  active: boolean;
  pending_name: string | null;
  pending_platform: string | null;
  identities: string[];
};
export const envelope = z.object({
  Event: z.string().min(1).max(80),
  Data: z.record(z.string(), z.unknown()),
});
export type Envelope = z.infer<typeof envelope>;
export const delivery = z.object({
  id: z.string().uuid(),
  occurredAt: z.string().datetime(),
  ordinal: z.number().int().positive(),
  event: envelope,
});
export type Delivery = z.infer<typeof delivery>;
export const configSchema = z.strictObject({
  locale: z.enum(["de-DE", "en-US"]).default("de-DE"),
  timezone: z
    .string()
    .default("Europe/Berlin")
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("de", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
  matchPosts: z.boolean().default(true),
  goalPosts: z.boolean().default(false),
  recordPosts: z.boolean().default(true),
  achievements: z.boolean().default(true),
  sessionTimeout: z.number().int().min(5).max(1440).default(45),
  minimumMatches: z.number().int().min(1).default(5),
  sessionPosts: z.boolean().default(false),
  weeklyRecap: z.boolean().default(true),
  dailyRecap: z.boolean().default(false),
  monthlyRecap: z.boolean().default(false),
  recordMetrics: z
    .array(z.string().min(1).max(64))
    .default([
      ...metrics,
      "BestWinStreak",
      "DailyWins",
      "DailyWinrate",
      "SessionMatches",
      "FastestGoal",
      "StrongestBallHit",
    ]),
  disabledAchievements: z.array(z.string()).default([]),
  achievementRules: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_]{1,50}$/),
        label: z.string().min(1).max(100),
        kind: z.enum([
          "wins",
          "total",
          "match",
          "streak",
          "together",
          "overtime_wins",
        ]),
        metric: z.enum(metrics).optional(),
        threshold: z.number().positive(),
      }),
    )
    .default([
      { key: "first_win", label: "Erster Sieg", kind: "wins", threshold: 1 },
      { key: "hundred_wins", label: "100 Siege", kind: "wins", threshold: 100 },
      {
        key: "thousand_goals",
        label: "1.000 Tore",
        kind: "total",
        metric: "Goals",
        threshold: 1000,
      },
      {
        key: "ten_saves",
        label: "10 Paraden in einem Match",
        kind: "match",
        metric: "Saves",
        threshold: 10,
      },
      {
        key: "five_goals",
        label: "5 Tore in einem Match",
        kind: "match",
        metric: "Goals",
        threshold: 5,
      },
      {
        key: "ten_demos",
        label: "10 Demos in einem Match",
        kind: "match",
        metric: "Demos",
        threshold: 10,
      },
      {
        key: "ten_win_streak",
        label: "10 Siege in Folge",
        kind: "streak",
        threshold: 10,
      },
      {
        key: "hundred_together",
        label: "100 Matches gemeinsam",
        kind: "together",
        threshold: 100,
      },
      {
        key: "overtime_king",
        label: "Overtime King",
        kind: "overtime_wins",
        threshold: 25,
      },
    ]),
  trackRegisteredMembersAsOpponents: z.boolean().default(true),
  playlistIds: z.array(z.number().int()).default([]),
  channels: z.record(z.string(), z.string().regex(/^\d{5,25}$/)).default({}),
  adminRoleIds: z.array(z.string().regex(/^\d{5,25}$/)).default([]),
  seasonStart: z.string().datetime().optional(),
  retentionDays: z.number().int().min(1).max(3650).default(90),
  playlistNames: z.record(z.string(), z.string().max(80)).default({}),
});
export type GuildConfig = z.infer<typeof configSchema>;
export const defaults = configSchema.parse({});
export type Game = {
  Teams?: { TeamNum: number; Score: number }[];
  PlaylistId?: number;
  TimeSeconds?: number;
  bOvertime?: boolean;
  bHasWinner?: boolean;
  Winner?: string;
  Arena?: string;
  bReplay?: boolean;
};
export type MatchState = {
  phase: string;
  quality: "complete" | "partial" | "recovered" | "invalid";
  status: "complete" | "partial" | "aborted" | "unknown";
  startedAt: string;
  endedAt?: string;
  players: Record<string, Player>;
  game: Game;
  winner?: number;
  sawStart: boolean;
  sawEnd: boolean;
  updatedAt: string;
};
export const messages = {
  "de-DE": {
    unavailable: "Nicht verfügbar",
    denied: "Dafür fehlen dir die erforderlichen Rechte.",
    failed:
      "Die Anfrage konnte nicht verarbeitet werden. Bitte prüfe die Eingaben und versuche es erneut.",
    saved: "Gespeichert.",
    empty: "Noch keine Daten vorhanden.",
    mmr: "MMR nicht verfügbar – keine verifizierte Quelle verbunden.",
  },
  "en-US": {
    unavailable: "Unavailable",
    denied: "You do not have the required permissions.",
    failed: "Unable to process the request. Check your input and try again.",
    saved: "Saved.",
    empty: "No data yet.",
    mmr: "MMR unavailable – no verified source connected.",
  },
};
export function playlistName(id: number | undefined, config: GuildConfig) {
  return id === undefined
    ? "Playlist unbekannt"
    : (config.playlistNames[String(id)] ?? `Unknown Playlist (ID ${id})`);
}
