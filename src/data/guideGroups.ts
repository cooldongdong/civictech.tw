// 行動指引文章怎麼分組、怎麼排。
//
// 文章本身是從 HackMD 同步來的（scripts/sync-guides.mjs），但「讀者該先看哪篇」是這個站的編輯判斷，
// 不是 HackMD 目錄的章節——所以寫在這裡，不寫進同步來的檔案（下次同步會被蓋掉）。
//
// 分組照讀者心裡的問題分，不照 HackMD 目錄：
//   找工具       ＝「有什麼工具可以用？」   文章開頭是「涵蓋資源：N 個工具」
//   做專案的方法 ＝「專案卡住了怎麼辦？」   文章開頭是「核心方法」
//   查領域資料   ＝「我關心的領域有什麼？」 以某個議題為範圍

export interface GuideGroup {
  key: string;
  title: string;
  blurb: string;
  slugs: string[];
}

export const guideGroups: GuideGroup[] = [
  {
    key: "tools",
    title: "找工具",
    blurb: "想做一件事，先看看別人用什麼工具做過。",
    // 前三篇照問卷排：前兩群（還沒接觸、接觸過沒做過）最想看的三種工具
    slugs: ["data-visualization", "crowdsourced-reporting", "ai-applications", "maps-and-gis", "public-participation"],
  },
  {
    key: "methods",
    title: "做專案的方法",
    blurb: "專案卡住了，不是你一個人。照做專案的先後排。",
    // 先有資料 → 再找到使用者 → 最後推動改變
    slugs: ["data-driven-tactics", "reaching-users", "prototype-to-policy"],
  },
  {
    key: "domains",
    title: "查某個領域的資料",
    blurb: "關心某個議題，先知道有哪些資料和工具已經在那裡。",
    slugs: ["government-budget", "legislation-tracking", "regional-revitalization"],
  },
];

// 「從這幾篇開始」。依據是問卷「想看哪些跨領域工具的介紹」：
// 還沒接觸（26 人）與接觸過沒做過專案（53 人）兩群合併，前三名是
// 資料視覺化 58%、群眾協力 57%、AI 應用 53%。三者差距在誤差內，所以並列、不排名次。
export const featuredGuides = ["data-visualization", "crowdsourced-reporting", "ai-applications"];
