export interface Poller {
  tick(): Promise<void>;
  getInterval(): number;
}
