// 黑客松鼠（問答機器人）前後端共用的設定。後端在 functions/api/ask.ts，前端在 src/components/AskSquirrel.astro。

/** 一個問題最多幾個字。對話框的 maxlength 跟後端的檢查都用這個 */
export const MAX_QUESTION = 300;

/** 送給模型的對話最多保留幾輪（一問一答算一輪）。太長的話檢索會被舊話題帶偏，也比較花額度 */
export const MAX_TURNS = 4;

export const ASK_PROMPT = `你是「黑客松鼠」，台灣公民科技資料庫 civictech.tw 的嚮導，住在 g0v 社群裡，喜歡收集各種公民科技專案，就像松鼠收集松果。

你的任務：幫第一次來的人找到跟他關心的事有關的公民科技專案與行動指引，並告訴他下一步可以去哪裡。

規則：
1. 只根據檢索到的資料回答。資料裡沒有的事，就說「資料庫裡我沒找到」，不要用自己的知識補。
2. 提到專案或文章時，一律用 Markdown 連結，網址只能用資料裡「專案頁：」或「文章頁：」後面那個 civictech.tw 的網址，不可以自己編網址。
3. 一次推薦一到四個最相關的，每個用一句話說它做什麼、為什麼跟問題有關。
4. 用繁體中文、口語、親切，回答控制在 200 字以內。可以偶爾帶一點松鼠的口吻，但不要每句都裝可愛。
5. 找不到合適的專案時，建議他到 https://civictech.tw/w/new 許願，讓社群看見這個需求。
6. 不回答跟公民科技、g0v、開放政府、這個網站無關的問題，禮貌地把話題帶回來。`;

const SITE = "https://civictech.tw";

/**
 * 知識庫文件的 key 換成站內連結。key 的格式定在 src/pages/ask-docs.json.ts：
 * p--<slug>.md 是專案、g--<slug>.md 是行動指引。認不得的 key 不列成來源。
 */
export function sourceOf(key: string, title?: string): { title: string; url: string; kind: "project" | "guide" } | undefined {
  const m = key.match(/^(?:.*\/)?([pg])--(.+)\.md$/);
  if (!m) return undefined;
  const slug = m[2];
  return {
    title: title ?? slug,
    url: `${SITE}/${m[1]}/${encodeURIComponent(slug)}`,
    kind: m[1] === "p" ? "project" : "guide",
  };
}

/**
 * 檢查回答裡的 civictech.tw 專案／文章連結。knownKeys 裡沒有的（模型自己湊出來的網址）拆掉連結、保留文字。
 * 只管 /p/ 與 /g/：其他站內頁（例如 /w/new）跟站外網址照原樣留著。
 */
export function checkLinks(text: string, knownKeys: Map<string, unknown>): { text: string; dropped: number } {
  let dropped = 0;
  const out = text.replace(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?civictech\.tw\/([pg])\/([^)\s#?]+)[^)\s]*)\)/g, (all, label, _url, kind, slug) => {
    let s = slug;
    try {
      s = decodeURIComponent(slug);
    } catch {}
    if (knownKeys.has(`${kind}--${s.replace(/\.html$/, "")}.md`)) return all;
    dropped++;
    return label;
  });
  return { text: out, dropped };
}
