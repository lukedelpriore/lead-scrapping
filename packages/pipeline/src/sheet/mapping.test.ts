import { describe, it, expect } from "vitest";
import { toSheetRow, SHEET_COLUMNS, APP_OWNED_COLUMN_COUNT } from "./mapping";

describe("SHEET_COLUMNS", () => {
  it("has the exact fixed order from Section 8", () => {
    expect(SHEET_COLUMNS[0]).toBe("Request ID");
    expect(SHEET_COLUMNS[SHEET_COLUMNS.length - 3]).toBe("Rep");
    expect(SHEET_COLUMNS[SHEET_COLUMNS.length - 2]).toBe("Status");
    expect(SHEET_COLUMNS[SHEET_COLUMNS.length - 1]).toBe("Call notes");
    expect(SHEET_COLUMNS).toHaveLength(27);
  });

  it("reserves the last three columns for Luke", () => {
    expect(APP_OWNED_COLUMN_COUNT).toBe(24);
  });
});

describe("toSheetRow", () => {
  it("maps a full lead into the fixed column order", () => {
    const row = toSheetRow({
      requestId: "R-0007",
      clubName: "Boca Country Club",
      city: "Boca Raton",
      state: "FL",
      website: "https://bocacc.com",
      eventsPageUrl: "https://bocacc.com/weddings",
      mainLine: "+13055550100",
      ownershipType: "private_owner",
      groupName: "",
      venuesInGroup: null,
      tier: 1,
      contactName: "Jane Doe",
      title: "Director of Catering",
      emails: [
        { address: "jane@bocacc.com", type: "work", grade: "A" },
        { address: "jane.personal@gmail.com", type: "personal" },
      ],
      phones: [
        { number: "+13055550134", type: "mobile", valid: true },
        { number: "+13055550100", type: "work", valid: true },
      ],
      linkedinUrl: "https://linkedin.com/in/jane-doe",
      rrProfileId: "12345",
      matchConfidence: 0.9,
      source: "rocketreach",
      datePulled: "2026-08-27",
      notes: "",
    });

    expect(row).toHaveLength(27);
    expect(row[0]).toBe("R-0007");
    expect(row[1]).toBe("Boca Country Club");
    expect(row[6]).toBe("(305) 555-0100"); // main line readable
    expect(row[10]).toBe("1"); // tier
    expect(row[13]).toBe("(305) 555-0134"); // cell
    expect(row[14]).toBe("(305) 555-0100"); // work phone
    expect(row[15]).toBe("jane@bocacc.com"); // work email
    expect(row[16]).toBe("jane.personal@gmail.com"); // personal email
    expect(row[17]).toBe("A"); // email grade
    expect(row[20]).toBe("0.90"); // match confidence two decimals
  });

  it("leaves the three Luke columns blank", () => {
    const row = toSheetRow({ requestId: "R-1", clubName: "X" });
    expect(row[24]).toBe("");
    expect(row[25]).toBe("");
    expect(row[26]).toBe("");
  });

  it("keeps blanks blank and never invents a value", () => {
    const row = toSheetRow({ requestId: "R-1", clubName: "X" });
    expect(row[13]).toBe(""); // no cell
    expect(row[15]).toBe(""); // no work email
    expect(row[20]).toBe(""); // no confidence
    expect(row[10]).toBe(""); // no tier
  });
});
