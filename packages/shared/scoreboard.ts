import { z } from "zod";
const count = z
  .number()
  .int()
  .min(0)
  .max(1_000_000)
  .optional()
  .catch(undefined);
/** Match-post projection: deliberately no identity, platform, avatar or history. */
export const scoreboardPlayer = z.object({
  team: z.number().int().min(0).max(1),
  name: z.string().trim().min(1).max(128),
  score: count,
  goals: count,
  assists: count,
  saves: count,
  shots: count,
  demos: count,
});
export type ScoreboardPlayer = z.infer<typeof scoreboardPlayer>;
export function finalScoreboard(value: unknown): ScoreboardPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).flatMap((raw) => {
    const parsed = scoreboardPlayer.safeParse(
      raw && typeof raw === "object"
        ? {
            ...raw,
            name:
              typeof raw.name === "string" ? raw.name.slice(0, 128) : raw.name,
          }
        : raw,
    );
    return parsed.success ? [parsed.data] : [];
  });
}
export function projectScoreboard(value: unknown): ScoreboardPlayer[] {
  if (!Array.isArray(value)) return [];
  return finalScoreboard(
    value.map((p) => ({
      team: p?.TeamNum,
      name: p?.Name,
      score: p?.Score,
      goals: p?.Goals,
      assists: p?.Assists,
      saves: p?.Saves,
      shots: p?.Shots,
      demos: p?.Demos,
    })),
  );
}
