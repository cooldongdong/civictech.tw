// 資料總覽頁（/data）的計算層：把專案清單算成每張圖要畫的形狀。
//
// 圖全部在 build 時算好、輸出成 SVG／HTML，不裝圖表套件、也不在瀏覽器裡算。
// 理由跟 sync-data 落地成檔案一樣：資料一更新就是一顆 commit，圖跟著變，diff 看得到。
//
// 這裡一律用 listedProjects（站上有頁面的那些），不是 allProjects——
// 樹狀圖點下去會進分類頁，分類頁數的是 listedProjects，兩邊的數字要對得上。

import { categories, categoryBySlug, surveyRate, type CategorySlug } from "../data/categories";
import { listedProjects } from "./projects";
import githubData from "../data/github.json";

export const projects = listedProjects;

// ── 影響力類別 ──────────────────────────────────────────────

export interface ImpactCategory {
  /** 「4-SDGS-優質教育」裡的 4 */
  num: number;
  /** 「優質教育」——拿掉編號與 SDGS 前綴 */
  name: string;
  /** 1–17 是聯合國的 SDGs，18–20 是揪松自己補的 */
  isSdg: boolean;
}

export function parseImpact(raw: string): ImpactCategory {
  const [n, ...rest] = raw.split("-");
  const num = Number(n);
  const name = rest.filter((s) => s !== "SDGS").join("-");
  return { num, name, isSdg: num >= 1 && num <= 17 };
}

// SDGs 的中文名稱，照 Airtable 的寫法。現在 17 個都至少有一個專案，但名稱不能只從資料撿：
// 哪天某一格掉到 0，它還是要出現在方陣上、叫得出名字——空著本身就是資訊。
const SDG_NAMES: Record<number, string> = {
  1: "終結貧窮",
  2: "終結飢餓",
  3: "健全生活品質",
  4: "優質教育",
  5: "性別平權",
  6: "乾淨飲用水",
  7: "人人可負擔的乾淨能源",
  8: "良好就業和經濟成長",
  9: "工業化、創新及基礎建設",
  10: "消弭不平等",
  11: "永續城鄉",
  12: "負責任生產消費循環",
  13: "氣候變遷對策",
  14: "海洋生態",
  15: "陸域生態",
  16: "和平、正義和公平的制度",
  17: "全球夥伴關係",
};

export interface ImpactCell extends ImpactCategory {
  count: number;
}

/**
 * 每個影響力類別掛了幾個專案。一個專案可以掛兩、三個類別，
 * 所以這裡的總和會比專案數大——圖上要講明。
 */
export function impactCells(): { sdg: ImpactCell[]; extra: ImpactCell[]; multi: number } {
  const counts = new Map<number, ImpactCell>();
  for (let n = 1; n <= 17; n++) counts.set(n, { num: n, name: SDG_NAMES[n], isSdg: true, count: 0 });
  for (const p of projects) {
    for (const raw of p.impactCategories) {
      const c = parseImpact(raw);
      const cell = counts.get(c.num) ?? { ...c, count: 0 };
      cell.count++;
      counts.set(c.num, cell);
    }
  }
  const all = [...counts.values()].sort((a, b) => a.num - b.num);
  return {
    sdg: all.filter((c) => c.isSdg),
    extra: all.filter((c) => !c.isSdg),
    multi: projects.filter((p) => p.impactCategories.length > 1).length,
  };
}

/** 主要影響力類別完全不在 SDGs 1–17 裡的專案數 */
export const outsideSdg = projects.filter(
  (p) => p.impactCategories.length > 0 && !p.impactCategories.some((c) => parseImpact(c).isSdg),
).length;

// ── 17 類的矩形樹狀圖 ────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap（Bruls et al. 2000）。輸入已經由大到小排好、值為正的陣列，
 * 回傳每一格在 0..width × 0..height 裡的位置。要的是「每一格盡量接近正方形」，
 * 長條狀的格子放不下中文類名。
 */
export function squarify(values: number[], width: number, height: number): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  const scale = (width * height) / total;
  const areas = values.map((v) => v * scale);
  const out: Rect[] = new Array(values.length);

  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let i = 0;

  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]);
      j++;
    }

    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      // 直的一欄，放在左邊
      const colW = s / h;
      let cy = y;
      row.forEach((a, k) => {
        out[i + k] = { x, y: cy, w: colW, h: a / colW };
        cy += a / colW;
      });
      x += colW;
      w -= colW;
    } else {
      // 橫的一列，放在上面
      const rowH = s / w;
      let cx = x;
      row.forEach((a, k) => {
        out[i + k] = { x: cx, y, w: a / rowH, h: rowH };
        cx += a / rowH;
      });
      y += rowH;
      h -= rowH;
    }
    i = j;
  }
  return out;
}

export interface CategoryCount {
  slug: CategorySlug;
  name: string;
  count: number;
}

export const categoryCounts: CategoryCount[] = categories
  .map((c) => ({ slug: c.slug, name: c.name, count: projects.filter((p) => p.category === c.slug).length }))
  .sort((a, b) => b.count - a.count);

// ── 問卷需求 × 專案數 ────────────────────────────────────────

export interface DemandRow {
  slug: CategorySlug;
  name: string;
  /** 還沒做過專案的人裡，想先看這一類的比例（%） */
  demand: number;
  supply: number;
  demandRank: number;
  supplyRank: number;
}

/** 名次：同分同名次（1, 2, 2, 4） */
function ranks(values: number[]): number[] {
  return values.map((v) => values.filter((u) => u > v).length + 1);
}

export function demandRows(): DemandRow[] {
  const surveyed = categories.filter((c) => c.survey);
  const demand = surveyed.map((c) => surveyRate(c.survey!));
  const supply = surveyed.map((c) => projects.filter((p) => p.category === c.slug).length);
  const dr = ranks(demand);
  const sr = ranks(supply);
  return surveyed
    .map((c, i) => ({
      slug: c.slug,
      name: c.name,
      demand: demand[i],
      supply: supply[i],
      demandRank: dr[i],
      supplyRank: sr[i],
    }))
    .sort((a, b) => b.demand - a.demand);
}

/**
 * 缺口：需求名次比專案數名次前面四名以上。門檻是看圖定的——
 * 前後差兩三名是雜訊（同分的類一多就會這樣），差到四名以上才是看得出來的落差。
 */
export const GAP_THRESHOLD = 4;
export const isGap = (r: DemandRow) => r.supplyRank - r.demandRank >= GAP_THRESHOLD;


// ── 影響力類別 → 人話分類的桑基圖 ─────────────────────────────

export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  x: number;
  y: number;
  h: number;
}

export interface SankeyLink {
  source: SankeyNode;
  target: SankeyNode;
  targetSlug: CategorySlug;
  value: number;
  /** 帶子在左右兩端的中線 y */
  y0: number;
  y1: number;
  /** 帶子的粗細 */
  w: number;
}

/**
 * 每個專案只算它的第一個影響力類別——classification.ts 推預設分類時也是看第一個，
 * 這樣左右兩邊的總數都等於專案數，帶子不會憑空多出來。
 */
export function sankey(opts: { height: number; left: number; right: number; nodeW: number; pad: number }) {
  const { height, left, right, nodeW, pad } = opts;

  const flows = new Map<string, number>();
  const srcVal = new Map<number, number>();
  const srcName = new Map<number, string>();
  const tgtVal = new Map<CategorySlug, number>();
  for (const p of projects) {
    const first = p.impactCategories[0];
    if (!first) continue;
    const imp = parseImpact(first);
    srcName.set(imp.num, imp.name);
    srcVal.set(imp.num, (srcVal.get(imp.num) ?? 0) + 1);
    tgtVal.set(p.category, (tgtVal.get(p.category) ?? 0) + 1);
    const key = `${imp.num}|${p.category}`;
    flows.set(key, (flows.get(key) ?? 0) + 1);
  }

  const srcIds = [...srcVal.keys()].sort((a, b) => a - b);
  const total = [...srcVal.values()].reduce((a, b) => a + b, 0);

  // 右邊的順序用重心法排：每一類放在「它的來源平均位置」，交叉最少，圖才讀得懂
  const srcIndex = new Map(srcIds.map((id, i) => [id, i]));
  const tgtIds = [...tgtVal.keys()].sort((a, b) => {
    const center = (t: CategorySlug) => {
      let s = 0;
      for (const [k, v] of flows) {
        const [src, tgt] = k.split("|");
        if (tgt === t) s += srcIndex.get(Number(src))! * v;
      }
      return s / tgtVal.get(t)!;
    };
    return center(a) - center(b);
  });

  const k = Math.min(
    (height - pad * (srcIds.length - 1)) / total,
    (height - pad * (tgtIds.length - 1)) / total,
  );

  const column = <T>(ids: T[], val: (id: T) => number, x: number, label: (id: T) => string, prefix: string) => {
    const used = ids.reduce((s, id) => s + val(id) * k, 0) + pad * (ids.length - 1);
    let y = (height - used) / 2;
    return new Map(
      ids.map((id) => {
        const h = val(id) * k;
        const node: SankeyNode = { id: `${prefix}${id}`, label: label(id), value: val(id), x, y, h };
        y += h + pad;
        return [id, node];
      }),
    );
  };

  const srcNodes = column(srcIds, (id) => srcVal.get(id)!, left, (id) => `${id} ${srcName.get(id)}`, "s");
  const tgtNodes = column(
    tgtIds,
    (id) => tgtVal.get(id)!,
    right - nodeW,
    (id) => categoryBySlug.get(id)!.name,
    "t",
  );

  // 帶子在節點裡的排法：來源端照目標的上下順序排，目標端照來源的順序排，才不會在節點裡打結
  const tgtOrder = new Map(tgtIds.map((id, i) => [id, i]));
  const entries = [...flows].map(([key, value]) => {
    const [src, tgt] = key.split("|");
    return { src: Number(src), tgt: tgt as CategorySlug, value };
  });
  const srcOffset = new Map<number, number>();
  const tgtOffset = new Map<CategorySlug, number>();
  const links: SankeyLink[] = [];

  const bySrc = [...entries].sort((a, b) => a.src - b.src || tgtOrder.get(a.tgt)! - tgtOrder.get(b.tgt)!);
  const y0s = new Map<string, number>();
  for (const e of bySrc) {
    const node = srcNodes.get(e.src)!;
    const off = srcOffset.get(e.src) ?? 0;
    y0s.set(`${e.src}|${e.tgt}`, node.y + off + (e.value * k) / 2);
    srcOffset.set(e.src, off + e.value * k);
  }
  const byTgt = [...entries].sort((a, b) => tgtOrder.get(a.tgt)! - tgtOrder.get(b.tgt)! || a.src - b.src);
  for (const e of byTgt) {
    const node = tgtNodes.get(e.tgt)!;
    const off = tgtOffset.get(e.tgt) ?? 0;
    links.push({
      source: srcNodes.get(e.src)!,
      target: node,
      targetSlug: e.tgt,
      value: e.value,
      y0: y0s.get(`${e.src}|${e.tgt}`)!,
      y1: node.y + off + (e.value * k) / 2,
      w: e.value * k,
    });
    tgtOffset.set(e.tgt, off + e.value * k);
  }

  return {
    sources: [...srcNodes.values()],
    targets: [...tgtIds.map((id) => ({ slug: id, node: tgtNodes.get(id)! }))],
    links,
  };
}

// ── GitHub repo 還有沒有在動 ────────────────────────────────

interface RepoInfo {
  fullName?: string;
  pushedAt?: string;
  archived?: boolean;
  stars?: number;
  missing?: boolean;
}

/** 跟 scripts/sync-github.mjs 的 repoKey 同一條規則，兩邊要一起改 */
function repoKey(url?: string): string | undefined {
  const m = url?.match(/github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i);
  return m ? `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase() : undefined;
}

export interface RepoProject {
  name: string;
  slug: string;
  repo: string;
  pushedAt?: Date;
  archived: boolean;
  missing: boolean;
}

export function repoActivity() {
  const synced = new Date(githubData.syncedAt);
  const repos = githubData.repos as Record<string, RepoInfo>;
  const withRepo: RepoProject[] = [];
  let orgOnly = 0;
  for (const p of projects) {
    if (!p.github) continue;
    const key = repoKey(p.github);
    const info = key ? repos[key] : undefined;
    if (!key || !info) {
      // 只連到組織首頁、或是同步之後才新加的 repo
      orgOnly++;
      continue;
    }
    withRepo.push({
      name: p.name,
      slug: p.slug,
      repo: info.fullName ?? key,
      pushedAt: info.pushedAt ? new Date(info.pushedAt) : undefined,
      archived: !!info.archived,
      missing: !!info.missing,
    });
  }
  withRepo.sort((a, b) => (b.pushedAt?.getTime() ?? 0) - (a.pushedAt?.getTime() ?? 0));

  const dated = withRepo.filter((r) => r.pushedAt);
  const years = dated.map((r) => r.pushedAt!.getFullYear());
  const first = Math.min(...years);
  const last = synced.getFullYear();
  const byYear = Array.from({ length: last - first + 1 }, (_, i) => {
    const year = first + i;
    return { year, items: dated.filter((r) => r.pushedAt!.getFullYear() === year) };
  });

  const YEAR = 365 * 24 * 3600 * 1000;
  const age = (r: RepoProject) => synced.getTime() - r.pushedAt!.getTime();
  return {
    synced,
    withRepo,
    byYear,
    orgOnly,
    withoutGithub: projects.length - withRepo.length - orgOnly,
    activeLastYear: dated.filter((r) => age(r) <= YEAR).length,
    quietFiveYears: dated.filter((r) => age(r) > 5 * YEAR).length,
    archived: withRepo.filter((r) => r.archived).length,
    missing: withRepo.filter((r) => r.missing).length,
  };
}
