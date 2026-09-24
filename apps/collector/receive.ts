import { type Member, type Envelope } from "../../packages/shared/model.js";
import {
  parserFailure,
  eventLabel,
} from "../../packages/rocket-league-api/diagnostics.js";
import { CollectorStream } from "./stream.js";
import { OutboxFullError } from "./outbox.js";

export function receive(
  raw: string,
  stream: CollectorStream,
  members: Member[],
  put: (event: Envelope) => unknown,
  report: (message: string) => void,
) {
  let events: Envelope[];
  try {
    events = stream.accept(raw, members);
  } catch (error) {
    report(parserFailure(raw, error));
    return;
  }
  for (const event of events) {
    try {
      put(event);
    } catch (error) {
      const reason =
        error instanceof OutboxFullError
          ? "Kapazitätsgrenze erreicht; Backend-Verbindung prüfen"
          : "SQLite-/Speicherfehler; Datenträger und Berechtigungen prüfen";
      report(
        `Outbox-Schreibfehler (${eventLabel(event.Event)}): ${reason}. Event nicht gespeichert.`,
      );
    }
  }
}
