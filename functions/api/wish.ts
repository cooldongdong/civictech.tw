// POST /api/wish — 首頁許願池的表單送到這裡，由 GitHub App 代開一張 issue。
//
// 為什麼要經過後端：送出的人不一定有 GitHub 帳號，所以不能直接導去 issues/new；
// 而開 issue 要用的私鑰不能放進前端。
//
// 流程：驗 Turnstile → 檢查欄位 → 用 App 私鑰換 installation token → 開 issue 並貼「許願池」標籤。
// 審核的人在 GitHub 上補貼「許願池-通過」，才會進 Slack 頻道、才會出現在網站上。
//
// 需要的環境變數（Cloudflare Pages → Settings → Variables and Secrets）：
//   GITHUB_APP_ID           GitHub App 的 App ID
//   GITHUB_APP_PRIVATE_KEY  App 的私鑰，GitHub 下載下來的 .pem 整份貼上（PKCS#1 或 PKCS#8 都可以）
//   TURNSTILE_SECRET        Turnstile 的 secret key
//   PUBLIC_SUGGEST_REPO     選填，issue 開在哪個 repo；不設就是 g0v/civictech-tw-data

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

const WISH_LABEL = "許願池";
const PROGRESS = ["已有構想", "已有草稿", "已有資料"];

// 欄位名稱同時是 issue 內文的小標題，前端靠這些小標題把內文拆回欄位，改名要兩邊一起改
const FIELDS = [
  { key: "description", heading: "一句話形容", max: 200 },
  { key: "painPoint", heading: "現有工具的不足", max: 2000 },
  { key: "superpower", heading: "需要的超能力", max: 300 },
  { key: "progress", heading: "目前的進度", max: 20 },
] as const;

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

  const body = [
    "<!-- 這張 issue 由 civictech.tw 首頁的許願池送出。貼上「許願池-通過」標籤後會進 Slack、出現在網站上。 -->",
    ...FIELDS.map((f) => `### ${f.heading}\n\n${escapeHeadings(neutralize(values[f.key]))}`),
  ].join("\n\n");

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

// 送出的文字會原樣進到公開 issue，先拆掉會波及別人的寫法：
// @某人 會通知對方，#123 與 owner/repo#123 會在別的 issue 留下反向連結。
// 在中間塞一個零寬空白，看起來一樣，GitHub 就不會認。
function neutralize(text: string): string {
  return text.replace(/@(?=\w)/g, "@\u200b").replace(/#(?=\d)/g, "#\u200b");
}

// 行首的 # 會變成小標題，打亂前端拆欄位用的 ### 小標題，跳脫掉
function escapeHeadings(text: string): string {
  return text.replace(/^(\s*)#/gm, "$1\\#");
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
