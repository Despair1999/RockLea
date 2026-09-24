import { it, expect, vi } from "vitest";
import {
  dashboardResponse,
  sessionExpiredMessage,
} from "../apps/dashboard/session.js";
it("expires the dashboard session on 401 even if the response body is not JSON", async () => {
  const expired = vi.fn();
  await expect(
    dashboardResponse(new Response("expired", { status: 401 }), expired),
  ).rejects.toThrow(sessionExpiredMessage);
  expect(expired).toHaveBeenCalledOnce();
});
it("does not offer setup or log out for unrelated API failures", async () => {
  const expired = vi.fn();
  await expect(
    dashboardResponse(
      new Response(JSON.stringify({ error: "Verbindung fehlgeschlagen" }), {
        status: 503,
      }),
      expired,
    ),
  ).rejects.toThrow("Verbindung fehlgeschlagen");
  expect(expired).not.toHaveBeenCalled();
});
