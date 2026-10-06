export const is404 = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );
