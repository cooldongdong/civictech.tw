// 從公開 API 取回專案資料，覆蓋 src/data/projects.json。
//
// 為什麼不在 build 時 fetch：build 時抓，等於「哪天 Airtable 改了、網站就跟著變」
// 而且沒有任何人看得到那個變化。落地成檔案之後，每次資料更新都是一顆 commit，
// diff 看得出來誰被加進來、誰的簡介被改掉。
//
// 用法：node scripts/sync-data.mjs
import { writeFile } from "node:fs/promises";

const SRC = "https://data.civictech.tw/v0/tech/projects.json";
const OUT = new URL("../src/data/projects.json", import.meta.url);

const res = await fetch(SRC);
if (!res.ok) throw new Error(`${SRC} 回 ${res.status}`);

const json = await res.json();
if (!Array.isArray(json.records) || json.records.length === 0) {
  throw new Error("抓回來的資料沒有 records，不覆蓋既有檔案");
}

await writeFile(OUT, JSON.stringify(json, null, 2) + "\n");
console.log(`已更新 ${json.records.length} 筆專案`);
