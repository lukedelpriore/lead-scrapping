import { z } from "zod";

/**
 * Environment validation for the Lead Engine.
 *
 * Two layers protect the app:
 *  1. This Zod schema validates types and cross field rules at boot. Core
 *     application variables are required, so the app refuses to start without
 *     them. Integration keys (RocketReach, Serper, Brevo, Google) are optional
 *     here on purpose: their absence is surfaced on the Settings page and in
 *     integration_status, and the Section 1 preflight is the gate that requires
 *     them before a real run.
 *  2. ANTHROPIC_API_KEY is required only when AI_MODE is on, and
 *     GOOGLE_MAPS_API_KEY only when PLACES_ENABLED is true.
 *
 * REVEAL_MODE is validated as an enum but stays off for the entire build.
 */

const boolFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

const commaList = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

const rawEnvSchema = z.object({
  // Core, always required.
  DATABASE_URL: z.string().url().startsWith("postgres"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  AUTH_URL: z.string().url(),
  ALLOWED_EMAILS: commaList.pipe(z.array(z.string().email()).min(1)),
  MAIL_FROM: z.string().min(1),
  AI_MODE: z.enum(["off", "on"]).default("off"),
  REVEAL_MODE: z.enum(["off", "ask", "auto"]).default("off"),
  PLACES_ENABLED: boolFromString.default("false"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  TZ: z.string().default("America/New_York"),

  // Optional auth provider (password login is the seeded fallback).
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  SEED_PASSWORD: z.string().optional(),

  // Integration keys. Optional at boot, required by preflight for a real run.
  ROCKETREACH_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_B64: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  SHEET_ID: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

const envSchema = rawEnvSchema.superRefine((env, ctx) => {
  if (env.AI_MODE === "on" && !env.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ANTHROPIC_API_KEY"],
      message: "ANTHROPIC_API_KEY is required when AI_MODE is on",
    });
  }
  if (env.PLACES_ENABLED && !env.GOOGLE_MAPS_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GOOGLE_MAPS_API_KEY"],
      message: "GOOGLE_MAPS_API_KEY is required when PLACES_ENABLED is true",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment object. Throws a readable error listing
 * every problem when validation fails. Pure, so it is easy to unit test.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new Error(
      `Environment validation failed:\n${lines.join("\n")}\n` +
        "Set the missing variables in the cloud environment dialog or in .env.local.",
    );
  }
  return result.data;
}

let cached: Env | null = null;

/**
 * Lazily validate process.env once and cache the result. Server side only.
 */
export function getEnv(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

/**
 * Which integrations have a key present. Drives the Settings page and the
 * integration_status rows. Never returns the key itself.
 */
export function integrationPresence(env: Env) {
  return {
    rocketreach: Boolean(env.ROCKETREACH_API_KEY),
    serper: Boolean(env.SERPER_API_KEY),
    brevo: Boolean(env.BREVO_API_KEY),
    google_sheets: Boolean(
      env.GOOGLE_SERVICE_ACCOUNT_B64 || env.GOOGLE_SERVICE_ACCOUNT_JSON,
    ),
    sheet_id: Boolean(env.SHEET_ID),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    places: env.PLACES_ENABLED,
    ai_mode: env.AI_MODE,
    reveal_mode: env.REVEAL_MODE,
  };
}
