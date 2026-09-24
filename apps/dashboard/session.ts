export const sessionExpiredMessage =
  "Deine Discord-Sitzung ist abgelaufen. Bitte erneut anmelden.";
export async function dashboardResponse<T>(
  response: Response,
  expired: () => void,
): Promise<T> {
  if (response.status === 401) {
    expired();
    throw new Error(sessionExpiredMessage);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Anfrage fehlgeschlagen.");
  return result;
}
