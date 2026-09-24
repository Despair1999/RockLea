import {
  parse,
  sanitize,
  statePlayers,
  knownEvents,
  matchGuid,
  ambiguousReferences,
} from "../../packages/rocket-league-api/parser.js";
import { type IssueReporter } from "../../packages/rocket-league-api/diagnostics.js";
import {
  type Member,
  type Player,
  type Envelope,
} from "../../packages/shared/model.js";

/** Only sanitized snapshots may outlive the current callback. */
export class CollectorStream {
  private observed: Player[] = [];
  private pending?: Envelope;
  private lastTick = 0;
  private replay = false;
  private goalReplay = false;
  private guid?: string;
  private blockedReferences = new Set<string>();
  constructor(private readonly report?: IssueReporter) {}
  accept(raw: string, members: Member[], now = Date.now()): Envelope[] {
    const event = parse(raw);
    if (!knownEvents.has(event.Event)) return [];
    if (event.Event === "ReplayCreated") {
      this.replay = true;
      this.pending = undefined;
      this.observed = [];
      this.guid = matchGuid(event);
      return [];
    }
    const guid = matchGuid(event);
    // Process ReplayCreated first, even without a GUID; otherwise no match work is useful.
    if (!guid) return [];
    if (
      (event.Event === "MatchCreated" && !this.replay) ||
      (this.guid !== undefined && guid !== this.guid)
    ) {
      this.observed = [];
      this.blockedReferences.clear();
      this.pending = undefined;
      this.lastTick = 0;
      this.replay = false;
      this.goalReplay = false;
    }
    this.guid = guid;
    if (this.replay) {
      if (event.Event === "MatchDestroyed") this.replay = false;
      return [];
    }
    if (event.Event === "GoalReplayStart") this.goalReplay = true;
    if (event.Event === "GoalReplayEnd" || event.Event === "RoundStarted")
      this.goalReplay = false;
    if (event.Event === "UpdateState") {
      const game = event.Data.Game as { bReplay?: unknown } | undefined;
      if (game?.bReplay === true) {
        this.goalReplay = true;
        return [];
      }
      if (game?.bReplay === false) this.goalReplay = false;
      if (this.goalReplay) return [];
      this.observed = statePlayers(event, this.report);
      this.blockedReferences = ambiguousReferences(event, this.observed);
    }
    if (
      event.Data.bReplay === true ||
      (this.goalReplay &&
        [
          "GoalScored",
          "BallHit",
          "StatfeedEvent",
          "CrossbarHit",
          "BoostPickup",
        ].includes(event.Event))
    )
      return [];
    const clean = sanitize(
      event,
      members,
      this.observed,
      (issue) => {
        if (issue.scope === "game") this.report?.(issue);
      },
      this.blockedReferences,
    );
    if (!clean.Data.MatchGuid) return [];
    if (event.Event === "UpdateState") {
      this.pending = clean;
      if (now - this.lastTick < 1000) return [];
      this.lastTick = now;
      this.pending = undefined;
    }
    const result: Envelope[] = [];
    if (
      ["MatchEnded", "MatchDestroyed"].includes(event.Event) &&
      this.pending
    ) {
      if (this.pending.Data.MatchGuid === clean.Data.MatchGuid)
        result.push(sanitize(this.pending, members, this.observed));
      this.pending = undefined;
    }
    result.push(clean);
    return result;
  }
}
