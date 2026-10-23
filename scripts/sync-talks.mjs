// 從公開 API 取回大松提案紀錄，寫成 src/data/talks.json。首頁「十幾年的黑客松」那一段用。
//
// 跟 sync-data.mjs 一樣落地成檔案、每次更新一顆 commit，理由見那支檔案的開頭。
// 只留首頁用得到的欄位，其餘（人力徵求、影片等）不帶進網站。
//
// 用法：node scripts/sync-talks.mjs
import { writeFile } from "node:fs/promises";

const SRC = "https://data.civictech.tw/v0/tech/talks.json";
const OUT = new URL("../src/data/talks.json", import.meta.url);
const KEEP = ["presentation name", "date", "event name", "no.", "related project"];

const res = await fetch(SRC);
if (!res.ok) throw new Error(`${SRC} 回 ${res.status}`);
const json = await res.json();
if (!Array.isArray(json.records) || json.records.length === 0) {
  throw new Error("抓回來的資料沒有 records，不覆蓋既有檔案");
}

const records = json.records.map((r) => ({
  id: r.id,
  fields: Object.fromEntries(KEEP.filter((k) => r.fields[k] != null).map((k) => [k, r.fields[k]])),
}));
await writeFile(OUT, JSON.stringify({ records }, null, 1) + "\n");
console.log(`已更新 ${records.length} 筆大松提案`);
