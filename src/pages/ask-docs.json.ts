// 問答機器人（右下角的「問問看」）的知識庫原料：一個專案一份、一篇行動指引一份 Markdown。
//
// 為什麼在 Astro 裡產、不另寫腳本：專案資料要先經過 src/lib/projects.ts 的整理
// （清掉只貼網址的 Intro、拿掉「不明」的 insight 行、決定分類與 slug）才端得上桌。
// 另寫一份就會有兩套整理邏輯，總有一天會對不上——網頁上看到的和機器人說的會不一樣。
//
// build 之後由 scripts/upload-ask-docs.mjs 讀 dist/ask-docs.json，上傳到 Cloudflare AI Search。
// 每份文件的 key 決定了回答時附的連結：p--<slug>.md → /p/<slug>，g--<slug>.md → /g/<slug>。

import type { APIRoute } from "astro";
import { listedProjects } from "../lib/projects";
import { getGuides } from "../lib/guides";
import { categoryBySlug } from "../data/categories";

const SITE = "https://civictech.tw";

export interface AskDoc {
  key: string;
  title: string;
  url: string;
  text: string;
}

export const GET: APIRoute = async () => {
  const projects: AskDoc[] = listedProjects.map((p) => {
    const url = `${SITE}/p/${p.slug}`;
    const category = categoryBySlug.get(p.category)?.name;
    const lines = [
      `# ${p.name}${p.nameEn && p.nameEn !== p.name ? `（${p.nameEn}）` : ""}`,
      "",
      `類型：公民科技專案`,
      `專案頁：${url}`,
      category && `議題分類：${category}`,
      p.tags.length > 0 && `標籤：${p.tags.join("、")}`,
      "",
      ...(p.aiInsight ?? []).map((l) => `${l.label}：${l.text}`),
      p.intro && "",
      p.intro && `簡介：${p.intro}`,
      "",
      ...p.links.map((l) => `${l.label}：${l.url}`),
      p.slack && `g0v Slack 頻道：#${p.slack.name}`,
    ];
    return {
      key: `p--${p.slug}.md`,
      title: p.name,
      url,
      text: lines.filter((l) => l !== undefined && l !== false).join("\n") + "\n",
    };
  });

  const { all } = await getGuides();
  const guides: AskDoc[] = all.map((g) => {
    const url = `${SITE}/g/${g.slug}`;
    return {
      key: `g--${g.slug}.md`,
      title: g.title,
      url,
      text: `# ${g.title}\n\n類型：行動指引文章\n文章頁：${url}\n\n${g.entry.body ?? ""}\n`,
    };
  });

  return new Response(JSON.stringify([...projects, ...guides]), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
