// Ícones (stroke = currentColor) por chave de seção. Usado no topo (Header)
// e na barra de navegação mobile (BottomNav).
const I = {
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  reels: <><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
  contentPlan: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  influencers: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  notes: <><path d="M5 3h14v18H5z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  shopping: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  ideas: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" /></>,
  reviews: <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 21.4l1.4-6.8L2.2 9.9l6.9-.8L12 2z" />,
  knowledge: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  precosInsumos: <><path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0l-8.2-8.2V2h10.4l8.2 8.2a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></>,
  departamentoPessoal: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><rect x="16" y="3" width="6" height="8" rx="1" /></>,
  motoboys: <><circle cx="5.5" cy="17" r="2.5" /><circle cx="18.5" cy="17" r="2.5" /><path d="M8 17h7" /><path d="M18.5 17l-2.5-7.5h-3.5" /></>,
  completed: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>,
  postiz: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
};

export function TabIcon({ k }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {I[k] || I.contentPlan}
    </svg>
  );
}
