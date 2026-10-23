# civictech.tw

台灣公民科技資料庫的網站：<https://civictech.tw>

把散在各處的公民科技專案整理成「人看得懂」的入口——依議題分類找專案、讀行動指引、用幾張圖看整個生態長什麼樣子。由 g0v 揪松團（jothon）維護。

## 頁面

| 路徑 | 內容 |
| :--- | :--- |
| `/` | 首頁：議題分類入口、隨機推薦專案、行動指引、許願池 |
| `/c/[slug]` | 議題分類頁，列出該類的專案 |
| `/p/[slug]` | 單一專案頁 |
| `/g`、`/g/[slug]` | 行動指引列表與全文 |
| `/data` | 資料總覽：分類、SDGs、需求與供給、repo 活躍度、標籤網絡 |
| `/data/sdg/[num]` | 對應某個 SDG 的專案 |

## 開發

需要 Node 22.12 以上。

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # 輸出到 ./dist/
npm run preview   # 在本機預覽 build 結果
```

環境變數照 `.env.example` 複製一份成 `.env`。不設也能跑，只是許願池會是空的。

| 變數 | 用途 |
| :--- | :--- |
| `PUBLIC_GOOGLE_*`、`PUBLIC_ENTRY_*` | 許願池讀寫的 Google 試算表與表單 |
| `PUBLIC_PREVIEW` | 設成 `1` 會掛上「改版預覽」橫幅、加 noindex、robots.txt 擋收錄。正式站不要帶 |
| `PUBLIC_SUGGEST_EDIT` | 「建議修改」表單連結的開關。不設時跟著 `PUBLIC_PREVIEW` |

## 資料從哪來

網站 build 時**不會**去抓任何外部資料。所有資料都先用腳本落地成 repo 裡的檔案，每次更新都是一顆看得到 diff 的 commit——誰被加進來、誰的簡介被改掉，一目了然。

| 資料 | 來源 | 落地位置 | 更新指令 |
| :--- | :--- | :--- | :--- |
| 專案 | [data.civictech.tw](https://data.civictech.tw/v0/tech/projects.json)（源頭是 Airtable） | `src/data/projects.json` | `node scripts/sync-data.mjs` |
| repo 最後活動時間 | GitHub API | `src/data/github.json` | `node scripts/sync-github.mjs` |
| 行動指引文章 | [g0v HackMD](https://g0v.hackmd.io/@jothon/guide) | `src/content/guides/` | `node scripts/sync-guides.mjs` |

- 資料不會自己更新，要有人跑腳本再 commit。
- `src/content/guides/` 裡的文章**不要手改**，下次同步會被蓋掉。要改內容，改 HackMD 原文再同步。
- `sync-github.mjs` 有 `GITHUB_TOKEN` 就用；沒有會試 `gh auth token`。

## 分類

站上的十七個議題分類不是直接沿用 Airtable 的 SDG 影響力類別，而是照 2026-07 公民科技需求問卷的議題領域重切的：

- `src/data/categories.ts`：分類本身，以及排序的理由
- `src/data/classification.ts`：專案怎麼歸類。先用影響力類別對應，對不上的再寫進人工覆蓋清單

不同意某個專案的歸類，改覆蓋清單裡那一行就好。覆蓋清單裡的名稱對不上任何專案時，build 會直接失敗。

分類仍是草稿，歡迎討論。

## 部署

Cloudflare Pages，以純靜態網站建置（build `npm run build`、輸出 `dist`）。

- 推 `master` 就會上正式站，合 PR 等於上線
- 推其他分支會自動產生預覽網址 `<分支名>.civictech-tw.pages.dev`

改版請開分支、看過預覽再發 PR。

## 技術

[Astro](https://astro.build) 靜態網站 + [Tailwind CSS](https://tailwindcss.com) v4。
