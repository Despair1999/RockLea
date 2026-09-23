export type Rating = {
  memberId: string;
  playlistId: number;
  mmr: number;
  rank?: string;
  division?: string;
  timestamp: string;
  source: string;
  confidence: "verified" | "manual";
};
export interface RatingProvider {
  getCapabilities(): {
    available: boolean;
    automatic: boolean;
    reason?: string;
  };
  getPlayerRatings(primaryId: string): Promise<Rating[]>;
  getRating(primaryId: string, playlist: number): Promise<Rating | null>;
}
export class NullRatingProvider implements RatingProvider {
  getCapabilities() {
    return {
      available: false,
      automatic: false,
      reason:
        "Die offizielle Stats API dokumentiert keine MMR. Es ist kein verifizierter externer Provider konfiguriert.",
    };
  }
  async getPlayerRatings() {
    return [];
  }
  async getRating() {
    return null;
  }
}
export class ManualRatingProvider implements RatingProvider {
  constructor(private read: (id: string) => Promise<Rating[]>) {}
  getCapabilities() {
    return { available: true, automatic: false };
  }
  getPlayerRatings(id: string) {
    return this.read(id);
  }
  async getRating(id: string, playlist: number) {
    return (
      (await this.read(id))
        .filter((r) => r.playlistId === playlist)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null
    );
  }
}
/** A snapshot difference alone cannot prove a match-specific delta. */
export function ratingChange(
  before: Rating,
  after: Rating,
  coverage: {
    matches: number;
    preMatchConfirmed: boolean;
    postMatchConfirmed: boolean;
  },
) {
  if (
    before.memberId !== after.memberId ||
    before.playlistId !== after.playlistId ||
    before.source !== after.source ||
    Date.parse(after.timestamp) <= Date.parse(before.timestamp)
  )
    return null;
  const exact =
    coverage.matches === 1 &&
    coverage.preMatchConfirmed &&
    coverage.postMatchConfirmed &&
    before.confidence === "verified" &&
    after.confidence === "verified";
  return {
    delta: after.mmr - before.mmr,
    before: before.mmr,
    after: after.mmr,
    label: exact ? "Match MMR Delta" : "MMR change since last measurement",
    matchesSincePreviousSnapshot: coverage.matches,
    source: after.source,
  };
}
