import { describe, it, expect } from "vitest";
import { detectColumns, rowToSuppressionKeys, summarizeImport } from "./import";

describe("detectColumns", () => {
  it("auto detects common header names", () => {
    const m = detectColumns([
      "Full Name",
      "Company",
      "Job Title",
      "LinkedIn URL",
      "Email Address",
      "Mobile",
      "Website",
    ]);
    expect(m).toEqual({
      name: "Full Name",
      company: "Company",
      title: "Job Title",
      linkedin: "LinkedIn URL",
      email: "Email Address",
      phone: "Mobile",
      website: "Website",
    });
  });

  it("leaves unmatched fields unmapped", () => {
    const m = detectColumns(["Name", "Notes", "Random"]);
    expect(m.name).toBe("Name");
    expect(m.email).toBeUndefined();
  });
});

describe("rowToSuppressionKeys", () => {
  const mapping = {
    name: "Name",
    company: "Company",
    linkedin: "LinkedIn",
    email: "Email",
    phone: "Phone",
    website: "Website",
  };

  it("produces keys for each present field", () => {
    const { keys } = rowToSuppressionKeys(
      {
        Name: "Jane Doe",
        Company: "Boca CC",
        LinkedIn: "https://www.linkedin.com/in/jane/",
        Email: "Jane@Example.com",
        Phone: "(305) 555-0134",
        Website: "https://www.bocacc.com",
      },
      mapping,
    );
    const types = keys.map((k) => k.keyType).sort();
    expect(types).toEqual(["domain", "email", "linkedin", "name_employer", "phone"]);
  });

  it("skips blank cells", () => {
    const { keys } = rowToSuppressionKeys({ Name: "Jane", Company: "", Email: "" }, mapping);
    expect(keys).toHaveLength(0);
  });
});

describe("summarizeImport", () => {
  it("counts rows, keys, and duplicates skipped", () => {
    const mapping = { email: "Email" };
    const summary = summarizeImport(
      [{ Email: "a@b.com" }, { Email: "A@B.com" }, { Email: "c@d.com" }],
      mapping,
    );
    expect(summary.rowsRead).toBe(3);
    expect(summary.keysCreated).toBe(2);
    expect(summary.duplicatesSkipped).toBe(1);
  });
});
