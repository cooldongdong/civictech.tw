// 許願池 issue 內文的格式：functions/api/wish.ts 用 buildBody 組，首頁卡片用 parseBody 拆回欄位。
//
// 小標題用「emoji ＋ 粗體」而不是 ###：Slack 卡片會吃掉空行、也不顯示 ###，
// 只剩 emoji 和粗體分得出段落。比對小標題時只看文字、不看 emoji。

// 標籤用英文：GitHub 的 Slack app 訂閱過濾（+label:）不吃中文標籤名稱，中文說明寫在標籤的描述欄
export const WISH_LABEL = "wish";
export const APPROVED_LABEL = "wish-approved";

export const PROGRESS = ["已有構想", "已有草稿", "已有資料"];

export const FIELDS = [
  { key: "description", emoji: "💡", heading: "一句話形容", max: 200 },
  { key: "painPoint", emoji: "😣", heading: "現有工具的不足", max: 2000 },
  { key: "superpower", emoji: "🙋", heading: "需要的超能力", max: 300 },
  { key: "progress", emoji: "🚦", heading: "目前的進度", max: 20 },
] as const;

export type WishFields = Partial<Record<(typeof FIELDS)[number]["key"], string>>;

export function buildBody(values: Record<string, string>): string {
  return FIELDS.map((f) => `**${f.emoji} ${f.heading}**\n${escapeLeading(neutralize(values[f.key]))}`).join("\n\n");
}

export function parseBody(body: string): WishFields {
  const fields: WishFields = {};
  const parts = body.split(/^\*\*(.+)\*\*[ \t]*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const field = FIELDS.find((f) => parts[i].includes(f.heading));
    if (field) fields[field.key] = unescapeLeading(parts[i + 1].trim());
  }
  return fields;
}

// 送出的文字會原樣進到公開 issue，先拆掉會波及別人的寫法：
// @某人 會通知對方，#123 與 owner/repo#123 會在別的 issue 留下反向連結。
// 在中間塞一個零寬空白，看起來一樣，GitHub 就不會認。
export function neutralize(text: string): string {
  return text.replace(/@(?=\w)/g, "@\u200b").replace(/#(?=\d)/g, "#\u200b");
}

// 行首的 ** 可能被當成欄位小標題、打亂 parseBody，行首的 # 會在 GitHub 上變成大標題，都跳脫掉
function escapeLeading(text: string): string {
  return text.replace(/^(\s*)\*\*/gm, "$1\\*\\*").replace(/^(\s*)#/gm, "$1\\#");
}

function unescapeLeading(text: string): string {
  return text.replace(/^(\s*)\\\*\\\*/gm, "$1**").replace(/^(\s*)\\#/gm, "$1#");
}
