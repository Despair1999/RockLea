import {
  parse,
  sanitize,
  statePlayers,
  knownEvents,
} from "../../packages/rocket-league-api/parser.js";
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
  accept(raw: string, members: Member[], now = Date.now()): Envelope[] {
    const event = parse(raw);
    if (!knownEvents.has(event.Event)) return [];
    if (event.Event === "MatchCreated") {
      this.observed = [];
      this.pending = undefined;
      this.lastTick = 0;
      this.replay = false;
    }
    if (event.Event === "ReplayCreated") {
      this.replay = true;
      this.pending = undefined;
      return [];
    }
    if (event.Event === "UpdateState") {
      if ((event.Data.Game as { bReplay?: boolean } | undefined)?.bReplay) {
        this.replay = true;
        this.pending = undefined;
        return [];
      }
      this.observed = statePlayers(event);
    }
    if (this.replay) {
      if (event.Event === "MatchDestroyed") this.replay = false;
      return [];
    }
    const clean = sanitize(event, members, this.observed);
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
