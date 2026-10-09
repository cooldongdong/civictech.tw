// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://civictech.tw',
  base: '/',
  // 產出 c/gov.html 而不是 c/gov/index.html。
  // Cloudflare Pages 對 /c/gov 會 308 導去 /c/gov/，站內每次點擊多一跳，
  // 而且 Web Analytics 是按路徑統計的——兩種寫法會被當成兩頁。
  build: { format: 'file' },
  trailingSlash: 'never',
  vite: {
    plugins: [tailwindcss()],
  },
});
