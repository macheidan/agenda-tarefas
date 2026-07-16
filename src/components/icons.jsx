// Ícones de CONTEÚDO (dentro das views), no mesmo padrão do `tabIcons.jsx`:
// viewBox 24, stroke = currentColor, traço 2, cap/join redondos — estilo
// lucide, que é o do demo.tailadmin.com.
//
// POR QUE EXISTE: as views usam glifos de fonte e emoji (🛒 🔎 ✎ ✕ …). Isso
// destoa da referência de um jeito que cor e espaçamento não consertam:
//   - emoji não obedece `color` nem tema (o 🛒 fica colorido no dark também);
//   - muda por sistema operacional — a equipe vê um ícone, o Fábio vê outro;
//   - ✎ (U+270E) e ✕ (U+2715) renderizam na fonte do texto (Outfit), e o ✎
//     saía em preto puro, cor que não existe no tema.
// SVG com currentColor resolve os três de uma vez.
//
// Uso: <Icon k="cart" />  · tamanho vem do CSS (width/height do svg).

const I = {
  cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></>,
  pencil: <><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></>,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  archive: <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>,
  archiveRestore: <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M12 17v-5" /><path d="M9.5 14.5L12 12l2.5 2.5" /></>,
};

export function Icon({ k }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {I[k] || I.x}
    </svg>
  );
}
