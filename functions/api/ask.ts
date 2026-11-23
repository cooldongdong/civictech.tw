// POST /api/ask — 右下角「黑客松鼠」的問答。
//
// 流程：驗 Turnstile → 整理對話 → 交給 Cloudflare AI Search（檢索＋生成一次做完）→
// 把檢索到的文件換成站內連結，跟回答一起回傳。
//
// 知識庫是 build 時產出的 dist/ask-docs.json（見 src/pages/ask-docs.json.ts），
// 由 scripts/upload-ask-docs.mjs 上傳。資料改了要重新上傳，機器人不會自己知道。
//
// 為什麼走 REST 而不是 binding：AI Search 的 Workers binding 文件沒有提到 Pages Functions，
// REST 一定能用，而且每題只多一趟同機房的請求。
//
// 需要的環境變數（Cloudflare Pages → Settings → Variables and Secrets）：
//   AI_SEARCH_TOKEN      API token，權限 Account › AI Search:Run（只需要 Run，不要給 Edit）
//   CF_ACCOUNT_ID        Cloudflare 帳號 ID
//   TURNSTILE_SECRET     跟許願池共用
//   AI_SEARCH_INSTANCE   選填，預設 civictech-tw
//   ASK_MODEL            選填，生成用的模型；不設就用 AI Search 實例的預設

import { ASK_PROMPT, MAX_QUESTION, MAX_TURNS, checkLinks, sourceOf } from "../../src/lib/ask.ts";

interface Env {
  AI_SEARCH_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  TURNSTILE_SECRET?: string;
  AI_SEARCH_INSTANCE?: string;
  ASK_MODEL?: string;
  ASSETS: { fetch(req: Request | string): Promise<Response> };
}

interface Context {
  request: Request;
  env: Env;
}

type Turn = { role: "user" | "assistant"; content: string };

interface Chunk {
  score?: number;
  item?: { key?: string };
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.AI_SEARCH_TOKEN || !env.CF_ACCOUNT_ID || !env.TURNSTILE_SECRET) {
    console.error("ask: 缺環境變數");
    return reply(500, "黑客松鼠還在準備中，請稍後再來。");
  }

  let data: { messages?: unknown; turnstileToken?: unknown };
  try {
    data = await request.json();
  } catch {
    return reply(400, "送出的資料格式不對。");
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  if (!(await passTurnstile(String(data.turnstileToken ?? ""), env.TURNSTILE_SECRET, ip))) {
    return reply(403, "沒有通過機器人驗證，請重新整理頁面再問一次。");
  }

  const turns = cleanTurns(data.messages);
  if (!turns) return reply(400, `問題要在 ${MAX_QUESTION} 字以內，而且不能是空的。`);

  const instance = env.AI_SEARCH_INSTANCE || "civictech-tw";
  const started = Date.now();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai-search/namespaces/default/instances/${instance}/chat/completions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AI_SEARCH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: ASK_PROMPT }, ...turns],
        ...(env.ASK_MODEL ? { model: env.ASK_MODEL } : {}),
        ai_search_options: {
          retrieval: { retrieval_type: "hybrid", max_num_results: 8 },
          // 追問（「那第二個呢？」）要靠改寫才搜得到東西
          query_rewrite: { enabled: turns.length > 1 },
        },
      }),
    },
  );

  if (!res.ok) {
    console.error(`ask: AI Search ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return reply(502, res.status === 429 ? "今天問的人太多，松鼠累了，明天再來好嗎？" : "松鼠一時想不起來，請再問一次。");
  }

  const raw = (await res.json()) as Record<string, any>;
  const out = (raw.result ?? raw) as { choices?: { message?: { content?: unknown } }[]; chunks?: Chunk[] };
  const titles = await docTitles(env, request.url);
  // 模型寫出來的站內連結，知識庫裡沒有那一頁的就拆掉連結、只留文字。不靠模型自律，連結一定點得到東西
  const { text: answer, dropped } = checkLinks(textOf(out.choices?.[0]?.message?.content).trim(), titles);

  // 檢索命中的文件（除錯與記錄用，前端不顯示：命中不等於回答有用到）。同一份文件可能好幾塊都命中，只列一次
  const seen = new Set<string>();
  const sources = (out.chunks ?? [])
    .map((c) => c.item?.key)
    .filter((k): k is string => !!k && !seen.has(k) && !!seen.add(k))
    .map((k) => sourceOf(k, titles.get(k)))
    .filter((s) => s !== undefined)
    .slice(0, 5);

  // 量額度用：之後要決定換模型或付費，要看每題實際花多少
  console.log(JSON.stringify({ ask: true, ms: Date.now() - started, turns: turns.length, chunks: out.chunks?.length ?? 0, dropped }));

  if (!answer) return reply(502, "松鼠一時想不起來，請再問一次。");
  return Response.json({ ok: true, answer, sources });
}

function cleanTurns(v: unknown): Turn[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const turns = v
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .map((t) => ({ role: t.role, content: String(t.content).trim().slice(0, 2000) }) as Turn)
    .filter((t) => t.content)
    .slice(-MAX_TURNS * 2);
  const last = turns.at(-1);
  if (!last || last.role !== "user" || last.content.length > MAX_QUESTION) return undefined;
  // 從使用者那一句開始，模型才不會把半截的上一輪當成開場
  while (turns[0]?.role !== "user") turns.shift();
  return turns;
}

function textOf(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  return "";
}

// 文件標題從同一次部署的 ask-docs.json 拿，跟知識庫是同一份來源
let titleCache: Map<string, string> | undefined;
async function docTitles(env: Env, url: string): Promise<Map<string, string>> {
  if (titleCache) return titleCache;
  try {
    const res = await env.ASSETS.fetch(new URL("/ask-docs.json", url).toString());
    const docs = (await res.json()) as { key: string; title: string }[];
    titleCache = new Map(docs.map((d) => [d.key, d.title]));
  } catch (e) {
    // 讀不到就沒辦法檢查連結，checkLinks 會把站內連結全部拆掉——寧可少連結，不要壞連結
    console.error("ask: 讀不到 ask-docs.json", e);
    return new Map();
  }
  return titleCache;
}

function reply(status: number, message: string): Response {
  return Response.json({ ok: false, message }, { status });
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
