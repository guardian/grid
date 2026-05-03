/**
 * useToast — convenience hook for firing toasts.
 *
 * Returns an object with one method per category. Each method accepts a
 * message string and optional overrides (lifespan, durationMs).
 *
 * For non-React callers (e.g. selection-store), use `addToast` from
 * `@/stores/toast-store` directly.
 *
 * @example
 * const toast = useToast();
 * toast.info("2,400 items added to your selection.");
 * toast.warning("Selection limited to 5,000 items.");
 */

import { useCallback } from "react";
import { addToast } from "@/stores/toast-store";
import type { ToastLifespan } from "@/stores/toast-store";
import { TOAST_DEFAULT_DURATION_MS } from "@/constants/tuning";

interface ToastOptions {
  lifespan?: ToastLifespan;
  durationMs?: number;
}

interface ToastActions {
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  announcement: (message: string, options?: ToastOptions) => void;
}

export function useToast(): ToastActions {
  const info = useCallback((message: string, options?: ToastOptions) => {
    addToast({
      category: "information",
      message,
      lifespan: options?.lifespan ?? "transient",
      durationMs: options?.durationMs ?? TOAST_DEFAULT_DURATION_MS,
    });
  }, []);

  const warning = useCallback((message: string, options?: ToastOptions) => {
    addToast({
      category: "warning",
      message,
      lifespan: options?.lifespan ?? "transient",
      durationMs: options?.durationMs ?? TOAST_DEFAULT_DURATION_MS,
    });
  }, []);

  const error = useCallback((message: string, options?: ToastOptions) => {
    addToast({
      category: "error",
      message,
      lifespan: options?.lifespan ?? "transient",
      durationMs: options?.durationMs ?? TOAST_DEFAULT_DURATION_MS,
    });
  }, []);

  const success = useCallback((message: string, options?: ToastOptions) => {
    addToast({
      category: "success",
      message,
      lifespan: options?.lifespan ?? "transient",
      durationMs: options?.durationMs ?? TOAST_DEFAULT_DURATION_MS,
    });
  }, []);

  const announcement = useCallback((message: string, options?: ToastOptions) => {
    addToast({
      category: "announcement",
      message,
      lifespan: options?.lifespan ?? "transient",
      durationMs: options?.durationMs ?? TOAST_DEFAULT_DURATION_MS,
    });
  }, []);

  return { info, warning, error, success, announcement };
}
