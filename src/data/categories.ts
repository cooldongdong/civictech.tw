// 十七個「人話分類」。
//
// 第一版（2026-09-19）是從 20 個 SDG 影響力類別重切出來的八類——那是「專案在做什麼」的分法。
// 這一版改照 jothon × Claire 的 2026-07 需求問卷（N=127）「想先看哪些議題領域的資料清單」
// 的 12 個選項來分，換成「人想知道什麼」的分法：
// https://report.claire-cheng.com/#rec-1-2
//
// 問卷的 12 個選項一個對一類，名稱照抄，不併——專案少的類（地方創生、水環境）空著，
// 本身就是「需求高、做的人少」的訊號。問卷沒問到、但站上有一整袋專案的，另外補五類，
// 排在問卷那 12 類後面。
//
// 分類草稿，待社群討論。

export type CategorySlug =
  | "budget"
  | "local"
  | "disaster"
  | "facts"
  | "law"
  | "pollution"
  | "housing"
  | "ecology"
  | "transport"
  | "water"
  | "health"
  | "landuse"
  | "learning"
  | "democracy"
  | "energy"
  | "rights"
  | "community";

/** 問卷上對應的選項，與兩群「還沒做過專案」的人的勾選率（%） */
export interface SurveyOption {
  label: string;
  /** 聽過或看過，還沒接觸（26 人） */
  unaware: number;
  /** 接觸過，還沒做過專案（54 人） */
  aware: number;
}

export interface Category {
  slug: CategorySlug;
  name: string;
  /** 分類頁上的一句話，講「你會在這裡找到什麼」，不是定義 */
  blurb: string;
  /** 對應的問卷選項；沒有的是問卷沒問到、為了讓專案有地方放而補的類 */
  survey?: SurveyOption;
}

// 首頁是給還沒做過專案的人看的，所以排序只看這兩群；做過專案的 47 人不算進來。
const UNAWARE = 26;
const AWARE = 54;

/** 兩群的加權勾選率，四捨五入到整數 % */
export const surveyRate = (s: SurveyOption) =>
  Math.round((s.unaware * UNAWARE + s.aware * AWARE) / (UNAWARE + AWARE));

export const SURVEY_RESPONDENTS = UNAWARE + AWARE;

const defined: Category[] = [
  {
    slug: "budget",
    name: "政府預算、決算與標案",
    blurb: "中央與地方的預算書、標案、公務出國與公款去向。想知道一筆錢去了哪裡，從這裡開始。",
    survey: { label: "政府預算、決算與標案", unaware: 62, aware: 59 },
  },
  {
    slug: "local",
    name: "地方發展與地方創生",
    blurb: "市容通報、閒置校地、文化資產與社區空間改造。問卷裡排名很前面，站上的專案卻還很少。",
    survey: { label: "地方發展與地方創生", unaware: 38, aware: 39 },
  },
  {
    slug: "disaster",
    name: "防災與災害應變",
    blurb: "災情通報、搜救、物資媒合與災害潛勢。從氣爆、塵爆到堰塞湖，社群每一次都重寫一遍的那些工具。",
    survey: { label: "防災與災害應變", unaware: 46, aware: 33 },
  },
  {
    slug: "facts",
    name: "假訊息與詐騙防治",
    blurb: "事實查核、訊息溯源、帳號來歷與詐騙情境。在封閉群組裡流傳的那些訊息，有人在追。",
    survey: { label: "假訊息與詐騙防治", unaware: 54, aware: 41 },
  },
  {
    slug: "law",
    name: "法律、立法歷程",
    blurb: "立法院逐字稿、法案修改歷程、判決書與憲法法庭。想知道一條法怎麼來、怎麼被判，從這裡開始。",
    survey: { label: "法律、立法歷程", unaware: 38, aware: 35 },
  },
  {
    slug: "pollution",
    name: "環境汙染與公害",
    blurb: "空汙感測、企業的汙染紀錄，以及避開高汙染路段的路線規劃。",
    survey: { label: "環境汙染與公害", unaware: 35, aware: 31 },
  },
  {
    slug: "housing",
    name: "居住與租屋",
    blurb: "民間租屋資料與房屋資訊。跟「這個月的房租」最接近的一類。",
    survey: { label: "居住與租屋", unaware: 31, aware: 35 },
  },
  {
    slug: "ecology",
    name: "生態與生物多樣性",
    blurb: "黑熊與食蛇龜的通報、植物辨識，以及哪裡還能種樹。",
    survey: { label: "生態與生物多樣性", unaware: 23, aware: 31 },
  },
  {
    slug: "transport",
    name: "交通與道路安全",
    blurb: "路面品質、行人路線、交通流量模擬，以及那些被遺忘的鐵道。",
    survey: { label: "交通與道路安全", unaware: 8, aware: 30 },
  },
  {
    slug: "water",
    name: "水環境（河川、海洋）",
    blurb: "溪流整治工程的監督，以及面向海洋的黑客松。",
    survey: { label: "水環境（河川、海洋）", unaware: 12, aware: 24 },
  },
  {
    slug: "health",
    name: "健康與醫療",
    blurb: "疫苗、確診足跡、急診資訊、開源義肢與藥品說明白話文。",
    survey: { label: "健康與醫療", unaware: 31, aware: 20 },
  },
  {
    slug: "landuse",
    name: "土地使用與違章建築",
    blurb: "違章工廠、公有地、都市計畫與國土利用變化。多半是「用衛星與圖資把看不見的東西畫出來」的專案。",
    survey: { label: "土地使用與違章建築", unaware: 23, aware: 15 },
  },
  {
    slug: "learning",
    name: "學習、教育與母語",
    blurb: "辭典、語料、自主學習資源，以及台語、客語、原住民族語的數位化工程。",
  },
  {
    slug: "democracy",
    name: "選舉、監督與公共參與",
    blurb: "選舉資訊、政治獻金、財產申報、審議工具與公民記者。問卷沒問到這一類，但它是站上專案數第三多的。",
  },
  {
    slug: "energy",
    name: "能源、農業與氣候",
    blurb: "淨零政策、企業永續、能源、小農與食物浪費。",
  },
  {
    slug: "rights",
    name: "工作與生活權益",
    blurb: "職場、班表、社福、紓困、性別與無障礙。",
  },
  {
    slug: "community",
    name: "公民科技社群自己的工具",
    blurb:
      "黑客松怎麼開、專案怎麼被找到、坑主怎麼徵人。這一袋主要是給社群內部用的——第一次來，可以先跳過這裡。",
  },
];

// 有問卷數字的依勾選率排；沒有的照上面的順序接在後面，community 永遠墊底。
export const categories: Category[] = [
  ...defined
    .filter((c) => c.survey)
    .sort((a, b) => surveyRate(b.survey!) - surveyRate(a.survey!)),
  ...defined.filter((c) => !c.survey),
];

export const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
