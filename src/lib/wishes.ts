// build 時從 GitHub 抓通過審核（open 且貼了 wish-approved）的提案，給首頁、/w、/w/[number] 用。
//
// 這是「build 時不抓外部資料」的例外（理由見 scripts/sync-data.mjs 開頭）。
// 專案資料是我們整理的，落地成檔案才看得到誰改了什麼；提案是訪客送進來的即時內容，
// 每一次變動在 GitHub 上本來就有紀錄（誰開的、誰貼的標籤、內文改了什麼），不必再落地一份。
// 通過、拿掉標籤、關閉、改內文時，g0v/civictech-tw-data 的 Action 會觸發 Cloudflare 重新部署。
//
// 抓不到就讓 build 失敗：Cloudflare 會留著上一版，總比部署出一個空的許願池好。
import { execFileSync } from "node:child_process";
import { github, installationToken } from "./github-app";
import { APPROVED_LABEL, parseBody, type WishFields } from "./wish";

export const WISH_REPO = import.meta.env.PUBLIC_SUGGEST_REPO || "g0v/civictech-tw-data";

export interface Wish extends WishFields {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  comments: number;
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  comments: number;
  pull_request?: unknown;
}

let cached: Promise<Wish[]> | undefined;

/** 新的在前。同一次 build 只抓一次 */
export function getWishes(): Promise<Wish[]> {
  return (cached ??= load());
}

async function load(): Promise<Wish[]> {
  const token = await buildToken();
  const issues: Issue[] = [];
  for (let page = 1; ; page++) {
    const path = `/repos/${WISH_REPO}/issues?labels=${encodeURIComponent(APPROVED_LABEL)}&state=open&sort=created&direction=desc&per_page=100&page=${page}`;
    const res = token
      ? await github(path, token)
      : await fetch(`https://api.github.com${path}`, { headers: { "User-Agent": "civictech.tw-build" } });
    if (!res.ok) throw new Error(`許願池：抓 ${WISH_REPO} 的提案失敗（${res.status}）：${await res.text()}`);
    const batch = (await res.json()) as Issue[];
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  return issues
    .filter((i) => !i.pull_request)
    .map((i) => ({
      ...parseBody(i.body ?? ""),
      number: i.number,
      title: i.title,
      url: i.html_url,
      createdAt: i.created_at,
      comments: i.comments,
    }));
}

// Cloudflare 的建置機是共用 IP，匿名查詢的每小時 60 次可能被別人用光，所以能帶身分就帶：
// 有 App 的設定（跟 /api/wish 同一組）就用 App；本機有 GITHUB_TOKEN 或登入過 gh 也行；都沒有才匿名。
async function buildToken(): Promise<string | undefined> {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_TOKEN } = process.env;
  if (GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY) return installationToken(GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, WISH_REPO);
  if (GITHUB_TOKEN) return GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 「2026-10-31」：卡片與單篇頁都只顯示日期，用台灣時間算 */
export function wishDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}
