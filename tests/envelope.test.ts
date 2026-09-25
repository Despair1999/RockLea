import { describe, it, expect } from "vitest";
import { parse, knownEvents } from "../packages/rocket-league-api/parser.js";
import {
  envelopeStructure,
  parserFailure,
} from "../packages/rocket-league-api/diagnostics.js";
import { CollectorStream } from "../apps/collector/stream.js";
import { receive } from "../apps/collector/receive.js";
import { fixture, niklas } from "./fixtures.js";
import { type Member, type Envelope } from "../packages/shared/model.js";
const member: Member = {
  id: "m",
  discord_id: "1",
  display_name: "Registered",
  active: true,
  pending_name: null,
  pending_platform: null,
  identities: [niklas],
};
describe("wire envelopes", () => {
  it.each([...knownEvents])(
    "normalizes object and string Data for %s",
    (Event) => {
      const Data = { MatchGuid: "synthetic", unknown: "PRIVATE" };
      expect(parse({ Event, Data: JSON.stringify(Data) })).toEqual(
        parse({ Event, Data }),
      );
    },
  );
  it.each([
    undefined,
    null,
    [],
    2,
    true,
    "oops",
    "null",
    "[]",
    "42",
    "true",
    '"double encoded"',
    new Date(),
  ])("rejects invalid Data %#", (Data) => {
    expect(() => parse({ Event: "UpdateState", Data })).toThrow();
  });
  it("rejects malformed outer JSON and missing Event", () => {
    expect(() => parse("{")).toThrow();
    expect(() => parse({ Data: {} })).toThrow();
  });
  it("ignores all valid training events without errors or queue writes", () => {
    const logs: string[] = [];
    const events: unknown[] = [];
    for (const Event of knownEvents)
      for (const Data of [{}, JSON.stringify({ Players: [] })])
        receive(
          JSON.stringify({ Event, Data }),
          new CollectorStream(),
          [member],
          (e) => events.push(e),
          (m) => logs.push(m),
        );
    expect(logs).toEqual([]);
    expect(events).toEqual([]);
  });
  it("produces the same private final match stream with string-encoded ticks and references", () => {
    const objectStream = new CollectorStream(),
      stringStream = new CollectorStream();
    const objectEvents: Envelope[] = [],
      stringEvents: Envelope[] = [];
    fixture().forEach((e, i) => {
      objectEvents.push(
        ...objectStream.accept(JSON.stringify(e), [member], 1000 + i * 100),
      );
      stringEvents.push(
        ...stringStream.accept(
          JSON.stringify({ ...e, Data: JSON.stringify(e.Data) }),
          [member],
          1000 + i * 100,
        ),
      );
    });
    expect(stringEvents).toEqual(objectEvents);
    expect(stringEvents.length).toBeGreaterThan(0);
    expect(JSON.stringify(stringEvents)).not.toContain("opponent-secret");
    // 0.3: final match-post names are explicitly allowed; every other field remains private.
    expect(
      JSON.stringify(
        stringEvents.map((e) => ({
          ...e,
          Data: { ...e.Data, FinalScoreboard: undefined },
        })),
      ),
    ).not.toContain("RandomPlayer");
    expect(
      stringEvents.find((e) => e.Event === "MatchEnded")?.Data.FinalScoreboard,
    ).toHaveLength(4);
  });
  it("diagnoses only structural information, including unknown events", () => {
    const raw = JSON.stringify({
      Event: "PRIVATE_EVENT",
      Data: JSON.stringify({ Name: "PRIVATE_NAME", token: "PRIVATE_TOKEN" }),
    });
    const message = envelopeStructure(raw);
    expect(message).toContain("type=string");
    expect(message).toContain("jsonObject=true");
    expect(message).not.toContain("PRIVATE");
    const broken = JSON.stringify({
      Event: "UpdateState",
      Data: "PRIVATE_INVALID_JSON",
    });
    try {
      parse(broken);
    } catch (error) {
      expect(parserFailure(broken, error)).not.toContain("PRIVATE");
    }
  });
});
