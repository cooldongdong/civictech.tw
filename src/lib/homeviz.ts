// 首頁那幾段會動的東西要用的資料，都在 build 時算好，頁面上只剩少量的互動程式。
// 跟 /data 頁的 dataviz.ts 分開放：那邊是給想看全貌的人，這邊是給第一次來的人看的入口。

import talksRaw from "../data/talks.json";
import { listedProjects, type Project } from "./projects";
import { categories, categoryBySlug } from "../data/categories";

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

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s_\-｜|／/：:（）()「」]+/g, "");

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

// ── 3. 一年一年的大松 ─────────────────────────────────

interface Talk {
  name: string;
  date: string;
  year: number;
  event: string;
  no: number;
  related?: string;
}

const talks: Talk[] = (talksRaw.records as { fields: Record<string, any> }[])
  .map((r) => {
    const f = r.fields;
    const date = String(f.date ?? "");
    return {
      name: String(f["presentation name"] ?? "").trim(),
      date,
      year: Number(date.slice(0, 4)),
      event: String(f["event name"] ?? "").trim(),
      no: Number(f["no."]),
      related: f["related project"] ? String(f["related project"]) : undefined,
    };
  })
  .filter((t) => t.name && t.year > 2000);

/** 提案名稱對得上站上專案的，就能連過去 */
const projectByNorm = new Map(listedProjects.map((p) => [norm(p.name), p]));
function matchProject(t: Talk): Project | undefined {
  return projectByNorm.get(norm(t.related ?? "")) ?? projectByNorm.get(norm(t.name));
}

/** 「g0v hackath14n | 台灣零時政府第拾肆次大松」→「第拾肆次大松」 */
const shortEvent = (e: string) => (e.split("|")[1] ?? e).replace(/^\s*台灣零時政府/, "").trim();

export interface YearStep {
  year: number;
  count: number;
  events: string[];
  /** 這一年提案、站上也有頁面的專案 */
  projects: { slug: string; name: string }[];
  /** 其餘提案的名字（站上沒有頁面的），挑幾個讓畫面有東西 */
  others: string[];
}

export function hackathonYears(): { steps: YearStep[]; total: number; events: number } {
  const years = [...new Set(talks.map((t) => t.year))].sort();
  const steps = years.map((year) => {
    const ts = talks.filter((t) => t.year === year);
    const seen = new Set<string>();
    const projects: { slug: string; name: string }[] = [];
    const others: string[] = [];
    for (const t of ts) {
      const p = matchProject(t);
      if (p) {
        if (!seen.has(p.slug)) {
          seen.add(p.slug);
          projects.push({ slug: p.slug, name: p.name });
        }
      } else if (!others.includes(t.name)) {
        others.push(t.name);
      }
    }
    return {
      year,
      count: ts.length,
      events: [...new Set(ts.map((t) => shortEvent(t.event)))],
      projects,
      others: shuffle(others, year).slice(0, 18),
    };
  });
  return { steps, total: talks.length, events: new Set(talks.map((t) => t.event)).size };
}

// ── 4. 一個專案的一生 ─────────────────────────────────

export interface LifeStep {
  when: string;
  title: string;
  body: string;
  href?: string;
}

/**
 * 用一個真實的專案示範「一個點子怎麼變成大家天天在用的東西」。
 * 每一步都從資料裡來：大松提案紀錄、連結欄、Slack 頻道、AI insight。資料缺哪一步就不寫那一步。
 */
export function projectLife(name: string): { project: Project; steps: LifeStep[] } | undefined {
  const p = listedProjects.find((x) => x.name === name);
  if (!p) return undefined;
  // 提案名稱常帶副標（「阿美語萌典(O citing no AMIS)」「阿美語萌典2015年」），開頭對得上也算
  const key = norm(p.name);
  const mine = talks.filter((t) => matchProject(t)?.slug === p.slug || norm(t.name).startsWith(key)).sort((a, b) => a.date.localeCompare(b.date, "en", { numeric: true }));
  const steps: LifeStep[] = [];
  const first = mine[0];
  if (first) {
    steps.push({
      when: first.date.replace(/\//g, "."),
      title: "在黑客松上提案",
      body: `第一次在${shortEvent(first.event)}上台，講它想做什麼、需要什麼人。`,
    });
  }
  if (p.github) steps.push({ when: "", title: "程式碼公開", body: "原始碼放上 GitHub，任何人都能看、能改、能接手。", href: p.github });
  if (p.website) {
    const what = p.aiInsight?.find((l) => l.label === "做什麼")?.text;
    steps.push({ when: "", title: "上線給大家用", body: what ? `${what}。` : "做成網站，不會寫程式的人也能直接用。", href: p.website });
  }
  if (mine.length > 1) {
    const last = mine[mine.length - 1];
    steps.push({
      when: `${first.date.slice(0, 4)}–${last.date.slice(0, 4)}`,
      title: `回到大松 ${mine.length} 次`,
      body: "每隔一陣子回來報告進度、找新的人加入。一個專案能活很久，靠的是一直有人接上。",
    });
  }
  if (p.slack) {
    steps.push({
      when: "現在",
      title: `還在 #${p.slack.name} 繼續`,
      body: "想加入的人，從這個頻道開始。",
      href: p.slack.archiveUrl ?? "https://join.g0v.tw/",
    });
  }
  return { project: p, steps };
}

export const categoryName = (slug: string) => categoryBySlug.get(slug as any)?.name ?? "";
