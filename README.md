# civictech.tw

台灣公民科技資料庫的網站：<https://civictech.tw>

把散在各處的公民科技專案整理成第一次接觸的人也看得懂的入口：依議題找專案、讀每個專案的簡短介紹、讀行動指引。由 g0v 揪松團（jothon）維護。

資料怎麼流動、專案介紹怎麼產生、想一起改要從哪裡下手，見 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 頁面

| 路徑 | 內容 |
| :--- | :--- |
| `/` | 首頁：議題分類入口、行動指引、許願池 |
| `/c/[slug]` | 議題分類頁，列出這一類的專案 |
| `/p/[slug]` | 專案頁：AI 產生的四行介紹、連結、討論頻道 |
| `/p/[slug]/edit` | 建議修改：送出後在 civictech-tw-data 開一張修改申請 |
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

環境變數照 `.env.example` 複製一份成 `.env`。全部不設也能跑，只是許願池送不出去（卡片照樣讀得到）。

| 變數 | 用途 |
| :--- | :--- |
| `PUBLIC_TURNSTILE_SITE_KEY` | 許願池表單的機器人驗證（Cloudflare Turnstile） |
| `PUBLIC_WISH_SLACK_URL` | 選填，許願池卡片背面「到 Slack 一起聊」連去的頻道 |
| `PUBLIC_PREVIEW` | 設成 `1` 會掛上「改版預覽」橫幅、加 noindex、robots.txt 擋收錄。正式站不要帶 |
| `PUBLIC_SUGGEST_EDIT` | 設成 `0` 會關掉「建議修改」與編輯頁。預設開 |
| `PUBLIC_SUGGEST_REPO` | 編輯頁與許願池送出的 repo，預設 `g0v/civictech-tw-data`。測試時換成自己的公開 repo |

許願池的後端是 Cloudflare Pages Function（`functions/api/wish.ts`），另外要在 Cloudflare 設三個 secret：`GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY`、`TURNSTILE_SECRET`。本地要跑後端就寫進 `.dev.vars`，用 `npx wrangler pages dev dist`。

### 許願池怎麼運作

1. 訪客在首頁填表，過了 Turnstile，`/api/wish` 用 GitHub App 身分在 `g0v/civictech-tw-data` 開一張貼 `wish` 標籤的 issue。訪客不需要 GitHub 帳號。
2. g0v Slack 的頻道訂閱了 `wish` 標籤，issue 一開出來就會跳卡片；GitHub 上的留言也會進同一個討論串。
3. 看過沒問題的人在 Slack 卡片上按 Edit 補貼 `wish-approved`（要對 repo 有寫入權、在 Slack 連結過 GitHub 帳號）。
4. 首頁卡片直接向 GitHub API 讀 open 且帶 `wish-approved` 的 issue，最多慢一分鐘。不適當的提案關掉 issue 就會從首頁消失。

標籤用英文是因為 GitHub 的 Slack app 訂閱過濾不吃中文標籤名稱；而且它只在 issue 開出來的那一刻看標籤，所以審核標籤沒辦法拿來決定要不要進 Slack。

## 資料從哪來

網站 build 時**不會**去抓任何外部資料。資料都先用腳本落地成 repo 裡的檔案，每次更新都是一顆看得到差異的 commit。

| 資料 | 來源 | 落地位置 | 更新指令 |
| :--- | :--- | :--- | :--- |
| 專案（含 AI 介紹） | [data.civictech.tw](https://data.civictech.tw/v0/tech/projects.json)（正本在 Airtable） | `src/data/projects.json` | `node scripts/sync-data.mjs` |
| Slack 頻道對照 | [g0v Slack 封存站](https://g0v-slack-archive.g0v.ronny.tw/) | `src/data/slack-channels.json` | `node scripts/sync-slack.mjs`（在 `sync-data.mjs` 之後跑） |
| repo 最後活動時間 | GitHub API（有 `GITHUB_TOKEN` 就用，沒有會試 `gh auth token`） | `src/data/github.json` | `node scripts/sync-github.mjs` |
| 行動指引文章 | [g0v HackMD](https://g0v.hackmd.io/@jothon/guide) | `src/content/guides/` | `node scripts/sync-guides.mjs` |

- 資料不會自己更新，要有人跑腳本再 commit。
- 落地的檔案**不要手改**，下次同步會被蓋掉。要改就去改正本，見 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 分類

站上的十七個議題分類不沿用 Airtable 的 SDG 影響力類別，而是照 2026-07 公民科技需求問卷的議題領域重切：

- `src/data/categories.ts`：分類本身，以及排序的理由
- `src/data/classification.ts`：專案怎麼歸類。先用影響力類別對應，對不上的寫進人工覆蓋清單

覆蓋清單裡的名稱對不上任何專案時，build 會直接失敗。分類仍是草稿，歡迎討論。

## 部署

Cloudflare Pages，純靜態網站（build `npm run build`、輸出 `dist`）。

- 推 `master` 就會上正式站，合 PR 等於上線
- 推其他分支會自動產生預覽網址 `<分支名>.civictech-tw.pages.dev`

改版請開分支、看過預覽再發 PR。

## 技術

[Astro](https://astro.build) 靜態網站 ＋ [Tailwind CSS](https://tailwindcss.com) v4。

## 授權

- 程式碼：[MIT](LICENSE)
- 專案資料：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.zh-hant)，姓名標示「g0v civictech.tw」
- 行動指引文章（`src/content/guides/`）：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.zh-hant)，作者 Claire Cheng 與 g0v 揪松團，每篇文末附原文連結
