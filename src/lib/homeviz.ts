// 首頁那幾段會動的東西要用的資料，都在 build 時算好，頁面上只剩少量的互動程式。
// 跟 /data 頁的 dataviz.ts 分開放：那邊是給想看全貌的人，這邊是給第一次來的人看的入口。

import { listedProjects } from "./projects";
import { categories } from "../data/categories";

// ── 共用 ─────────────────────────────────────────────

/** 固定種子的亂數：每次 build 排出來的順序一樣，diff 才看得懂 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const rnd = seeded(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


// ── 1. Hero 底下兩排流動的專案 ─────────────────────────

export interface Chip {
  slug: string;
  name: string;
  what: string;
  category: string;
}

/** 有「一句話」也有地方可去的專案，打散後分成兩排 */
export function marqueeRows(perRow = 18): Chip[][] {
  const pool = shuffle(
    listedProjects.filter((p) => p.summary && p.links.length > 0 && p.category !== "community"),
    20261024,
  ).map((p) => ({
    slug: p.slug,
    name: p.name,
    what: p.summary!.length > 26 ? p.summary!.slice(0, 26) + "⋯" : p.summary!,
    category: p.category,
  }));
  return [pool.slice(0, perRow), pool.slice(perRow, perRow * 2)];
}

// ── 2. 議題與專案的放射圖 ───────────────────────────────

export interface GraphTopic {
  slug: string;
  name: string;
  count: number;
  /** 標籤位置與扇區範圍（弧度） */
  x: number;
  y: number;
  a0: number;
  a1: number;
  anchor: "start" | "end" | "middle";
}

export interface GraphDot {
  slug: string;
  name: string;
  what: string;
  topic: string;
  x: number;
  y: number;
}

export interface GraphLink {
  a: string;
  b: string;
  d: string;
  /** 兩個專案共用的標籤 */
  tags: string[];
}

/**
 * 中心是「公民科技」，外圈每個議題佔一段扇區，專案點排在扇區裡。
 * 不同議題的兩個專案貼了同一個標籤，就從圓心附近拉一條弧線連起來——那是跨議題可以互相借鏡的地方。
 * 貼了太多專案的大標籤（例如「教育」）連起來只會是一團毛線，所以超過門檻的標籤不畫線。
 */
export function topicGraph(size: number, maxTagSize = 8) {
  const cx = size / 2;
  const cy = size / 2;
  const rDots = size * 0.33;
  const rLabel = size * 0.445;
  const topics = categories.filter((c) => c.slug !== "community");
  const byTopic = new Map(topics.map((t) => [t.slug, listedProjects.filter((p) => p.category === t.slug)]));
  const total = topics.reduce((n, t) => n + byTopic.get(t.slug)!.length, 0);

  // 扇區大小照專案數分，但每個議題至少一小段，免得只有一兩個專案的議題擠成一條線
  const gap = 0.035;
  const minShare = 0.025;
  const shares = topics.map((t) => Math.max(minShare, byTopic.get(t.slug)!.length / total));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const free = Math.PI * 2 - gap * topics.length;

  let angle = -Math.PI / 2;
  const outTopics: GraphTopic[] = [];
  const dots: GraphDot[] = [];
  topics.forEach((t, i) => {
    const span = (shares[i] / shareSum) * free;
    const a0 = angle;
    const a1 = angle + span;
    const mid = (a0 + a1) / 2;
    const cos = Math.cos(mid);
    outTopics.push({
      slug: t.slug,
      name: t.name,
      count: byTopic.get(t.slug)!.length,
      x: cx + Math.cos(mid) * rLabel,
      y: cy + Math.sin(mid) * rLabel,
      a0,
      a1,
      anchor: Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end",
    });
    const ps = byTopic.get(t.slug)!;
    // 專案在扇區裡排成兩到三圈，點才不會疊在一起
    const rings = ps.length > 14 ? 3 : ps.length > 6 ? 2 : 1;
    const perRing = Math.ceil(ps.length / rings);
    ps.forEach((p, k) => {
      const ring = Math.floor(k / perRing);
      const idx = k % perRing;
      const n = Math.min(perRing, ps.length - ring * perRing);
      const a = a0 + span * ((idx + 0.5) / n);
      const r = rDots - ring * size * 0.035;
      dots.push({
        slug: p.slug,
        name: p.name,
        what: p.summary ?? "",
        topic: t.slug,
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
      });
    });
    angle = a1 + gap;
  });

  // 跨議題、共用標籤的連線
  const dotBySlug = new Map(dots.map((d) => [d.slug, d]));
  const projBySlug = new Map(listedProjects.map((p) => [p.slug, p]));
  const tagMembers = new Map<string, string[]>();
  for (const d of dots) {
    for (const tag of projBySlug.get(d.slug)!.tags) {
      if (!tagMembers.has(tag)) tagMembers.set(tag, []);
      tagMembers.get(tag)!.push(d.slug);
    }
  }
  const pairTags = new Map<string, string[]>();
  for (const [tag, members] of tagMembers) {
    if (members.length < 2 || members.length > maxTagSize) continue;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = dotBySlug.get(members[i])!;
        const b = dotBySlug.get(members[j])!;
        if (a.topic === b.topic) continue;
        const key = [a.slug, b.slug].sort().join("|");
        if (!pairTags.has(key)) pairTags.set(key, []);
        pairTags.get(key)!.push(tag);
      }
    }
  }
  const links: GraphLink[] = [...pairTags].map(([key, tags]) => {
    const [sa, sb] = key.split("|");
    const a = dotBySlug.get(sa)!;
    const b = dotBySlug.get(sb)!;
    // 控制點拉向圓心，線就從中間繞過去，讀起來像「透過公民科技連在一起」
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const qx = cx + (mx - cx) * 0.15;
    const qy = cy + (my - cy) * 0.15;
    return { a: sa, b: sb, tags, d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}` };
  });

  return { cx, cy, topics: outTopics, dots, links };
}

