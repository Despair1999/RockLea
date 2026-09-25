/** IDs: BakkesMod SDK playlist reference; sizes: CodeRed PlaylistDump, 2024-10-30.
 * See docs/PLAYLISTS.md. Variable/offline modes deliberately have no team size. */
export type Playlist = {
  id: number;
  name: string;
  teamSize: number | null;
  category:
    | "casual"
    | "ranked"
    | "extra"
    | "private"
    | "training"
    | "tournament"
    | "other";
};
const entries: [number, string, number | null, Playlist["category"]][] = [
  [1, "Casual 1v1", 1, "casual"],
  [2, "Casual 2v2", 2, "casual"],
  [3, "Casual 3v3", 3, "casual"],
  [4, "Chaos 4v4", 4, "casual"],
  [10, "Ranked 1v1", 1, "ranked"],
  [11, "Ranked 2v2", 2, "ranked"],
  [13, "Ranked 3v3", 3, "ranked"],
  [15, "Snow Day 3v3", 3, "extra"],
  [16, "Rocket Labs 3v3", 3, "extra"],
  [17, "Hoops 2v2", 2, "extra"],
  [18, "Rumble 3v3", 3, "extra"],
  [23, "Dropshot 3v3", 3, "extra"],
  [27, "Ranked Hoops 2v2", 2, "extra"],
  [28, "Ranked Rumble 3v3", 3, "extra"],
  [29, "Ranked Dropshot 3v3", 3, "extra"],
  [30, "Ranked Snow Day 3v3", 3, "extra"],
  [31, "Ghost Hunt 3v3", 3, "extra"],
  [32, "Beach Ball 2v2", 2, "extra"],
  [33, "Spike Rush 3v3", 3, "extra"],
  [35, "Rocket Labs 3v3", 3, "extra"],
  [37, "Dropshot Rumble 3v3", 3, "extra"],
  [38, "Heatseeker 3v3", 3, "extra"],
  [41, "Boomer Ball 3v3", 3, "extra"],
  [43, "Heatseeker 2v2", 2, "extra"],
  [44, "Winter Breakaway 3v3", 3, "extra"],
  [46, "Gridiron 4v4", 4, "extra"],
  [47, "Super Cube 3v3", 3, "extra"],
  [48, "Tactical Rumble 3v3", 3, "extra"],
  [49, "Spring Loaded 3v3", 3, "extra"],
  [50, "Speed Demon 3v3", 3, "extra"],
  [52, "Gotham City Rumble 3v3", 3, "extra"],
  [54, "Knockout", null, "extra"],
  [62, "Magnus Futball 4v4", 4, "extra"],
  [61, "Ranked 4v4", 4, "ranked"],
  [64, "GodBallSpooky 2v2", 2, "extra"],
  [65, "GodBallHaunted 3v3", 3, "extra"],
  [66, "GodBallRicochet 3v3", 3, "extra"],
  [67, "CubicSpooky 3v3", 3, "extra"],
  [68, "G-Force Frenzy 3v3", 3, "extra"],
  [70, "Dropshot Rumble 2v2", 2, "extra"],
  [72, "Territory", null, "extra"],
  [74, "Territory Doubles", null, "extra"],
  [75, "Godball Territory", null, "extra"],
  [76, "Godball Territory Doubles", null, "extra"],
  [77, "Non-Standard Soccar", null, "other"],
  [79, "Snowday Territory", null, "extra"],
  [80, "Run It Back", null, "extra"],
  [81, "Car Wars", null, "extra"],
  [82, "Pizza Party", null, "extra"],
  [83, "Push the Puck", null, "extra"],
  [84, "Possession", null, "extra"],
  [86, "FC Showdown", null, "extra"],
  [87, "Sacrifice", null, "extra"],
  [88, "Jump Jam", null, "extra"],
  [6, "Privates Match", null, "private"],
  [7, "Offline-Saison", null, "other"],
  [8, "Exhibition", null, "other"],
  [9, "Training", null, "training"],
  [19, "Workshop", null, "training"],
  [20, "Training-Editor", null, "training"],
  [21, "Custom Training", null, "training"],
  [73, "Online Freeplay", null, "training"],
  [22, "Custom Tournament", null, "tournament"],
  [34, "Tournament", null, "tournament"],
  [24, "Lokales Match", null, "private"],
  [26, "Externe Rangliste", null, "other"],
];
export const playlists: ReadonlyMap<number, Playlist> = new Map(
  entries.map(([id, name, teamSize, category]) => [
    id,
    { id, name, teamSize, category },
  ]),
);
export const playlist = (id: number | undefined) =>
  id === undefined ? undefined : playlists.get(id);
