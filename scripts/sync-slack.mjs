// 從 g0v Slack 封存站取回「頻道名稱 → 頻道 ID」，寫成 src/data/slack-channels.json。
//
// 資料庫只存頻道名稱，但封存站的網址用的是 ID（/index/channel/C6HN8HRGD），
// 所以專案頁要連到「看過去的討論」，得先有這份對照。只留專案用得到的頻道。
// 對不到的（頻道改過名、或根本沒被封存）記成 null，頁面上就只給「加入討論」，不放壞連結。
//
// 用法：node scripts/sync-slack.mjs（在 sync-data.mjs 之後跑）
import { readFile, writeFile } from "node:fs/promises";

const INDEX = "https://g0v-slack-archive.g0v.ronny.tw/";
const PROJECTS = new URL("../src/data/projects.json", import.meta.url);
const OUT = new URL("../src/data/slack-channels.json", import.meta.url);

const channelName = (v) =>
  typeof v === "string" ? v.replace(/[#|]/g, "").trim() || undefined : undefined;

const { records } = JSON.parse(await readFile(PROJECTS, "utf8"));
// 頻道來源有兩個：資料庫的 slack channel 欄，以及 AI insight「討論在哪裡」那行寫到的 #頻道
// （有些專案只在 insight 裡找得到頻道，資料庫那欄是空的）
const fromInsight = (t) => (typeof t === "string" ? t.match(/^討論在哪裡：.*?#([\w\-\u4e00-\u9fff]+)/m)?.[1] : undefined);
const wanted = [
  ...new Set(records.flatMap((r) => [channelName(r.fields["slack channel"]), fromInsight(r.fields["AI insight"])]).filter(Boolean)),
].sort();

const res = await fetch(INDEX);
if (!res.ok) throw new Error(`${INDEX} 回 ${res.status}`);
const html = await res.text();
const ids = new Map([...html.matchAll(/href="\/index\/channel\/(\w+)"[^>]*>#([^<]+)<\/a>/g)].map((m) => [m[2].trim(), m[1]]));
if (ids.size === 0) throw new Error("封存站首頁沒解析出任何頻道，不覆蓋既有檔案");

const out = Object.fromEntries(wanted.map((n) => [n, ids.get(n) ?? null]));
await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
const missing = wanted.filter((n) => !ids.has(n));
console.log(`封存站共 ${ids.size} 個頻道；專案用到 ${wanted.length} 個，對不到 ${missing.length} 個${missing.length ? "：" + missing.join("、") : ""}`);
