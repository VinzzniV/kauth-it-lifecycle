import { read, utils } from "xlsx";

/** Prefer strict UTF-8, then the legacy HR export encoding. */
export function decodeCsv(bytes: ArrayBuffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  let inQuote = false, semicolons = 0, commas = 0;
  for (let i = 0; i < Math.min(text.length, 8192); i++) {
    if (text[i] === '"') { if (inQuote && text[i + 1] === '"') i++; else inQuote = !inQuote; }
    else if (!inQuote && text[i] === ";") semicolons++;
    else if (!inQuote && text[i] === ",") commas++;
  }
  const delimiter = semicolons >= commas ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; closed = false; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = ""; closed = false;
    } else if (closed && !/\s/.test(ch)) throw new Error("CSV: Zeichen nach schließendem Anführungszeichen.");
    else if (!closed) cell += ch;
  }
  if (quoted) throw new Error("CSV: Nicht geschlossenes Anführungszeichen.");
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}

export function readHrRows(bytes: ArrayBuffer, filename: string): unknown[][] {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Die HR-Datei darf höchstens 10 MB groß sein.");
  if (/\.csv$/i.test(filename)) return parseCsv(decodeCsv(bytes));
  if (!/\.xlsx?$/i.test(filename)) throw new Error("Bitte CSV, XLS oder XLSX verwenden.");
  const workbook = read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Die Arbeitsmappe enthält kein Tabellenblatt.");
  return utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
}
