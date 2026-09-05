export function shouldRecoverFullscreenBack(
  previewInitiated: boolean,
  fullscreenActive: boolean,
): boolean {
  return previewInitiated && fullscreenActive;
}

export async function requestFullscreenExit(
  exitFullscreen: () => Promise<void>,
  isFullscreenActive: () => boolean,
  finalize: () => void,
  recoverAfterRejection: () => void = () => {},
): Promise<boolean> {
  try {
    await exitFullscreen();
  } catch {
    recoverAfterRejection();
    return false;
  }

  if (isFullscreenActive()) return false;
  finalize();
  return true;
}