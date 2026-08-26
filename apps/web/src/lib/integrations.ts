import { prisma } from "@dph/db";
import {
  getEnv,
  RATE_LIMIT_FALLBACK,
} from "@dph/config";
import {
  RocketReachClient,
  SheetsClient,
  Mailer,
  ClaudeClient,
  decodeServiceAccount,
} from "@dph/pipeline";
import { prismaApiLog } from "./prisma-api-log";

/**
 * Build integration clients from server env and run their free connection
 * tests. Each test records the outcome in integration_status. None of these
 * spends a credit: RocketReach uses the account endpoint, Sheets appends then
 * clears a test row, Brevo checks the account, and the Anthropic ping runs
 * only when AI_MODE is on.
 */

export interface TestResult {
  ok: boolean;
  message: string;
  detail?: Record<string, unknown>;
}

async function setStatus(
  provider: string,
  ok: boolean,
  fields: { planName?: string | null; limits?: unknown; usage?: unknown; error?: string | null },
) {
  await prisma.integrationStatus.upsert({
    where: { provider },
    update: {
      lastOkAt: ok ? new Date() : undefined,
      lastError: ok ? null : (fields.error ?? "failed"),
      planName: fields.planName ?? undefined,
      limits: (fields.limits as object) ?? undefined,
      usage: (fields.usage as object) ?? undefined,
    },
    create: {
      provider,
      lastOkAt: ok ? new Date() : null,
      lastError: ok ? null : (fields.error ?? "failed"),
      planName: fields.planName ?? null,
      limits: (fields.limits as object) ?? undefined,
      usage: (fields.usage as object) ?? undefined,
    },
  });
}

export async function testRocketReach(): Promise<TestResult> {
  const env = getEnv();
  if (!env.ROCKETREACH_API_KEY) {
    return { ok: false, message: "No RocketReach key on the server. Add ROCKETREACH_API_KEY and test again." };
  }
  try {
    const rr = new RocketReachClient({
      apiKey: env.ROCKETREACH_API_KEY,
      revealMode: env.REVEAL_MODE,
      log: prismaApiLog,
    });
    const status = await rr.status();
    await setStatus("rocketreach", true, {
      planName: status.planName,
      limits: status.limits ?? RATE_LIMIT_FALLBACK,
    });
    return {
      ok: true,
      message: `Connected. Plan ${status.planName ?? "unknown"}, ${status.personExportsRemaining ?? "?"} person exports left.`,
      detail: {
        personExportsRemaining: status.personExportsRemaining,
        companyExportsRemaining: status.companyExportsRemaining,
      },
    };
  } catch (err) {
    const message = describeError(err, "RocketReach");
    await setStatus("rocketreach", false, { error: message });
    return { ok: false, message };
  }
}

export async function testSheets(): Promise<TestResult> {
  const env = getEnv();
  if (!env.GOOGLE_SERVICE_ACCOUNT_B64 && !env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { ok: false, message: "No Google service account on the server." };
  }
  if (!env.SHEET_ID) {
    return { ok: false, message: "No SHEET_ID set on the server." };
  }
  try {
    const serviceAccount = decodeServiceAccount({
      b64: env.GOOGLE_SERVICE_ACCOUNT_B64,
      json: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    });
    const sheets = new SheetsClient({
      serviceAccount,
      spreadsheetId: env.SHEET_ID,
      log: prismaApiLog,
    });
    const info = await sheets.info();
    const written = await sheets.testWrite(info.tabs[0] ?? "Leads");
    await setStatus("sheets", true, { planName: info.title });
    return {
      ok: true,
      message: `Wrote and removed a test row in ${info.title}. Share the sheet with ${serviceAccount.client_email} as editor.`,
      detail: { range: written.range, tabs: info.tabs },
    };
  } catch (err) {
    const message = describeError(err, "Google Sheets");
    await setStatus("sheets", false, { error: message });
    return { ok: false, message };
  }
}

export async function testBrevo(): Promise<TestResult> {
  const env = getEnv();
  if (!env.BREVO_API_KEY) {
    return { ok: false, message: "No Brevo key on the server. Email delivery is disabled until one is set." };
  }
  try {
    const mailer = new Mailer({
      apiKey: env.BREVO_API_KEY,
      from: parseFrom(env.MAIL_FROM),
      log: prismaApiLog,
    });
    const acct = await mailer.account();
    await setStatus("brevo", true, { planName: acct.company });
    return { ok: true, message: `Connected as ${acct.email ?? "unknown"}.` };
  } catch (err) {
    const message = describeError(err, "Brevo");
    await setStatus("brevo", false, { error: message });
    return { ok: false, message };
  }
}

export async function pingClaude(): Promise<TestResult> {
  const env = getEnv();
  if (env.AI_MODE !== "on") {
    return { ok: true, message: "Rules mode, no key needed." };
  }
  if (!env.ANTHROPIC_API_KEY) {
    return { ok: false, message: "AI mode is on but no key is set." };
  }
  try {
    // Constructing the client validates the key is present. A live ping is a
    // one token classify call, run only when the operator asks in AI mode.
    new ClaudeClient({ apiKey: env.ANTHROPIC_API_KEY, log: prismaApiLog });
    await setStatus("anthropic", true, {});
    return { ok: true, message: "AI mode on, key present." };
  } catch (err) {
    const message = describeError(err, "AI");
    await setStatus("anthropic", false, { error: message });
    return { ok: false, message };
  }
}

function parseFrom(mailFrom: string): { name?: string; email: string } {
  const m = mailFrom.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2]! };
  return { email: mailFrom.trim() };
}

function describeError(err: unknown, provider: string): string {
  const anyErr = err as { status?: number; message?: string };
  if (anyErr?.status === 401 || anyErr?.status === 403) {
    return `${provider} rejected the key (${anyErr.status}). Update the key on the server and test again.`;
  }
  return `${provider} test failed: ${anyErr?.message ?? "unknown error"}`;
}
