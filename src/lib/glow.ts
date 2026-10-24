// 卡片光暈的位置：一個監聽器管全頁（首頁與行動指引的卡片都用），游標在哪張 .glow 上就把座標寫給那一張
if (matchMedia("(hover: hover)").matches) {
  document.addEventListener(
    "pointermove",
    (e) => {
      const el = (e.target as Element).closest?.<HTMLElement>(".glow");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}
