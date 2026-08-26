import { describe, it, expect } from "vitest";
import { parseEnv, integrationPresence } from "./env";

const base: Record<string, string | undefined> = {
  DATABASE_URL: "postgresql://dph:dph@localhost:5432/dph_lead_engine",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_URL: "http://localhost:3000",
  ALLOWED_EMAILS: "luke@delpriorehospitality.com,hashir@delpriorehospitality.com",
  MAIL_FROM: "Del Priore Lead Engine <leads@delpriorehospitality.com>",
  AI_MODE: "off",
  REVEAL_MODE: "off",
  PLACES_ENABLED: "false",
  LOG_LEVEL: "info",
  TZ: "America/New_York",
};

describe("parseEnv", () => {
  it("accepts a valid core environment with no integration keys", () => {
    const env = parseEnv(base);
    expect(env.AI_MODE).toBe("off");
    expect(env.REVEAL_MODE).toBe("off");
    expect(env.PLACES_ENABLED).toBe(false);
    expect(env.ALLOWED_EMAILS).toEqual([
      "luke@delpriorehospitality.com",
      "hashir@delpriorehospitality.com",
    ]);
  });

  it("lowercases and splits the allowed email list", () => {
    const env = parseEnv({ ...base, ALLOWED_EMAILS: "Luke@DPH.com, HASHIR@DPH.com" });
    expect(env.ALLOWED_EMAILS).toEqual(["luke@dph.com", "hashir@dph.com"]);
  });

  it("rejects a missing database url", () => {
    const { DATABASE_URL, ...rest } = base;
    void DATABASE_URL;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("rejects a short auth secret", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("requires an anthropic key only when AI_MODE is on", () => {
    expect(() => parseEnv({ ...base, AI_MODE: "on" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() =>
      parseEnv({ ...base, AI_MODE: "on", ANTHROPIC_API_KEY: "sk-test" }),
    ).not.toThrow();
  });

  it("requires a maps key only when places is enabled", () => {
    expect(() => parseEnv({ ...base, PLACES_ENABLED: "true" })).toThrow(
      /GOOGLE_MAPS_API_KEY/,
    );
    expect(() =>
      parseEnv({ ...base, PLACES_ENABLED: "true", GOOGLE_MAPS_API_KEY: "k" }),
    ).not.toThrow();
  });

  it("accepts a base64 or a path form of the service account", () => {
    const env = parseEnv({ ...base, GOOGLE_SERVICE_ACCOUNT_B64: "ey=" });
    expect(integrationPresence(env).google_sheets).toBe(true);
  });
});

describe("integrationPresence", () => {
  it("reports every integration as absent for a bare core environment", () => {
    const p = integrationPresence(parseEnv(base));
    expect(p.rocketreach).toBe(false);
    expect(p.serper).toBe(false);
    expect(p.brevo).toBe(false);
    expect(p.google_sheets).toBe(false);
    expect(p.anthropic).toBe(false);
    expect(p.reveal_mode).toBe("off");
    expect(p.ai_mode).toBe("off");
  });

  it("reports a present rocketreach key", () => {
    const p = integrationPresence(parseEnv({ ...base, ROCKETREACH_API_KEY: "rr" }));
    expect(p.rocketreach).toBe(true);
  });
});
