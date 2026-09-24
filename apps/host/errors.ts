import { z } from "zod";
/** Only deliberate, static product messages may cross the private host/UI pipe. */
export class HostError extends Error {}
export function hostErrorMessage(error: unknown) {
  if (error instanceof HostError) return error.message;
  if (error instanceof z.ZodError) {
    const labels: Record<string, string> = {
      discordToken: "Bot Token",
      clientId: "Client ID",
      clientSecret: "Client Secret",
      guildId: "Server ID",
      port: "Port",
      githubToken: "GitHub-Lesezugang",
    };
    const label = labels[String(error.issues[0]?.path[0])] ?? "Konfiguration";
    return `${label}: Eingabe fehlt oder hat ein ungültiges Format.`;
  }
  return "Aktion fehlgeschlagen. Konfiguration, Verbindung und Berechtigungen prüfen. Details im RockLea-Log.";
}
