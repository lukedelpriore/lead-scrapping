import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";

/**
 * Claude client. Section 11 and 17. Constructed ONLY when AI_MODE is on. With
 * AI_MODE off the rules engine runs instead and this is never created. Forces
 * JSON via a tool schema, validates with Zod, retries once on invalid JSON,
 * and caps output tokens. Both models are claude-haiku-4-5-20251001.
 */

const MODEL = "claude-haiku-4-5-20251001";

export const classifierSchema = z.object({
  hosts_weddings: z.enum(["yes", "no", "unclear"]),
  hosts_corporate: z.enum(["yes", "no", "unclear"]),
  nonmember_events: z.enum(["yes", "no", "unclear"]),
  evidence_url: z.string().nullable(),
  evidence_phrase: z.string().nullable(),
  ownership_type: z.enum(["group", "private_owner", "member_owned", "municipal", "unclear"]),
  group_name: z.string().nullable(),
  capacity: z.number().nullable(),
  site_contact: z
    .object({
      name: z.string(),
      title: z.string(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    })
    .nullable(),
  confidence: z.number(),
});
export type ClassifierOutput = z.infer<typeof classifierSchema>;

export const adjudicatorSchema = z.object({
  primary: z.union([z.string(), z.number()]).nullable(),
  alternate: z.union([z.string(), z.number()]).nullable(),
  confidence: z.number(),
  reason: z.string(),
});
export type AdjudicatorOutput = z.infer<typeof adjudicatorSchema>;

interface MessagesCreator {
  messages: {
    create(body: unknown): Promise<{
      content: Array<{ type: string; input?: unknown; text?: string }>;
    }>;
  };
}

export interface ClaudeConfig {
  apiKey: string;
  log?: ApiLogSink;
  client?: MessagesCreator; // injectable for tests
}

export class ClaudeClient {
  private readonly client: MessagesCreator;
  private readonly log: ApiLogSink;
  private readonly bucket: TokenBucket;

  constructor(cfg: ClaudeConfig) {
    if (!cfg.apiKey) throw new Error("ClaudeClient requires ANTHROPIC_API_KEY");
    this.client = cfg.client ?? (new Anthropic({ apiKey: cfg.apiKey }) as unknown as MessagesCreator);
    this.log = cfg.log ?? noopApiLog;
    this.bucket = new TokenBucket({ capacity: 5, refillPerSecond: 2 });
  }

  private async runTool<T>(args: {
    system: string;
    user: string;
    toolName: string;
    schema: z.ZodType<T>;
    inputSchema: Record<string, unknown>;
    maxTokens: number;
    endpoint: string;
  }): Promise<T> {
    const call = async (): Promise<T> => {
      await this.bucket.remove(1);
      const started = Date.now();
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: args.maxTokens,
        temperature: 0,
        system: args.system,
        tools: [
          {
            name: args.toolName,
            description: "Return the structured result.",
            input_schema: { type: "object", ...args.inputSchema },
          },
        ],
        tool_choice: { type: "tool", name: args.toolName },
        messages: [{ role: "user", content: args.user }],
      });
      void this.log.record({
        provider: "claude",
        endpoint: args.endpoint,
        statusCode: 200,
        durationMs: Date.now() - started,
        costUnits: 0,
      });
      const block = res.content.find((c) => c.type === "tool_use");
      if (!block || block.input === undefined) {
        throw new Error("no tool_use block in response");
      }
      return args.schema.parse(block.input);
    };

    try {
      return await call();
    } catch {
      // Retry once on invalid JSON or a transient shape error.
      return await call();
    }
  }

  async classifyVenue(input: {
    name: string;
    city: string | null;
    state: string | null;
    pages: { url: string; text: string }[];
  }): Promise<ClassifierOutput> {
    const system =
      "You classify golf and country club websites for event business. Return only the tool result. nonmember_events is yes only if the site states nonmembers or the public may host events; no only if members only; otherwise unclear. hosts_weddings and hosts_corporate are yes only when the site describes hosting them. Never guess a group name; use only names printed on the site. evidence_phrase must be copied from the page, under 15 words. capacity only if a number is printed. site_contact only if a named person with an events or catering title is printed.";
    const user = JSON.stringify({
      name: input.name,
      city: input.city,
      state: input.state,
      pages: input.pages.map((p) => ({ url: p.url, text: p.text.slice(0, 3000) })),
    });
    return this.runTool({
      system,
      user,
      toolName: "classify_venue",
      schema: classifierSchema,
      endpoint: "messages.classify",
      maxTokens: 700,
      inputSchema: {
        properties: {
          hosts_weddings: { type: "string", enum: ["yes", "no", "unclear"] },
          hosts_corporate: { type: "string", enum: ["yes", "no", "unclear"] },
          nonmember_events: { type: "string", enum: ["yes", "no", "unclear"] },
          evidence_url: { type: ["string", "null"] },
          evidence_phrase: { type: ["string", "null"] },
          ownership_type: {
            type: "string",
            enum: ["group", "private_owner", "member_owned", "municipal", "unclear"],
          },
          group_name: { type: ["string", "null"] },
          capacity: { type: ["number", "null"] },
          site_contact: { type: ["object", "null"] },
          confidence: { type: "number" },
        },
        required: [
          "hosts_weddings",
          "hosts_corporate",
          "nonmember_events",
          "ownership_type",
          "confidence",
        ],
      },
    });
  }

  async adjudicate(input: {
    targetName: string;
    targetType: "venue" | "group";
    city: string | null;
    state: string | null;
    ownershipType: string;
    titleHierarchy: string[][];
    results: Array<{
      profile_id: string | number;
      name: string;
      title: string | null;
      employer: string | null;
      location: string | null;
      linkedin_url: string | null;
    }>;
  }): Promise<AdjudicatorOutput> {
    const system =
      "You choose the best sales contact for a marketing agency selling wedding and event marketing to country clubs. Reject any result whose employer does not clearly match the target; a group employer counts for a venue in that group. For venue level roles reject locations more than 50 miles away. Prefer earlier hierarchy tiers, then seniority within a tier. Never choose a title in the exclude list. If nothing qualifies, return nulls with confidence 0. Reason under 30 words. Return only the tool result.";
    const user = JSON.stringify({
      target: {
        name: input.targetName,
        type: input.targetType,
        city: input.city,
        state: input.state,
        ownership_type: input.ownershipType,
      },
      title_hierarchy: input.titleHierarchy,
      results: input.results.slice(0, 25),
    });
    return this.runTool({
      system,
      user,
      toolName: "choose_contact",
      schema: adjudicatorSchema,
      endpoint: "messages.adjudicate",
      maxTokens: 300,
      inputSchema: {
        properties: {
          primary: { type: ["string", "number", "null"] },
          alternate: { type: ["string", "number", "null"] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["primary", "alternate", "confidence", "reason"],
      },
    });
  }
}
