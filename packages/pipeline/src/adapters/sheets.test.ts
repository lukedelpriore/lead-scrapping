import { describe, it, expect, vi } from "vitest";
import { SheetsClient } from "./sheets";
import { MemoryApiLog } from "./api-log";
import type { sheets_v4 } from "googleapis";

/**
 * A minimal fake of the googleapis Sheets surface the client uses. Only the
 * three methods are implemented; the cast keeps TypeScript satisfied.
 */
function fakeSheets(overrides?: {
  appendRange?: string;
  title?: string;
  tabs?: string[];
}) {
  const calls: string[] = [];
  const api = {
    spreadsheets: {
      get: vi.fn(async () => {
        calls.push("get");
        return {
          data: {
            properties: { title: overrides?.title ?? "DPH Leads" },
            sheets: (overrides?.tabs ?? ["Leads", "Suppression"]).map((t) => ({
              properties: { title: t },
            })),
          },
        };
      }),
      values: {
        append: vi.fn(async () => {
          calls.push("append");
          return { data: { updates: { updatedRange: overrides?.appendRange ?? "Leads!A5:A5" } } };
        }),
        clear: vi.fn(async () => {
          calls.push("clear");
          return { data: {} };
        }),
      },
    },
  };
  return { api: api as unknown as sheets_v4.Sheets, calls };
}

const sa = { client_email: "svc@x.iam", private_key: "PK" };

describe("SheetsClient", () => {
  it("reads spreadsheet info", async () => {
    const { api } = fakeSheets();
    const c = new SheetsClient({ serviceAccount: sa, spreadsheetId: "SID", sheetsApi: api });
    const info = await c.info();
    expect(info.title).toBe("DPH Leads");
    expect(info.tabs).toContain("Leads");
  });

  it("appends rows and returns the updated range", async () => {
    const { api } = fakeSheets({ appendRange: "Leads!A10:AA10" });
    const c = new SheetsClient({ serviceAccount: sa, spreadsheetId: "SID", sheetsApi: api });
    const res = await c.append("Leads", [["a", "b"]]);
    expect(res.updatedRange).toBe("Leads!A10:AA10");
  });

  it("test write appends then clears the same range", async () => {
    const { api, calls } = fakeSheets({ appendRange: "Leads!A7:A7" });
    const log = new MemoryApiLog();
    const c = new SheetsClient({ serviceAccount: sa, spreadsheetId: "SID", sheetsApi: api, log });
    const res = await c.testWrite("Leads");
    expect(res.ok).toBe(true);
    expect(res.range).toBe("Leads!A7:A7");
    expect(calls).toEqual(["append", "clear"]);
    // Both operations were logged.
    expect(log.entries.map((e) => e.endpoint)).toEqual(["values.append", "values.clear"]);
  });

  it("logs an error and rethrows when append fails", async () => {
    const api = {
      spreadsheets: {
        values: {
          append: vi.fn(async () => {
            throw Object.assign(new Error("denied"), { code: 403 });
          }),
        },
      },
    } as unknown as sheets_v4.Sheets;
    const log = new MemoryApiLog();
    const c = new SheetsClient({ serviceAccount: sa, spreadsheetId: "SID", sheetsApi: api, log });
    await expect(c.append("Leads", [["x"]])).rejects.toThrow(/denied/);
    expect(log.entries.at(-1)).toMatchObject({ statusCode: 403, note: "error" });
  });
});
