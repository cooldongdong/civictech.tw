// 從 HackMD 把行動指引文章拷貝一份進 src/content/guides/。
//
// 哪些算「寫完的文章」由 jothon 的 bookmode 目錄決定，不在這裡另外維護一份清單：
// 目錄裡標了「[內容整理中]」的、「主題蒐集區」、以及「# 工作區」以下的，都不收。
// claire 寫完一篇、放進目錄，下次跑這支就會被撿到。
//
// 為什麼不在 build 時抓：理由跟 sync-data.mjs 一樣——落地成檔案之後，
// HackMD 上的每一次改動都會變成一顆看得到 diff 的 commit，而不是網站默默跟著變。
//
// 用法：
//   node scripts/sync-guides.mjs              同步目錄裡全部完整文章
//   node scripts/sync-guides.mjs S1TaMf4Izx   只同步指定的幾篇（HackMD 網址最後一段）
import { readFile, writeFile, mkdir } from "node:fs/promises";

const HOST = "https://g0v.hackmd.io";
const BOOK = `${HOST}/@jothon/guide`;
const OUT = new URL("../src/content/guides/", import.meta.url);

// 站內網址。HackMD 的 id 不好讀，也不好口頭轉述；沒列到的先用 id 頂著
const SLUGS = {
  rkM1ynawzl: "data-visualization",
  B1thBMlOfx: "data-driven-tactics",
  uzYt0oODRXe7kwdCnIxuBQ: "reaching-users",
  B14KGLsUze: "crowdsourced-reporting",
  Bk1bE0MOfe: "prototype-to-policy",
  S1TaMf4Izx: "government-budget",
  HkklOCBIGg: "legislation-tracking",
  ByUrwHv8Ge: "public-participation",
  HkQhtOdvze: "regional-revitalization",
  Vrb2bjZNQ86sKYglOmUdrA: "maps-and-gis",
  KYwkcSOMSbKGu2BC2xhTrw: "ai-applications",
};

async function fetchMarkdown(url) {
  const res = await fetch(`${url}/download`);
  if (!res.ok) throw new Error(`${url} 回 ${res.status}`);
  return res.text();
}

function stripFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? { yaml: m[1], body: md.slice(m[0].length) } : { yaml: "", body: md };
}

/** 從 bookmode 目錄撈出完整文章：{ id, url, title, section } */
function parseBook(md) {
  const articles = [];
  let section = "";
  for (const line of md.split("\n")) {
    if (/^# 工作區/.test(line)) break;
    const h = line.match(/^#{2,4}\s+(.+)/);
    if (h) {
      // 章節名只取第一段：「公私協力怎麼談<br>公部門和民間合作的方法<br>…」放在返回連結上太長
      section = h[1].split("<br>")[0].replace(/_(指引文章|素材筆記區)$/, "").trim();
      continue;
    }
    const link = line.match(/^\s*-\s*\[(.+?)\]\((\S+?)\)/);
    if (!link) continue;
    const [, title, href] = link;
    if (title.includes("[內容整理中]") || title.includes("蒐集區")) continue;
    // 目錄本身的導言頁（什麼是行動指引）不在任何章節底下，不算文章
    if (!section) continue;

    const url = new URL(href.replace(/\?view$/, ""), HOST).href;
    const id = url.split("/").pop();
    articles.push({ id, url, title: title.replace(/<br>/g, " ").trim(), section });
  }
  return articles;
}

// HackMD 專屬語法，Astro 的 markdown 不認得，會變成亂碼露在頁面上
const HACKMD_ONLY = [/^:::/m, /\{%\s*\w+/, /^\[TOC\]/m, /==[^=\n]+==/];

function yamlString(s) {
  return JSON.stringify(s);
}

const book = parseBook(await fetchMarkdown(BOOK));
if (book.length === 0) throw new Error("目錄裡一篇完整文章都沒撈到，目錄格式可能改了，不覆蓋既有檔案");

const only = process.argv.slice(2);
const targets = only.length ? book.filter((a) => only.includes(a.id)) : book;
const missing = only.filter((id) => !book.some((a) => a.id === id));
if (missing.length) throw new Error(`目錄裡找不到：${missing.join(", ")}`);

await mkdir(OUT, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
let changed = 0;

for (const a of targets) {
  const { yaml, body: raw } = stripFrontmatter(await fetchMarkdown(a.url));
  // 標題由頁面自己排，內文開頭的標題拿掉，避免同一個標題出現兩次。
  // 大多數篇用 #，但資料視覺化那篇用的是 ##
  let body = raw.replace(/^\s*#{1,2}\s+.+\n+/, "").trimEnd() + "\n";
  // 頁面的 h1 已經是文章標題，章節要從 h2 開始；法案那篇章節用 #，整篇往下降一級，
  // 不然一頁會有好幾個 h1，大綱也抓不到
  if (/^#\s/m.test(body)) body = body.replace(/^(#{1,5})\s/gm, "#$1 ");
  const tags = (yaml.match(/^tags:\s*(.+)$/m)?.[1] ?? "")
    .split(/[,、]/)
    .map((t) => t.trim())
    .filter(Boolean);

  // 頁面上寫死了「Claire Cheng 與揪松團、CC BY 4.0」，哪天有一篇不是，要有人去改頁面
  if (!/授權：CC BY 4\.0/.test(body)) console.warn(`⚠️  ${a.id} 沒寫 CC BY 4.0 授權，先確認能不能轉載`);
  for (const re of HACKMD_ONLY) {
    if (re.test(body)) console.warn(`⚠️  ${a.id} 有 HackMD 專屬語法（${re}），頁面上可能顯示不正常`);
  }

  const file = new URL(`${SLUGS[a.id] ?? a.id}.md`, OUT);
  const previous = await readFile(file, "utf8").catch(() => null);
  // 內文沒變就不動檔案，免得每跑一次 syncedAt 就換一次、產生沒意義的 diff
  if (previous && stripFrontmatter(previous).body === body) continue;

  const frontmatter = [
    "---",
    `title: ${yamlString(a.title)}`,
    `section: ${yamlString(a.section)}`,
    `source: ${a.url}`,
    `tags: [${tags.map(yamlString).join(", ")}]`,
    `syncedAt: ${today}`,
    "---",
    "",
  ].join("\n");

  await writeFile(file, frontmatter + body);
  changed++;
  console.log(`${previous ? "更新" : "新增"}：${a.title}`);
}

console.log(`目錄裡有 ${book.length} 篇完整文章，這次同步 ${targets.length} 篇，${changed} 篇有變動`);
