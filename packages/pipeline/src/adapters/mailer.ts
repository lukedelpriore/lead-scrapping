import { z } from "zod";
import { HttpClient } from "./http";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";

/**
 * Mailer over the Brevo HTTPS API. Section 11. SMTP is not used because the
 * cloud sandbox allows only HTTP and HTTPS. When no key is present, delivery
 * is disabled and every run reports it, so the Mailer exposes an `enabled`
 * flag and a dryRun send that records the intent without calling out.
 */

const ACCOUNT = "https://api.brevo.com/v3/account";
const SEND = "https://api.brevo.com/v3/smtp/email";

const accountSchema = z
  .object({
    email: z.string().optional(),
    companyName: z.string().optional(),
    plan: z.array(z.unknown()).optional(),
  })
  .passthrough();

export interface MailAddress {
  name?: string;
  email: string;
}

export interface SendInput {
  to: MailAddress[];
  subject: string;
  html: string;
  text?: string;
}

export interface MailerConfig {
  apiKey?: string;
  from: MailAddress;
  dryRun?: boolean;
  log?: ApiLogSink;
  http?: HttpClient;
}

export class Mailer {
  private readonly apiKey?: string;
  private readonly from: MailAddress;
  private readonly dryRun: boolean;
  private readonly http: HttpClient;

  constructor(cfg: MailerConfig) {
    this.apiKey = cfg.apiKey;
    this.from = cfg.from;
    this.dryRun = cfg.dryRun ?? false;
    this.http =
      cfg.http ??
      new HttpClient({
        provider: "brevo",
        bucket: new TokenBucket({ capacity: 5, refillPerSecond: 2 }),
        log: cfg.log ?? noopApiLog,
      });
  }

  /** Whether email delivery is possible (a key is present). */
  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  /** Free account check for the Settings page. */
  async account(): Promise<{ email: string | null; company: string | null }> {
    if (!this.apiKey) throw new Error("Brevo key not set");
    const res = await this.http.request<unknown>({
      url: ACCOUNT,
      method: "GET",
      headers: { "api-key": this.apiKey },
      endpointLabel: "account",
      costUnits: 0,
    });
    const parsed = accountSchema.parse(res.data);
    return { email: parsed.email ?? null, company: parsed.companyName ?? null };
  }

  /**
   * Send one email. In dryRun, or when no key is set, it records the intent
   * and returns disabled without calling out.
   */
  async send(input: SendInput): Promise<{ sent: boolean; disabled?: boolean }> {
    if (!this.apiKey || this.dryRun) {
      return { sent: false, disabled: !this.apiKey };
    }
    await this.http.request<unknown>({
      url: SEND,
      method: "POST",
      headers: { "api-key": this.apiKey },
      body: {
        sender: this.from,
        to: input.to,
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text ?? undefined,
      },
      endpointLabel: "smtp/email",
      costUnits: 0,
    });
    return { sent: true };
  }
}
