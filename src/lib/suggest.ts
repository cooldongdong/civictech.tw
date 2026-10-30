// 修改建議：專案頁的「建議修改／幫它補一句話」連到站內的編輯頁（/p/{slug}/edit），
// 表單預填目前的值，送出時只把有改的欄位組成 civictech-tw-data 的 GitHub issue。
// 那邊自動開 PR，管理員合併就寫回 Airtable，隔天同步上線（流程見那個 repo 的 edits/README.md）。
//
// 預設開（g0v/civictech-tw-data 的表單與 workflow 2026-10-23 上線）。要關掉就在 build 帶 PUBLIC_SUGGEST_EDIT=0，
// 關掉時連編輯頁都不產生。
export const suggestEditEnabled = import.meta.env.PUBLIC_SUGGEST_EDIT !== "0";

// PUBLIC_SUGGEST_REPO 可以換成測試用的 repo，送出的 issue 就不會掉進正式 repo
export const SUGGEST_REPO = `https://github.com/${import.meta.env.PUBLIC_SUGGEST_REPO || "g0v/civictech-tw-data"}`;

// 沒有 GitHub 帳號的人寄信給揪松團，跟社群行事曆同一個信箱。
// 不用 +tag 分類：這是 Google 網路論壇的地址，不保證收得到 +tag 的信；改用主旨的［civictech.tw］前綴
export const CONTACT_EMAIL = "g0v-jothon@googlegroups.com";

export const editPath = (slug: string) => `/p/${slug}/edit`;
