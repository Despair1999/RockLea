import { mkdirSync, writeFileSync } from "node:fs";
import {
  matchEmbed,
  statsEmbed,
  recordEmbeds,
  leaderboardEmbeds,
} from "../packages/discord-ui/embeds.js";
import { defaults, type MatchState } from "../packages/shared/model.js";
import { aggregate } from "../packages/stats-engine/stats.js";
import { advance } from "../packages/stats-engine/state.js";
import { fixture } from "../tests/fixtures.js";
let state: MatchState | undefined;
fixture().forEach((e, i) => {
  state = advance(
    state,
    e,
    new Date(Date.UTC(2026, 8, 23, 20, 0, i)).toISOString(),
  );
});
const board = Array.from({ length: 6 }, (_, i) => ({
  team: i < 3 ? 0 : 1,
  name: ["Niklas", "Max", "Lena", "Orbit", "Nova", "Blaze"][i],
  score: [721, 530, 299, 460, 230, 180][i],
  goals: i === 0 ? 3 : i % 2,
  assists: 1,
  saves: i % 3,
  shots: 4,
}));
const embeds = [
  matchEmbed(
    { ...state!, game: { ...state!.game, PlaylistId: 10 } },
    defaults,
    [board[0], board[3]],
  ),
  matchEmbed(
    { ...state!, game: { ...state!.game, PlaylistId: 13 } },
    defaults,
    board,
  ),
  statsEmbed({
    member: "Niklas",
    ...aggregate([
      {
        member_id: "fixture",
        match_id: "fixture",
        state: { ...state!, game: { ...state!.game, PlaylistId: 13 } },
        stats: { ...Object.values(state!.players)[0], Score: 299 },
      },
    ]),
  }),
  ...recordEmbeds([
    {
      metric: "Score",
      value: 1124,
      member: "Max",
      unit: "count",
      achievedAt: "2026-09-21T18:00:00Z",
    },
    {
      metric: "Goals",
      value: 7,
      member: "Niklas",
      unit: "count",
      achievedAt: "2026-09-23T20:00:00Z",
    },
    {
      metric: "BestWinStreak",
      value: 8,
      member: "Lena",
      unit: "count",
      achievedAt: "2026-09-22T18:00:00Z",
    },
  ]),
  ...leaderboardEmbeds(
    [
      { member: "Niklas", value: 32, matches: 12 },
      { member: "Max", value: 27, matches: 12 },
      { member: "Lena", value: 19, matches: 10 },
    ],
    "🏅 Tore · Diese Woche",
  ),
].map((e) => e.setTimestamp(new Date("2026-09-23T20:00:00Z")).toJSON());
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const md = (s: string) =>
  escape(s)
    .replace(/\\([_*])/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
const cards = embeds
  .map(
    (e) =>
      `<article style="border-color:#${e.color!.toString(16).padStart(6, "0")}"><h2>${md(e.title!)}</h2>${e.description ? `<p>${md(e.description)}</p>` : ""}<div class="fields">${(e.fields ?? []).map((f) => `<section class="${f.inline ? "inline" : "wide"}"><h3>${md(f.name)}</h3><div>${md(f.value)}</div></section>`).join("")}</div><footer>${escape(e.footer!.text)} · 23.09.2026</footer></article>`,
  )
  .join("");
mkdirSync("docs/examples", { recursive: true });
writeFileSync(
  "docs/examples/discord-embeds.json",
  JSON.stringify(embeds, null, 2) + "\n",
);
writeFileSync(
  "docs/examples/discord-preview.html",
  `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RockLea 0.3 · Embed-Vorschau</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#202127;color:#eeeff3;font:15px/1.55 system-ui,sans-serif}header{max-width:980px;margin:auto}h1{font-size:26px}h2{font-size:18px;margin:0 0 12px}h3{font-size:14px;margin:0 0 5px;color:#fff}main{display:grid;grid-template-columns:minmax(0,600px) 320px;gap:40px;max-width:980px;margin:auto}.column{min-width:0}article{background:#2b2d34;border-left:4px solid;border-radius:5px;padding:16px;margin:16px 0;overflow-wrap:anywhere}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 12px}.wide{grid-column:1/-1}.mobile .fields{grid-template-columns:1fr}footer{font-size:11px;color:#b1b5c3;margin-top:18px}b{color:#fff}.note{color:#bdc5d6}@media(max-width:850px){main{display:block;max-width:600px}.mobile{max-width:320px}.fields{grid-template-columns:1fr}}</style><header><h1>RockLea · Version 0.3.0</h1><p class="note">Synthetische Fixtures aus den produktiven Embed-Buildern. Layout-Näherung für Desktop und 320px Mobilbreite; kein Screenshot aus Discord.</p></header><main><div class="column"><h2>Desktop</h2>${cards}</div><div class="column mobile"><h2>Mobil · 320px</h2>${cards}</div></main></html>`,
);
console.log(
  "docs/examples: five reproducible Discord embed fixtures and desktop/mobile preview.",
);
