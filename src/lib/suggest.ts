// 修改建議：專案頁的「建議修改／幫它補一句話」連到 civictech-tw-data 的 GitHub issue 表單。
// 送出後那邊自動開 PR，管理員合併就寫回 Airtable，隔天同步上線（流程見那個 repo 的 edits/README.md）。
//
// 預設只在預覽站開：正式 repo 上的表單與 workflow 合併前，正式站放一個打開是錯誤頁的連結比不放更糟。
// 上線之後，正式站 build 帶 PUBLIC_SUGGEST_EDIT=1 就會出現；要在預覽站關掉就帶 0。
// PUBLIC_SUGGEST_REPO 可以換成測試用的 repo，預設是正式的那個。
const flag = import.meta.env.PUBLIC_SUGGEST_EDIT;
export const suggestEditEnabled = flag ? flag === "1" : import.meta.env.PUBLIC_PREVIEW === "1";

const REPO = import.meta.env.PUBLIC_SUGGEST_REPO || "g0v/civictech-tw-data";

// 帶 record ID 而不是名稱：5 筆名稱尾端有空白或換行，ID 也不怕 Airtable 上改名。
// 只預填代號與標題，不預填現值：簡介整段放進網址，中文一個字編碼後 9 個位元組，長一點就超過網址長度上限。
// 表單上留空的欄位不會被改，所以不預填也不會把資料清掉。
export function suggestUrl(project: { id: string; name: string }) {
  const q = new URLSearchParams({
    template: "edit-project.yml",
    project_id: project.id,
    title: `修改：${project.name}`,
  });
  return `https://github.com/${REPO}/issues/new?${q}`;
}
