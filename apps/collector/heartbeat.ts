export type CollectorStatus = {
  gameConnected: boolean;
  queueDepth: number;
  version: string;
};
/** Run independently of roster refresh and event delivery retries. */
export class Heartbeat {
  private busy = false;
  private lastSuccess?: number;
  private previousConnection?: boolean;
  constructor(
    private readonly status: () => CollectorStatus,
    private readonly send: (status: CollectorStatus) => Promise<unknown>,
    private readonly failed: () => void,
    private readonly clock = Date.now,
  ) {}
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = this.clock(),
        status = this.status();
      if (
        this.lastSuccess !== undefined &&
        now - this.lastSuccess < 60000 &&
        status.gameConnected === this.previousConnection
      )
        return;
      await this.send(status);
      this.lastSuccess = now;
      this.previousConnection = status.gameConnected;
    } catch {
      this.failed();
    } finally {
      this.busy = false;
    }
  }
}
