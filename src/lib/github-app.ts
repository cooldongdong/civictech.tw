// 用 GitHub App 的身分呼叫 GitHub API。
// 兩個地方用：functions/api/wish.ts 開 issue，src/lib/wish.ts 在 build 時抓提案。
// 只用 fetch 與 WebCrypto，Cloudflare Pages Function 與 Node 都跑得動。

export function github(path: string, token: string, init: RequestInit = {}): Promise<Response> {
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
export async function installationToken(appId: string, pem: string, repo: string): Promise<string> {
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
