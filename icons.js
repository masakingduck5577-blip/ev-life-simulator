/* =========================================================
   線アイコン（24×24、線の色は文字色 currentColor）
   pic("名前", 大きさ) で使う。新しいアイコンはここに足す。
   ========================================================= */
window.ICONS = {
  car: '<path d="M3 16v-3.5L5.2 7.5A2 2 0 0 1 7 6.3h10a2 2 0 0 1 1.8 1.2L21 12.5V16"/><path d="M3 12.5h18"/><path d="M9.5 16h5"/><circle cx="7.2" cy="16.5" r="2"/><circle cx="16.8" cy="16.5" r="2"/>',
  suv: '<path d="M3 16v-4l2-5.5h10l3.5 5.5H21v4"/><path d="M3 12h18"/><path d="M10 6.5V12"/><path d="M9.5 16h5"/><circle cx="7" cy="16.5" r="2"/><circle cx="17" cy="16.5" r="2"/>',
  van: '<path d="M3 16V6.5h11l4.5 5 2.5 1.5V16"/><path d="M3 11.5h15.5"/><path d="M9.5 16h5"/><circle cx="7" cy="16.5" r="2"/><circle cx="17" cy="16.5" r="2"/>',
  plug: '<path d="M9 3v5"/><path d="M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M6 9h6"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><path d="M7 10v4"/><path d="M11 10v4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  hourglass: '<path d="M6 3h12"/><path d="M6 21h12"/><path d="M7 3c0 4 5 6 5 9s-5 5-5 9"/><path d="M17 3c0 4-5 6-5 9s5 5 5 9"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 7.5l3 4 3-4"/><path d="M12 11.5V17"/><path d="M9.5 12.5h5"/><path d="M9.5 15h5"/>',
  yen: '<path d="M6 4l6 8 6-8"/><path d="M12 12v8"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7"/><path d="M8.5 14h7"/><path d="M8.5 18h4"/>',
  memo: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="M8 12h8"/><path d="M8 16h6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l2 2"/><path d="M18 5l2 2"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
  road: '<path d="M6 21L9 3"/><path d="M18 21L15 3"/><path d="M12 5v2"/><path d="M12 11v2"/><path d="M12 17v2"/>',
  school: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M7 11v5c3 2 7 2 10 0v-5"/>',
  office: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2"/><path d="M13 7h2"/><path d="M9 11h2"/><path d="M13 11h2"/><path d="M9 15h2"/><path d="M13 15h2"/>',
  shop: '<path d="M3 9l2-5h14l2 5"/><path d="M3 9h18"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  flashlight: '<path d="M7 3h10l-2 6v11a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9z"/><path d="M8 7h8"/><path d="M12 13v2"/>',
  camp: '<path d="M3 20L12 4l9 16z"/><path d="M12 4v16"/><path d="M9 20l3-6 3 6"/>',
  onsen: '<path d="M4 18c0 2 16 2 16 0"/><path d="M4 18c0-2 3-3 8-3s8 1 8 3"/><path d="M8 12c-1-2 1-3 0-5"/><path d="M12 12c-1-2 1-3 0-5"/><path d="M16 12c-1-2 1-3 0-5"/>',
  seedling: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7z"/><path d="M12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.9 4.9l1.4 1.4"/><path d="M17.7 17.7l1.4 1.4"/><path d="M4.9 19.1l1.4-1.4"/><path d="M17.7 6.3l1.4-1.4"/>',
  snow: '<path d="M12 2v20"/><path d="M3.3 7l17.4 10"/><path d="M3.3 17l17.4-10"/><path d="M9 4l3 2 3-2"/><path d="M9 20l3-2 3 2"/>',
  sleep: '<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>',
  shh: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6"/><path d="M21 9l-4 6"/>',
  dash: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><path d="M4 17h16"/>',
  dog: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z"/>',
  storm: '<path d="M7 16a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a3.5 3.5 0 0 1 0 7"/><path d="M12 13l-2 4h4l-2 4"/>',
};
/* 画像（相談メモの保存など）用：色を決めたSVGを data URI にする */
window.iconURI = (k, color = "#1F6FEB") => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${(window.ICONS[k] || window.ICONS.car)}</svg>`);
