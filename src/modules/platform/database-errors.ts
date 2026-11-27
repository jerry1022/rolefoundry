import { ApplicationError } from "./errors";
const failures = {
  RF_APPLICATION_LIMIT: [409, "The tracker has reached its record, event or follow-up limit."],
  RF_RESUME_LIMIT: [409, "This resume operation exceeds the document, history or content limit."],
  RF_IMMUTABLE: [409, "Historical versions cannot be overwritten. Create a new confirmed version."],
  RF_COURSE_CYCLE: [
    409,
    "Course prerequisites would form a cycle. Review the required foundations.",
  ],
  RF_LEARNING_LIMIT: [
    409,
    "This learning request exceeds the initial planning or reference limit.",
  ],
  RF_MATCH_LIMIT: [
    409,
    "This analysis is too large. Choose one target role or reduce the profile evidence before refreshing.",
  ],
  RF_NOT_READY: [409, "This track needs three reviewed questions before an assessment can start."],
  RF_STALE_INPUT: [409, "The task inputs changed. Start from the current version."],
  RF_UNAUTHORIZED: [401, "Sign in to continue."],
  RF_FORBIDDEN: [403, "This operation is not permitted."],
  RF_NOT_FOUND: [404, "The resource is unavailable."],
  RF_INVALID_INPUT: [400, "The request is invalid."],
  RF_CONFLICT: [409, "The data changed. Reload before trying again."],
  RF_UNAVAILABLE: [503, "The service is temporarily unavailable."],
  RF_NOT_CONFIGURED: [503, "This service is not configured for this deployment."],
} as const;
export function safeDatabaseError(error: { message: string; code?: string }) {
  const code = Object.hasOwn(failures, error.message)
    ? (error.message as keyof typeof failures)
    : error.code === "42501"
      ? "RF_FORBIDDEN"
      : "RF_UNAVAILABLE";
  return new ApplicationError(code, failures[code][0], failures[code][1]);
}
