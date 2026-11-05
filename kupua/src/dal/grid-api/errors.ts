/**
 * Retained Grid protocol error vocabulary for separately authorized API consumers.
 * Auth, expired-session, server and local write-guard failures remain distinct.
 * These classes do not prescribe the live read path's failure or toast policy.
 * See README.md for current ownership and grid-api-contract-audit-findings.md §6.2/§6.5
 * for protocol details.
 */

export class AuthError extends Error {
  constructor(message = "Authentication required — missing or invalid panda cookie") {
    super(message);
    this.name = "AuthError";
  }
}

export class SessionExpiredError extends Error {
  constructor(message = "Session expired — please refresh and log in again") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * An Argo error response from a Grid service.
 * `errorKey` maps to a known error code (see contract §6.5).
 */
export class ArgoError extends Error {
  readonly errorKey: string;

  constructor(errorKey: string, message: string) {
    super(message);
    this.name = "ArgoError";
    this.errorKey = errorKey;
  }
}

/**
 * Thrown when a non-GET request is blocked by the `gridApiWriteGuard()` Vite plugin.
 *
 * This is a developer-configuration issue (VITE_GRID_API_WRITES_ENABLED not set),
 * NOT a server-side permission denial. The body prefix `[grid-api-write-guard]`
 * distinguishes it from a media-api 403 (which has an Argo JSON body).
 *
 * See infra-safeguards.md §8 for the full enforcement model.
 */
export class WriteGuardBlockedError extends Error {
  constructor(body: string) {
    super(
      `Write blocked by gridApiWriteGuard — set VITE_GRID_API_WRITES_ENABLED=true to allow writes. ` +
        `See infra-safeguards.md §8. Body: ${body}`,
    );
    this.name = "WriteGuardBlockedError";
  }
}
