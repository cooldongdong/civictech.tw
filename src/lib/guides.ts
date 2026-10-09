// 行動指引文章的共用整理：摘要、分組，以及「每篇都有被分到組」的檢查。

import { getCollection, type CollectionEntry } from "astro:content";
import { guideGroups, featuredGuides } from "../data/guideGroups";

export const GUIDE_SOURCE_BOOK = "https://g0v.hackmd.io/@jothon/guide/";

export interface Guide {
  slug: string;
  title: string;
  /** 內文第一行「核心主題／核心方法：……」 */
  summary?: string;
  /** 「涵蓋資源：……」，卡片上用來告訴人這篇裡有什麼 */
  covers?: string;
  entry: CollectionEntry<"guides">;
}

function toGuide(entry: CollectionEntry<"guides">): Guide {
  const body = entry.body ?? "";
  return {
    slug: entry.id,
    title: entry.data.title,
    summary: body.match(/核心(?:主題|方法)：(.+)/)?.[1]?.trim(),
    covers: body.match(/涵蓋資源：(.+)/)?.[1]?.trim(),
    entry,
  };
}

export async function getGuides() {
  const all = (await getCollection("guides")).map(toGuide);
  const bySlug = new Map(all.map((g) => [g.slug, g]));

  // 同步進來一篇新文章卻忘了分組，它會在列表上靜靜消失、不報錯——
  // 首頁舊版的 categoriesOrder 白名單就踩過這個坑。這裡讓 build 直接失敗。
  const grouped = new Set(guideGroups.flatMap((g) => g.slugs));
  const orphans = all.filter((g) => !grouped.has(g.slug)).map((g) => g.slug);
  const missing = [...grouped, ...featuredGuides].filter((s) => !bySlug.has(s));
  if (orphans.length) throw new Error(`這幾篇指引沒有分組，請加進 src/data/guideGroups.ts：${orphans.join(", ")}`);
  if (missing.length) throw new Error(`src/data/guideGroups.ts 裡有找不到的文章：${missing.join(", ")}`);

  return {
    all,
    bySlug,
    groups: guideGroups.map((g) => ({ ...g, guides: g.slugs.map((s) => bySlug.get(s)!) })),
    featured: featuredGuides.map((s) => bySlug.get(s)!),
    groupOf: (slug: string) => guideGroups.find((g) => g.slugs.includes(slug))!,
  };
}
