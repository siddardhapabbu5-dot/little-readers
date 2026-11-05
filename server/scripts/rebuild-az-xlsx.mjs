import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const csvPath = path.join(root, "docs/templates/A_to_Z_Alphabet_with_Symbols.csv");
const xlsxPath = path.join(root, "docs/templates/A_to_Z_Alphabet_with_Symbols.xlsx");

const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const rows = text
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "A-Z Alphabet");
XLSX.writeFile(wb, xlsxPath);
console.log("wrote", xlsxPath, "rows", rows.length - 1);
