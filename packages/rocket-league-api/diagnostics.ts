import { z } from "zod";
import { knownEvents } from "./parser.js";
import { metrics } from "../shared/model.js";

export type ParseIssue = {
  event: string;
  scope: "player" | "game";
  path: (string | number)[];
  issues: z.core.$ZodIssue[];
};
export type IssueReporter = (issue: ParseIssue) => void;
const safeKeys = new Set([
  "Event",
  "Data",
  "Players",
  "Game",
  "Teams",
  "PrimaryId",
  "Name",
  "TeamNum",
  "Shortcut",
  "PlaylistId",
  "TimeSeconds",
  "bOvertime",
  "bHasWinner",
  "Winner",
  "Arena",
  "bReplay",
  ...metrics,
]);
const descriptions: Record<string, string> = {
  invalid_type: "Ungültiger oder fehlender Datentyp",
  invalid_format: "Ungültiges Format",
  too_small: "Wert unter Mindestgrenze",
  too_big: "Wert über Höchstgrenze",
  invalid_value: "Ungültiger Wert",
};
export function eventLabel(value: unknown): string {
  return typeof value === "string" && knownEvents.has(value)
    ? value
    : "Unbekannt";
}
function fields(issues: z.core.$ZodIssue[], prefix: (string | number)[] = []) {
  // Never use Zod messages/inputs: union values or record keys can contain private data.
  const detail = issues
    .slice(0, 3)
    .map((issue) => {
      const path =
        [...prefix, ...issue.path]
          .slice(0, 8)
          .map((part) =>
            typeof part === "number"
              ? String(part)
              : typeof part === "string" && safeKeys.has(part)
                ? part
                : "[Feld]",
          )
          .join(".") || "Envelope";
      return `${path}: ${descriptions[issue.code] ?? "Schema ungültig"}`;
    })
    .join("; ");
  return `${detail} (${issues.length} Fehler)`;
}
export function formatIssue(issue: ParseIssue) {
  return `Teilobjekt übersprungen (${eventLabel(issue.event)}, Schema/${issue.scope === "player" ? "Spieler" : "Game"}): ${fields(issue.issues, issue.path)}`;
}
export function parserFailure(raw: string, error: unknown) {
  let event: unknown;
  try {
    const input: unknown = JSON.parse(raw);
    if (input && typeof input === "object" && "Event" in input)
      event = input.Event;
  } catch {
    /* No raw SyntaxError text. */
  }
  const reason =
    error instanceof z.ZodError
      ? `Schema: ${fields(error.issues)}`
      : error instanceof SyntaxError
        ? "JSON: Ungültige JSON-Nachricht"
        : "Parser: Interner Verarbeitungsfehler";
  return `Event verworfen (${eventLabel(event)}): ${reason}`;
}

/** Bounded coalescing: malformed ticks cannot fill the rotating log every frame. */
export function diagnosticLogger(
  write: (message: string) => void,
  clock = Date.now,
) {
  const recent = new Map<string, { at: number; suppressed: number }>();
  let windowStart = clock(),
    emitted = 0,
    dropped = 0;
  return (message: string) => {
    const now = clock(),
      previous = recent.get(message);
    if (now - windowStart >= 60000) {
      if (dropped)
        write(
          `${dropped} weitere Diagnosen wegen des Minutenlimits unterdrückt.`,
        );
      windowStart = now;
      emitted = 0;
      dropped = 0;
    }
    if (previous && now - previous.at < 60000) {
      previous.suppressed++;
      return;
    }
    if (emitted >= 20) {
      dropped++;
      return;
    }
    emitted++;
    write(
      message +
        (previous?.suppressed
          ? `; ${previous.suppressed} gleiche Meldungen seit letzter Ausgabe unterdrückt`
          : ""),
    );
    if (!previous && recent.size >= 32)
      recent.delete(recent.keys().next().value!);
    recent.set(message, { at: now, suppressed: 0 });
  };
}
