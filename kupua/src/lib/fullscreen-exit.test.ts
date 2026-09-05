import { describe, expect, it, vi } from "vitest";

import { requestFullscreenExit, shouldRecoverFullscreenBack } from "./fullscreen-exit";

describe("requestFullscreenExit", () => {
  it("does not finalize when exitFullscreen rejects", async () => {
    const finalize = vi.fn();
    const recover = vi.fn();

    const exited = await requestFullscreenExit(
      () => Promise.reject(new Error("denied")),
      () => true,
      finalize,
      recover,
    );

    expect(exited).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledOnce();
  });

  it("finalizes successful exit when fullscreenchange did not do so", async () => {
    const finalize = vi.fn();

    const exited = await requestFullscreenExit(
      () => Promise.resolve(),
      () => false,
      finalize,
    );

    expect(exited).toBe(true);
    expect(finalize).toHaveBeenCalledOnce();
  });

  it("does not finalize while native fullscreen remains active", async () => {
    const finalize = vi.fn();

    const exited = await requestFullscreenExit(
      () => Promise.resolve(),
      () => true,
      finalize,
    );

    expect(exited).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
  });
});

describe("shouldRecoverFullscreenBack", () => {
  it("recovers only while the same preview and native fullscreen remain active", () => {
    expect(shouldRecoverFullscreenBack(true, true)).toBe(true);
    expect(shouldRecoverFullscreenBack(false, true)).toBe(false);
    expect(shouldRecoverFullscreenBack(true, false)).toBe(false);
    expect(shouldRecoverFullscreenBack(false, false)).toBe(false);
  });
});