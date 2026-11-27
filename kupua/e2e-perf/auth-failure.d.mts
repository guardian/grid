export const AUTH_REQUIRED_MARKER: string;
export const AUTH_RENEWAL_COMMAND: string;
export function createPerfAuthOutputFilter(): {
  readonly authRequired: boolean;
  push(chunk: string | Buffer, channel: "stdout" | "stderr"): string;
  flush(channel: "stdout" | "stderr"): string;
};
export function isPerfAuthResponse(response: {
  url: string;
  status: number;
  location?: string;
  navigation?: boolean;
}, targets: { appBaseUrl: string; mediaApiBaseUrl: string }): boolean;

export interface PerfAuthResponse {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
}
export interface PerfAuthGuard {
  inspect(response: PerfAuthResponse, navigation?: boolean): void;
  assertAuthenticated(): void;
  dispose(): void;
}
type BrowserResponse = PerfAuthResponse & { request(): { isNavigationRequest(): boolean } };
export function createPerfAuthGuard(page: {
  on(event: "response", listener: (response: BrowserResponse) => void): unknown;
  off(event: "response", listener: (response: BrowserResponse) => void): unknown;
}, targets: { appBaseUrl: string; mediaApiBaseUrl: string }, notify: (marker: string) => void): PerfAuthGuard;