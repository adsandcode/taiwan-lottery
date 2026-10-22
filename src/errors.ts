/** The caller asked for something invalid (unknown game, bad date, wrong number count). */
export class InputError extends Error {
  override name = "InputError";
}

/** The request was valid but the official data has no such draw (yet). */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

/** The official API failed, timed out, or answered in a shape this package does not understand. */
export class UpstreamError extends Error {
  override name = "UpstreamError";
}
