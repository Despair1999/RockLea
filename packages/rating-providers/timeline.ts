import { ratingChange, type Rating } from "./index.js";
import { type Observation } from "../stats-engine/stats.js";
export type SnapshotRow = {
  id: string;
  member_id: string;
  playlist_id: number;
  mmr: number | string;
  rank: string | null;
  division: string | null;
  source: string;
  confidence: "verified" | "manual";
  measured_at: Date | string;
};
export function toRating(row: SnapshotRow): Rating {
  return {
    memberId: row.member_id,
    playlistId: row.playlist_id,
    mmr: Number(row.mmr),
    rank: row.rank ?? undefined,
    division: row.division ?? undefined,
    source: row.source,
    confidence: row.confidence,
    timestamp: new Date(row.measured_at).toISOString(),
  };
}
export function timeline(snapshots: SnapshotRow[], matches: Observation[]) {
  const sorted = [...snapshots].sort(
    (a, b) =>
      new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime(),
  );
  const prior = new Map<string, SnapshotRow>();
  const changes = [];
  for (const row of sorted) {
    const key = `${row.member_id}:${row.playlist_id}:${row.source}`;
    const before = prior.get(key);
    prior.set(key, row);
    if (!before) continue;
    const a = toRating(before),
      b = toRating(row);
    const between = matches.filter(
      (m) =>
        m.member_id === row.member_id &&
        m.state.game.PlaylistId === row.playlist_id &&
        Date.parse(m.state.endedAt ?? m.state.updatedAt) >
          Date.parse(a.timestamp) &&
        Date.parse(m.state.endedAt ?? m.state.updatedAt) <=
          Date.parse(b.timestamp),
    );
    const delta = ratingChange(a, b, {
      matches: new Set(between.map((m) => m.match_id)).size,
      preMatchConfirmed: false,
      postMatchConfirmed: false,
    });
    if (delta)
      changes.push({
        memberId: row.member_id,
        playlistId: row.playlist_id,
        timestamp: b.timestamp,
        ...delta,
      });
  }
  return { snapshots: sorted.map(toRating), changes };
}
