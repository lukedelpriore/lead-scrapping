/**
 * A small correct CSV parser. Handles quoted fields, escaped quotes (""),
 * commas and newlines inside quotes, and CRLF. Pure and unit tested, so the
 * suppression import does not need a third party dependency for CSV. XLSX is
 * parsed by the caller with a spreadsheet library and passed as rows.
 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text);
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0]!.map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i]!;
    if (rec.length === 1 && rec[0] === "") continue; // skip blank line
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = rec[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // handle CRLF or lone CR
      if (text[i + 1] === "\n") i += 1;
      pushRecord();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // trailing field or record
  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }
  return records;
}
