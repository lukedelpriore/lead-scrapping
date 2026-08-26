import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a simple csv with a header", () => {
    const { headers, rows } = parseCsv("Name,Email\nJane,jane@x.com\nJohn,john@y.com");
    expect(headers).toEqual(["Name", "Email"]);
    expect(rows).toEqual([
      { Name: "Jane", Email: "jane@x.com" },
      { Name: "John", Email: "john@y.com" },
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const { rows } = parseCsv('Name,Company\n"Doe, Jane","The ""Big"" Club"');
    expect(rows[0]).toEqual({ Name: "Doe, Jane", Company: 'The "Big" Club' });
  });

  it("handles newlines inside quotes", () => {
    const { rows } = parseCsv('Name,Note\n"Jane","line1\nline2"');
    expect(rows[0]!.Note).toBe("line1\nline2");
  });

  it("handles CRLF line endings", () => {
    const { rows } = parseCsv("A,B\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      { A: "1", B: "2" },
      { A: "3", B: "4" },
    ]);
  });

  it("skips blank lines", () => {
    const { rows } = parseCsv("A\n1\n\n2\n");
    expect(rows).toEqual([{ A: "1" }, { A: "2" }]);
  });

  it("returns empty for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});
