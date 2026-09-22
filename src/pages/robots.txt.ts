import type { APIRoute } from "astro";

// 預覽站要擋收錄：不然同一份內容會有兩個網址在搜尋結果裡互打，
// 而且拿到預覽連結的人可能是從 Google 進來的——那就完全看不到「這不是正式站」的前因。
// 正式站的 build 不帶 PUBLIC_PREVIEW，走的是下面那份正常的 robots.txt。
const isPreview = import.meta.env.PUBLIC_PREVIEW === "1";

const preview = `# 改版預覽站，不要收錄。正式站在 https://civictech.tw
User-agent: *
Disallow: /
`;

// 站上目前沒有 sitemap（沒裝 @astrojs/sitemap），所以不要寫一行指向不存在的檔案。
// 這份內容跟「沒有 robots.txt」的效果相同，正式站不會因此改變行為。
const production = `User-agent: *
Allow: /
`;

export const GET: APIRoute = () =>
  new Response(isPreview ? preview : production, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
