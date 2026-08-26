import pino from "pino";

/**
 * Structured logger. JSON to stdout, never logs secrets or full contact
 * payloads. Section 11.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.apiKey",
      "*.api_key",
      "*.password",
      "*.passwordHash",
      "*.authorization",
      "req.headers.authorization",
      "*.ROCKETREACH_API_KEY",
      "*.ANTHROPIC_API_KEY",
    ],
    remove: true,
  },
});
