// 從 GitHub API 抓每個專案 repo 的最後一次 push，寫成 src/data/github.json。
//
// 跟 sync-data.mjs 同一個理由，不在 build 時抓：build 時打 API 會吃 rate limit
// （沒帶 token 一小時 60 次，Cloudflare 的建置機還是共用 IP），而且圖會「哪天自己變了」沒人知道。
// 落地成檔案之後，哪個 repo 被封存、哪個又動起來了，都是 diff 裡看得到的一行。
//
// 只抓指到單一 repo 的連結（github.com/owner/repo）。只連到組織首頁的（github.com/g0v）
// 看不出是哪個 repo，跳過，頁面上會照實說有幾個。
//
// 用法：node scripts/sync-github.mjs
// 有 GITHUB_TOKEN 就用（一小時 5000 次）；沒有就試 `gh auth token`；都沒有就裸打，數量少還撐得住。
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const SRC = new URL("../src/data/projects.json", import.meta.url);
const OUT = new URL("../src/data/github.json", import.meta.url);

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync("gh auth token", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return undefined;
  }
}

/** github.com/Owner/Repo(.git)(/tree/...) → owner/repo；不是單一 repo 的回 undefined */
export function repoKey(url) {
  const m = String(url ?? "")
    .replace(/[​-‍﻿]/g, "")
    .match(/github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i);
  if (!m) return undefined;
  return `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase();
}

const projects = JSON.parse(await readFile(SRC, "utf8"));
const keys = [...new Set(projects.records.map((r) => repoKey(r.fields.github)).filter(Boolean))].sort();

const auth = token();
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "civictech.tw-sync",
  ...(auth && { Authorization: `Bearer ${auth}` }),
};

const repos = {};
for (const key of keys) {
  const res = await fetch(`https://api.github.com/repos/${key}`, { headers });
  if (res.status === 404 || res.status === 451) {
    // 被刪掉、改成私有、或被下架：在資料庫裡還連著，但點進去已經沒有東西
    repos[key] = { missing: true };
    continue;
  }
  if (!res.ok) throw new Error(`${key} 回 ${res.status}：${await res.text()}`);
  const j = await res.json();
  repos[key] = {
    // 改過名的 repo，API 會自動轉到新名字；記下來，頁面上連結才會對
    fullName: j.full_name,
    pushedAt: j.pushed_at,
    archived: j.archived,
    stars: j.stargazers_count,
  };
}

const out = { syncedAt: new Date().toISOString(), repos };
await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
const missing = Object.values(repos).filter((r) => r.missing).length;
console.log(`已更新 ${keys.length} 個 repo（${missing} 個已經找不到）`);
