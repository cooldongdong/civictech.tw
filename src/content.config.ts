import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// 行動指引文章。檔案由 scripts/sync-guides.mjs 從 HackMD 拷貝過來，不要手改——
// 下次同步會被蓋掉。要改內容，改 HackMD 原文再跑一次同步。
const guides = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    section: z.string(),
    source: z.string().url(),
    tags: z.array(z.string()),
    syncedAt: z.coerce.date(),
  }),
});

export const collections = { guides };
