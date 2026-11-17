import { ImportFailure, ingestionLimits } from "./model";
/** RFC 4180 quoting with LF tolerated; parsing never evaluates spreadsheet formulas. */
export function parseCsv(input: string): string[][] {
  if (new TextEncoder().encode(input).length > ingestionLimits.bytes)
    throw new ImportFailure("too-large");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  function field() {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 40) throw new ImportFailure("malformed-csv");
  }
  function record() {
    field();
    rows.push(row);
    row = [];
    if (rows.length > ingestionLimits.rows + 1) throw new ImportFailure("too-large");
  }
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += character;
      continue;
    }
    if (character === ",") {
      field();
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r") {
        if (input[index + 1] !== "\n") throw new ImportFailure("malformed-csv");
        index++;
      }
      record();
      continue;
    }
    if (closed) throw new ImportFailure("malformed-csv");
    if (character === '"') {
      if (cell) throw new ImportFailure("malformed-csv");
      quoted = true;
      continue;
    }
    cell += character;
  }
  if (quoted) throw new ImportFailure("malformed-csv");
  if (cell || closed || row.length) record();
  if (!rows.length) throw new ImportFailure("malformed-csv");
  return rows;
}
