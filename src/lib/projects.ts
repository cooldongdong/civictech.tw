// 把 Airtable 匯出的原始 JSON 整理成頁面能用的形狀。
//
// 這一層要處理的是資料的真實狀況，不是理想狀況：
//   - 有些名稱帶著換行或尾端空白
//   - 有 9 筆的 Intro 欄位其實只貼了一個網址（放上頁面會開天窗）
//   - 219 筆裡只有 141 筆有官網，剩下的要嘛只有 GitHub，要嘛什麼都沒有
// 這些缺口不藏起來，頁面上會直接講「這一欄還沒人填」。

import raw from "../data/projects.json";
import { byImpactCategory, overrides } from "../data/classification";
import type { CategorySlug } from "../data/categories";

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  nameEn?: string;
  intro?: string;
  /** Intro 欄位只貼了一個網址時，內文視為空，但網址留著用 */
  introIsBareUrl: boolean;
  website?: string;
  github?: string;
  document?: string;
  facebook?: string;
  tags: string[];
  impactCategories: string[];
  category: CategorySlug;
  /** 這一筆的分類是人工指定的（而不是規則推的） */
  categoryCurated: boolean;
  links: { label: string; url: string }[];
}

const BARE_URL = /^https?:\/\/\S+$/;

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

function isLatin(s?: string): boolean {
  return !!s && /^[\x20-\x7e]+$/.test(s);
}

function slugify(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[／/｜|]/g, "-")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** 網址好讀比好打重要一點，但拉丁字能用就用——Cloudflare 的報表是按路徑統計的 */
function baseSlug(f: Record<string, any>): string {
  const en = clean(f["project name EN"]);
  const name = clean(f["project name"]) ?? "";
  if (isLatin(en)) return slugify(en!);
  if (isLatin(name)) return slugify(name);

  const gh = clean(f.github);
  const repo = gh?.match(/github\.com\/[^/]+\/([^/?#]+)/i)?.[1];
  if (repo) return slugify(repo);

  return slugify(name);
}

function resolveCategory(name: string, impact: string[]): [CategorySlug, boolean] {
  const manual = overrides[name];
  if (manual) return [manual, true];

  for (const c of impact) {
    const num = c.split("-")[0];
    const mapped = byImpactCategory[num];
    if (mapped) return [mapped, false];
  }
  return ["community", false];
}

const seen = new Map<string, number>();

export const allProjects: Project[] = (raw.records as AirtableRecord[])
  .map((r) => {
    const f = r.fields;
    const name = clean(f["project name"]) ?? "";
    const introRaw = clean(f.Intro);
    const introIsBareUrl = !!introRaw && BARE_URL.test(introRaw);
    const impactCategories = (f["影響力類別"] ?? []).map((c: any) => c.name);
    const [category, categoryCurated] = resolveCategory(name, impactCategories);

    let slug = baseSlug(f) || r.id.toLowerCase();
    const dupe = seen.get(slug) ?? 0;
    seen.set(slug, dupe + 1);
    if (dupe > 0) slug = `${slug}-${dupe + 1}`;

    const website = clean(f["Website URL"]) ?? (introIsBareUrl ? introRaw : undefined);
    const github = clean(f.github);
    const document = clean(f.document);
    const facebook = clean(f["Facebook Page Link"]);

    const links = [
      website && { label: "官方網站", url: website },
      github && { label: "原始碼", url: github },
      document && { label: "專案文件", url: document },
      facebook && { label: "Facebook", url: facebook },
    ].filter(Boolean) as { label: string; url: string }[];

    return {
      id: r.id,
      slug,
      name,
      nameEn: clean(f["project name EN"]),
      intro: introIsBareUrl ? undefined : introRaw,
      introIsBareUrl,
      website,
      github,
      document,
      facebook,
      tags: (f["標籤"] ?? []).map((t: any) => t.name),
      impactCategories,
      category,
      categoryCurated,
      links,
    };
  })
  .filter((p) => p.name.length > 0);

/**
 * 端得上桌的：有名字，而且至少有簡介或一個連結。
 * 其餘的仍然存在於資料庫，只是站上沒有東西可以給人看。
 */
export const listedProjects = allProjects.filter((p) => p.intro || p.links.length > 0);

export const projectsByCategory = (slug: CategorySlug) =>
  listedProjects.filter((p) => p.category === slug);

export const countByCategory = (slug: CategorySlug) => projectsByCategory(slug).length;

/** 首頁隨機卡的池子：要有話可說、也要有地方可去 */
export const featurePool = listedProjects.filter(
  (p) => p.intro && p.intro.length >= 60 && p.links.length > 0,
);

export const stats = {
  total: allProjects.length,
  listed: listedProjects.length,
  withIntro: allProjects.filter((p) => p.intro).length,
  withLink: allProjects.filter((p) => p.links.length > 0).length,
  featurePool: featurePool.length,
};
