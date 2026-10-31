// 提案單篇頁（/w/[number]）下方的討論區：在瀏覽器裡即時抓，不在 build 時抓。
// 討論一直在長，build 卻只在貼標籤、改內文時才會觸發，在 build 時抓會一直是舊的。
//
// 兩個來源合在一起，照時間排：
//   GitHub：issue 底下的留言。用 html 格式抓，GitHub 已經把 markdown 轉好、也清過危險的標籤。
//   Slack：g0v Slack 封存站（g0v-slack-archive.g0v.ronny.tw）的 getmessage API。
//     GitHub 的 Slack app 會為每張提案貼一張卡片，卡片裡有 issue 網址；找到那張卡片，
//     底下 thread_ts 跟它一樣的就是這個提案的討論串。
//     討論串裡也有 GitHub app 同步過來的留言，那些跟上面的 GitHub 留言重複，所以濾掉所有 bot 訊息。
//     封存站只收訊息原本的樣子：在 Slack 上改過、刪掉的，封存站和這裡都還會是舊的。

export interface Comment {
  source: "github" | "slack";
  author: string;
  avatar?: string;
  at: number; // 毫秒
  html: string;
  url?: string;
}

const ARCHIVE = "https://g0v-slack-archive.g0v.ronny.tw";
// 一頁 100 則，最多往回翻 10 頁。頻道是許願池專用的，一千則內一定找得到；找不到就當作沒有
const ARCHIVE_PAGES = 10;

export async function githubComments(repo: string, number: number): Promise<Comment[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues/${number}/comments?per_page=100`, {
    headers: { Accept: "application/vnd.github.html+json" },
  });
  if (!res.ok) throw new Error(`GitHub 留言抓不到（${res.status}）`);
  const list = (await res.json()) as {
    user: { login: string; avatar_url: string; type: string };
    body_html: string;
    created_at: string;
    html_url: string;
  }[];
  return list
    .filter((c) => c.user.type !== "Bot")
    .map((c) => ({
      source: "github",
      author: c.user.login,
      avatar: c.user.avatar_url,
      at: Date.parse(c.created_at),
      html: c.body_html,
      url: c.html_url,
    }));
}

interface SlackMessage {
  ts: string;
  thread_ts?: string;
  text?: string;
  bot_id?: string;
  user?: { is_bot?: boolean; real_name?: string; name?: string; profile?: { display_name?: string; image_48?: string } };
  [key: string]: unknown;
}

/** 從 PUBLIC_WISH_SLACK_URL（https://g0v-tw.slack.com/archives/C0CDLS6NN3F）取出頻道 ID */
export function slackChannelId(url: string | undefined): string | undefined {
  return url?.match(/\/archives\/([A-Z0-9]+)/)?.[1];
}

export async function slackComments(channel: string, issueUrl: string): Promise<Comment[]> {
  const seen: SlackMessage[] = [];
  let url = `${ARCHIVE}/index/getmessage?channel=${channel}&count=100`;
  for (let page = 0; page < ARCHIVE_PAGES; page++) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Slack 封存站抓不到（${res.status}）`);
    const data = (await res.json()) as { messages?: SlackMessage[]; previous_url?: string } | 0;
    // 頻道還沒被封存站收錄時，它回的是 0
    if (!data || !data.messages?.length) break;
    seen.push(...data.messages);
    const thread = findThread(seen, issueUrl);
    if (thread) return thread;
    if (!data.previous_url) break;
    url = data.previous_url;
  }
  return [];
}

/** 找到提到這張 issue 的 GitHub 卡片，回傳它底下真人的回覆；還沒找到卡片就回 undefined */
export function findThread(messages: SlackMessage[], issueUrl: string): Comment[] | undefined {
  // issues/12 不能配到 issues/123：網址後面要接一個不是數字的字元
  const pattern = new RegExp(`${issueUrl.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![0-9])`);
  const card = messages.find((m) => isBot(m) && pattern.test(JSON.stringify(m)));
  if (!card) return undefined;
  return messages
    .filter((m) => m.thread_ts === card.ts && m.ts !== card.ts && !isBot(m))
    .map((m) => ({
      source: "slack",
      author: m.user?.profile?.display_name || m.user?.real_name || m.user?.name || "g0v Slack 成員",
      avatar: m.user?.profile?.image_48,
      at: Math.round(parseFloat(m.ts) * 1000),
      html: slackTextToHtml(m.text ?? ""),
    }));
}

function isBot(m: SlackMessage): boolean {
  return Boolean(m.bot_id || m.user?.is_bot);
}

/**
 * Slack 的 mrkdwn 轉成安全的 HTML：先整段跳脫，再把 <網址|文字> 變回連結。
 * 不用封存站給的 html_content：那是別的網站產生的 HTML，直接塞進頁面等於信任它不會夾帶腳本。
 */
export function slackTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return escaped
    .replace(/&lt;(https?:\/\/[^|\s]+?)\|([^\n]+?)&gt;/g, (_, href, label) => link(href, label))
    .replace(/&lt;(https?:\/\/[^\s]+?)&gt;/g, (_, href) => link(href, href))
    .replace(/&lt;@[A-Z0-9]+(?:\|([^&]+))?&gt;/g, (_, name) => `@${name ?? "某位成員"}`)
    .replace(/&lt;#[A-Z0-9]+\|([^&]+)&gt;/g, "#$1")
    .replace(/\n/g, "<br>");
}

function link(href: string, label: string): string {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
}
