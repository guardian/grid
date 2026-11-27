import type { Page } from "@playwright/test";

export function createPageIntegrityGuard(page: Page): Promise<{
  readonly reason: "source-changed" | "unexpected-reload" | null;
  assertValid(): void;
  dispose(): Promise<void>;
}>;