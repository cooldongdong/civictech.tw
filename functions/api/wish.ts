// POST /api/wish — 首頁許願池的表單送到這裡，由 GitHub App 代開一張 issue。
//
// 為什麼要經過後端：送出的人不一定有 GitHub 帳號，所以不能直接導去 issues/new；
// 而開 issue 要用的私鑰不能放進前端。
//
// 流程：驗 Turnstile → 檢查欄位 → 用 App 私鑰換 installation token → 開 issue 並貼 wish 標籤。
// Slack 頻道訂閱 wish 標籤，所以每張提案一開出來就會進頻道。
// 看過沒問題的人在 Slack 卡片上按 Edit 補貼 wish-approved，網站才會顯示。
// 為什麼不倒過來（審核過才進 Slack）：GitHub 的 Slack app 只在 issue 開出來的那一刻看標籤，
// 事後補貼的標籤不會讓卡片跳出來（2026-10-31 實測）。
//
// 能補貼 wish-approved 的是對 repo 有寫入權、並在 Slack 連結過 GitHub 帳號的人。
// 不要做會自動貼 wish-approved 的 issue 模板：模板上的標籤連沒有權限的人用也會貼上，審核就被繞過了。
//
// 需要的環境變數（Cloudflare Pages → Settings → Variables and Secrets）：
//   GITHUB_APP_ID           GitHub App 的 App ID
//   GITHUB_APP_PRIVATE_KEY  App 的私鑰，GitHub 下載下來的 .pem 整份貼上（PKCS#1 或 PKCS#8 都可以）
//   TURNSTILE_SECRET        Turnstile 的 secret key
//   PUBLIC_SUGGEST_REPO     選填，issue 開在哪個 repo；不設就是 g0v/civictech-tw-data

import { buildBody, FIELDS, neutralize, PROGRESS, WISH_LABEL } from "../../src/lib/wish.ts";

interface Env {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  TURNSTILE_SECRET?: string;
  PUBLIC_SUGGEST_REPO?: string;
}

interface Context {
  request: Request;
  env: Env;
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.TURNSTILE_SECRET) {
    console.error("wish: 缺環境變數");
    return reply(500, "許願池的後端還沒設定好，請稍後再試。");
  }

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return reply(400, "送出的資料格式不對。");
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  if (!(await passTurnstile(String(data.turnstileToken ?? ""), env.TURNSTILE_SECRET, ip))) {
    return reply(403, "沒有通過機器人驗證，請重新整理頁面再送一次。");
  }

  const title = clean(data.title, 80);
  const values = Object.fromEntries(FIELDS.map((f) => [f.key, clean(data[f.key], f.max)]));
  if (!title || FIELDS.some((f) => !values[f.key])) return reply(400, "每一題都要填。");
  if (!PROGRESS.includes(values.progress)) return reply(400, "目前的進度只能從選單裡挑。");

  const body = buildBody(values);

  const repo = env.PUBLIC_SUGGEST_REPO || "g0v/civictech-tw-data";
  try {
    const token = await installationToken(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY, repo);
    const res = await github(`/repos/${repo}/issues`, token, {
      method: "POST",
      body: JSON.stringify({ title: neutralize(title), body, labels: [WISH_LABEL] }),
    });
    if (!res.ok) throw new Error(`開 issue 失敗 ${res.status}: ${await res.text()}`);
    const issue = (await res.json()) as { html_url: string };
    return Response.json({ ok: true, url: issue.html_url });
  } catch (err) {
    console.error("wish:", err);
    return reply(502, "送不出去，可能是 GitHub 那邊的問題。你填的內容還在，稍後再按一次送出。");
  }
}

function reply(status: number, message: string): Response {
  return Response.json({ ok: false, message }, { status });
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function passTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = (await res.json()) as { success?: boolean };
  return out.success === true;
}

function github(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "civictech.tw-wish",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

// 用 App 私鑰簽一張 JWT，查出 App 裝在這個 repo 的哪個 installation，再換一把一小時有效的 token。
// 不把 installation ID 設成環境變數，是因為測試 repo 和正式 repo 的 installation 不同，查一下比較不會設錯。
async function installationToken(appId: string, pem: string, repo: string): Promise<string> {
  const jwt = await appJwt(appId, pem);
  const inst = await github(`/repos/${repo}/installation`, jwt);
  if (inst.status === 401) throw new Error("GitHub 不認這把 JWT：私鑰被刪了，或 App ID 跟私鑰對不上");
  if (!inst.ok) throw new Error(`App 沒有裝在 ${repo}（${inst.status}）`);
  const { id } = (await inst.json()) as { id: number };
  const res = await github(`/app/installations/${id}/access_tokens`, jwt, { method: "POST" });
  if (!res.ok) throw new Error(`換 installation token 失敗 ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

async function appJwt(appId: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // iat 往回撥一分鐘，避開伺服器之間的時鐘誤差；GitHub 規定 exp 最多十分鐘
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toPkcs8(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

// GitHub 給的私鑰是 PKCS#1（BEGIN RSA PRIVATE KEY），但 WebCrypto 只吃 PKCS#8。
// 兩者差一層固定的外殼，這裡自己包上，就不用要求設定的人先跑 openssl 轉檔。
function toPkcs8(pem: string): Uint8Array {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  if (!pem.includes("BEGIN RSA PRIVATE KEY")) return der;
  const rsaAlgorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const inner = [0x02, 0x01, 0x00, ...rsaAlgorithm, 0x04, ...derLength(der.length), ...der];
  return new Uint8Array([0x30, ...derLength(inner.length), ...inner]);
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
