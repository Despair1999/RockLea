import { randomUUID } from "node:crypto";
import { type Envelope, type Delivery } from "../packages/shared/model.js";
export const niklas = "Epic|niklas-test|0",
  max = "Epic|max-test|0";
export function fixture(guid = "fixture-match"): Envelope[] {
  const state = (final: boolean) => ({
    Event: "UpdateState",
    Data: {
      MatchGuid: guid,
      Players: [
        {
          Name: "NiklasRL",
          PrimaryId: niklas,
          Shortcut: 1,
          TeamNum: 0,
          Score: final ? 721 : 0,
          Goals: final ? 3 : 0,
          Assists: final ? 1 : 0,
          Saves: final ? 2 : 0,
          Shots: final ? 6 : 0,
          Touches: final ? 41 : 0,
          CarTouches: final ? 4 : 0,
          Demos: final ? 3 : 0,
        },
        {
          Name: "MaxRL",
          PrimaryId: max,
          Shortcut: 2,
          TeamNum: 0,
          Score: final ? 530 : 0,
          Goals: final ? 1 : 0,
          Assists: final ? 2 : 0,
          Saves: final ? 3 : 0,
          Shots: final ? 4 : 0,
          Touches: final ? 36 : 0,
          CarTouches: final ? 2 : 0,
          Demos: final ? 1 : 0,
        },
        {
          Name: "RandomPlayer1",
          PrimaryId: "Epic|opponent-secret|0",
          Shortcut: 3,
          TeamNum: 1,
          Goals: 2,
          Score: 340,
        },
        {
          Name: "RandomPlayer2",
          PrimaryId: "Epic|other-secret|0",
          Shortcut: 4,
          TeamNum: 1,
          Goals: 0,
          Score: 100,
        },
      ],
      Game: {
        Teams: [
          { TeamNum: 0, Score: final ? 4 : 0 },
          { TeamNum: 1, Score: final ? 2 : 0 },
        ],
        PlaylistId: 11,
        Arena: "Stadium_P",
        bOvertime: false,
        bHasWinner: final,
        Winner: final ? "Blue" : "",
        TimeSeconds: final ? 0 : 300,
      },
    },
  });
  return [
    { Event: "MatchCreated", Data: { MatchGuid: guid } },
    { Event: "MatchInitialized", Data: { MatchGuid: guid } },
    {
      Event: "PlayerJoined",
      Data: { MatchGuid: guid, PrimaryId: niklas, PlayerName: "NiklasRL" },
    },
    state(false),
    { Event: "RoundStarted", Data: { MatchGuid: guid } },
    {
      Event: "GoalScored",
      Data: {
        MatchGuid: guid,
        Scorer: { Name: "NiklasRL", Shortcut: 1, TeamNum: 0 },
        Assister: { Name: "MaxRL", Shortcut: 2, TeamNum: 0 },
        GoalSpeed: 1500,
        GoalTime: 50,
      },
    },
    {
      Event: "BallHit",
      Data: {
        MatchGuid: guid,
        Players: [{ Name: "MaxRL", Shortcut: 2, TeamNum: 0 }],
        Ball: {
          PreHitSpeed: 100,
          PostHitSpeed: 1800,
          Location: { X: 0, Y: 100, Z: 50 },
        },
      },
    },
    {
      Event: "StatfeedEvent",
      Data: {
        MatchGuid: guid,
        EventName: "Demolish",
        Type: "Demolition",
        MainTarget: { Name: "NiklasRL", Shortcut: 1, TeamNum: 0 },
        SecondaryTarget: { Name: "RandomPlayer1", Shortcut: 3, TeamNum: 1 },
      },
    },
    state(true),
    { Event: "MatchEnded", Data: { MatchGuid: guid, WinnerTeamNum: 0 } },
    { Event: "PodiumStart", Data: { MatchGuid: guid } },
    { Event: "MatchDestroyed", Data: { MatchGuid: guid } },
  ];
}
export function deliveries(
  events = fixture(),
  start = "2026-09-22T16:00:00.000Z",
): Delivery[] {
  return events.map((event, i) => ({
    id: randomUUID(),
    occurredAt: new Date(Date.parse(start) + i * 30000).toISOString(),
    ordinal: 1,
    event,
  }));
}
