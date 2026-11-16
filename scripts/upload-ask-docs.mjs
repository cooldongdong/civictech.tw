#!/usr/bin/env node
// 把黑客松鼠的知識庫（dist/ask-docs.json）上傳到 Cloudflare AI Search 的內建儲存。
//
// 用法（先 npm run build，產出 dist/ask-docs.json）：
//   CF_ACCOUNT_ID=... AI_SEARCH_ADMIN_TOKEN=... node scripts/upload-ask-docs.mjs [--dry-run]
//
// token 要有 Account › AI Search:Edit。這把是管理用的，只在本機用，不要放進 Pages。
// Pages 上的 AI_SEARCH_TOKEN 只給 Run 權限。
//
// 做三件事：實例不存在就建一個 → 全部文件重新上傳 → 知識庫裡已經沒有的文件刪掉。
// 什麼時候要跑：sync-data.mjs 或 sync-guides.mjs 之後。不跑的話，機器人講的是舊資料。

import { readFile } from "node:fs/promises";

const ACCOUNT = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.AI_SEARCH_ADMIN_TOKEN;
const INSTANCE = process.env.AI_SEARCH_INSTANCE || "civictech-tw";
const DRY = process.argv.includes("--dry-run");

if (!ACCOUNT || !TOKEN) {
  console.error("需要 CF_ACCOUNT_ID 與 AI_SEARCH_ADMIN_TOKEN");
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai-search/namespaces/default/instances`;

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

const docs = JSON.parse(await readFile(new URL("../dist/ask-docs.json", import.meta.url), "utf8"));
console.log(`知識庫：${docs.length} 份文件`);

// 1. 實例
const got = await api(`/${INSTANCE}`);
if (got.status === 404) {
  console.log(`建立實例 ${INSTANCE}`);
  if (!DRY) {
    const made = await api("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: INSTANCE }),
    });
    if (!made.ok) throw new Error(`建立實例失敗 ${made.status}: ${JSON.stringify(made.body)}`);
  }
} else if (!got.ok) {
  throw new Error(`讀不到實例 ${got.status}: ${JSON.stringify(got.body)}`);
}

// 2. 現有文件
const existing = new Map();
for (let page = 1; ; page++) {
  const list = await api(`/${INSTANCE}/items?page=${page}&per_page=50`);
  if (!list.ok) {
    if (got.status === 404) break; // 剛建好的實例，還沒有東西
    throw new Error(`列出文件失敗 ${list.status}: ${JSON.stringify(list.body)}`);
  }
  const items = list.body.result ?? [];
  for (const it of items) existing.set(it.key, it);
  const info = list.body.result_info;
  if (items.length === 0 || !info || page * (info.per_page ?? 50) >= (info.total_count ?? 0)) break;
}
console.log(`AI Search 上現有 ${existing.size} 份`);

// 3. 全部重傳。同一個 key 再傳一次會直接覆蓋（2026-11-16 實測，id 不變）。
// 不做「只傳有變的」：AI Search 回傳的 checksum 不是內容的 md5，比對不出來。
// 231 份大約 10 萬 token，每月免費的 ingestion 額度是 500 萬，全部重傳不心疼。
let uploaded = 0;
for (const d of docs) {
  uploaded++;
  if (DRY) continue;
  const form = new FormData();
  form.append("file", new Blob([d.text], { type: "text/markdown" }), d.key);
  const up = await api(`/${INSTANCE}/items`, { method: "POST", body: form });
  if (!up.ok) throw new Error(`上傳 ${d.key} 失敗 ${up.status}: ${JSON.stringify(up.body)}`);
  if (uploaded % 50 === 0) console.log(`  已上傳 ${uploaded}`);
}

// 4. 刪掉已經不在知識庫裡的（例如專案在 Airtable 被下架、改了 slug）
const keys = new Set(docs.map((d) => d.key));
let removed = 0;
for (const [key, it] of existing) {
  if (keys.has(key)) continue;
  removed++;
  if (DRY) {
    console.log(`  會刪除 ${key}`);
    continue;
  }
  const del = await api(`/${INSTANCE}/items/${it.id}`, { method: "DELETE" });
  if (!del.ok) throw new Error(`刪除 ${key} 失敗 ${del.status}: ${JSON.stringify(del.body)}`);
}

console.log(`${DRY ? "（試跑）" : ""}上傳 ${uploaded} 份、刪除 ${removed} 份。索引在背景跑，通常一兩分鐘內完成`);
