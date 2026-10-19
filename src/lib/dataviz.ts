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

// ── 標籤共現網絡 ──────────────────────────────────────────

export interface TagNode {
  id: string;
  tag: string;
  count: number;
  x: number;
  y: number;
  r: number;
  neighbors: string[];
}

export interface TagEdge {
  a: TagNode;
  b: TagNode;
  weight: number;
}

/**
 * 兩個標籤同時貼在同一個專案上，就連一條線。只畫至少連到一個別人的標籤；
 * 從來沒跟別的標籤一起出現過的另外計數。
 *
 * 版面用最陽春的 force-directed（Fruchterman–Reingold），在 build 時跑完。
 * 起始位置是固定的圓周排列，不用亂數——每次 build 長得一樣，diff 才不會整張圖亂跳。
 */
export function tagNetwork(width: number, height: number) {
  const count = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const p of projects) {
    const tags = [...new Set(p.tags)].sort();
    for (const t of tags) count.set(t, (count.get(t) ?? 0) + 1);
    for (let i = 0; i < tags.length; i++)
      for (let j = i + 1; j < tags.length; j++) {
        const key = `${tags[i]}\u0000${tags[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
  }

  const connected = [...new Set([...pairs.keys()].flatMap((k) => k.split("\u0000")))].sort(
    (a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b),
  );
  const nodes = new Map<string, TagNode>(
    connected.map((tag, i) => {
      const angle = (i / connected.length) * Math.PI * 2;
      return [
        tag,
        {
          id: `g${i}`,
          tag,
          count: count.get(tag)!,
          x: width / 2 + Math.cos(angle) * width * 0.3,
          y: height / 2 + Math.sin(angle) * height * 0.3,
          r: 4 + Math.sqrt(count.get(tag)!) * 2.6,
          neighbors: [],
        },
      ];
    }),
  );
  const edges: TagEdge[] = [...pairs].map(([key, weight]) => {
    const [a, b] = key.split("\u0000");
    nodes.get(a)!.neighbors.push(nodes.get(b)!.id);
    nodes.get(b)!.neighbors.push(nodes.get(a)!.id);
    return { a: nodes.get(a)!, b: nodes.get(b)!, weight };
  });

  const list = [...nodes.values()];
  const k = Math.sqrt((width * height) / list.length) * 0.75;
  let temp = width / 8;
  for (let iter = 0; iter < 600; iter++) {
    const dx = new Map<TagNode, number>(list.map((n) => [n, 0]));
    const dy = new Map<TagNode, number>(list.map((n) => [n, 0]));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const ox = a.x - b.x;
        const oy = a.y - b.y;
        // 字是畫在點右邊的，水平方向多推一點，標籤比較不會疊在一起
        const d = Math.max(1, Math.hypot(ox * 0.6, oy));
        const f = (k * k) / d;
        dx.set(a, dx.get(a)! + (ox / d) * f);
        dy.set(a, dy.get(a)! + (oy / d) * f);
        dx.set(b, dx.get(b)! - (ox / d) * f);
        dy.set(b, dy.get(b)! - (oy / d) * f);
      }
    for (const e of edges) {
      const ox = e.a.x - e.b.x;
      const oy = e.a.y - e.b.y;
      const d = Math.max(1, Math.hypot(ox, oy));
      const f = (d * d) / k;
      dx.set(e.a, dx.get(e.a)! - (ox / d) * f);
      dy.set(e.a, dy.get(e.a)! - (oy / d) * f);
      dx.set(e.b, dx.get(e.b)! + (ox / d) * f);
      dy.set(e.b, dy.get(e.b)! + (oy / d) * f);
    }
    for (const n of list) {
      // 往中心拉一點，不然沒連在一起的小群會一路飄出畫面
      dx.set(n, dx.get(n)! + (width / 2 - n.x) * 0.05 * k * 0.1);
      dy.set(n, dy.get(n)! + (height / 2 - n.y) * 0.05 * k * 0.1);
      const d = Math.max(1, Math.hypot(dx.get(n)!, dy.get(n)!));
      n.x += (dx.get(n)! / d) * Math.min(d, temp);
      n.y += (dy.get(n)! / d) * Math.min(d, temp);
    }
    temp *= 0.992;
  }

  // 縮放到畫布裡，右邊留出標籤的寬度
  const PAD = 24;
  const LABEL = 110;
  const xs = list.map((n) => n.x);
  const ys = list.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const n of list) {
    n.x = PAD + ((n.x - x0) / (x1 - x0 || 1)) * (width - PAD * 2 - LABEL);
    n.y = PAD + ((n.y - y0) / (y1 - y0 || 1)) * (height - PAD * 2);
  }

  // 力導向只管點不管字。再跑一輪：把「點＋右邊的標籤」當成一個方框，疊到的就上下推開
  const LABEL_CH = 12.5;
  const box = (n: TagNode) => ({
    l: n.x - n.r - 2,
    r: n.x + n.r + 5 + n.tag.length * LABEL_CH + 2,
    t: n.y - Math.max(n.r, 9) - 2,
    b: n.y + Math.max(n.r, 9) + 2,
  });
  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const A = box(list[i]);
        const B = box(list[j]);
        const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // 推重疊比較少的那個方向；字是橫的，通常是上下推比較省
        if (oy < ox) {
          const s = list[i].y < list[j].y ? -1 : 1;
          list[i].y += (s * oy) / 2 + s * 0.5;
          list[j].y -= (s * oy) / 2 + s * 0.5;
        } else {
          const s = list[i].x < list[j].x ? -1 : 1;
          list[i].x += (s * ox) / 2 + s * 0.5;
          list[j].x -= (s * ox) / 2 + s * 0.5;
        }
      }
    for (const n of list) {
      n.x = Math.min(Math.max(n.x, PAD), width - PAD - n.tag.length * LABEL_CH);
      n.y = Math.min(Math.max(n.y, PAD), height - PAD);
    }
    if (!moved) break;
  }

  const hub = [...list].sort((a, b) => b.neighbors.length - a.neighbors.length)[0];
  return {
    nodes: list,
    edges,
    hub,
    tagged: projects.filter((p) => p.tags.length > 0).length,
    multiTagged: projects.filter((p) => new Set(p.tags).size > 1).length,
    totalTags: count.size,
    isolated: count.size - list.length,
  };
}

/** 標了某個影響力類別的專案（不限第一個）——SDG 方陣點進去的清單頁用 */
export const projectsByImpact = (num: number) =>
  projects.filter((p) => p.impactCategories.some((c) => parseImpact(c).num === num));
