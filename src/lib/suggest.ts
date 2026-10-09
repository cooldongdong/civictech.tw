// 修改建議表單（Airtable）。專案頁、分類頁、首頁數字區的「補一句話／補一筆」都連到這裡。
//
// 預設只在預覽站開：Airtable 目前的方案送不出表單，正式站放一個按了沒反應的按鈕比不放更糟。
// 表單能用之後，正式站 build 帶 PUBLIC_SUGGEST_EDIT=1 就會出現；要在預覽站關掉就帶 0。
const flag = import.meta.env.PUBLIC_SUGGEST_EDIT;
export const suggestEditEnabled = flag ? flag === "1" : import.meta.env.PUBLIC_PREVIEW === "1";

const SUGGEST_FORM = "https://airtable.com/app2R1DOrrO9iysOr/pag8PhiBFiltvE3LU/form";

// 帶 record ID 而不是名稱：5 筆名稱尾端有空白或換行，帶名稱實測對不上；ID 也不怕 Airtable 上改名。
// 對不上時那格會靜靜變空、但照樣送得出去，所以那一欄在 Airtable 上刻意不設必填
export function suggestUrl(opts: { projectId?: string; field?: string } = {}) {
  const q = new URLSearchParams();
  if (opts.projectId) q.set("prefill_對應專案", opts.projectId);
  if (opts.field) q.set("prefill_哪一欄", opts.field);
  const qs = q.toString();
  return qs ? `${SUGGEST_FORM}?${qs}` : SUGGEST_FORM;
}
