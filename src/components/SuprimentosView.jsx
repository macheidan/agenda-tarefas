import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useCompras } from '../hooks/useCompras';
import ComprasView from './ComprasView';
import EstoqueView from './EstoqueView';
import { Icon } from './icons';
import { IS_V2 } from '../lib/v2';
import { temContagem } from '../lib/suprimentos';
import styles from '../styles/ComprasView.module.css';

// Sub-seções da aba Suprimentos. Compras é a original (visível pra quem tem a
// aba); Estoque Mensal nasce OFF e só aparece com a flag estoqueVer ligada nas
// Configurações. As duas leem o MESMO catálogo — por isso o hook é instanciado
// aqui uma vez só e desce por prop (um par de listeners, não dois).
const SUBPAGES = [
  { key: 'compras', label: 'Compras', color: '#465fff' },
  { key: 'estoque', label: 'Estoque Mensal', color: '#12b76a', flag: 'estoqueVer' },
];

export default function SuprimentosView() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  const compras = useCompras();
  const { itens } = compras;

  // Sub-página vem do ?sub= (mesmo padrão de Preços), pra que o F5 volte na
  // mesma tela em vez de cair sempre em Compras.
  const [subPage, setSubPage] = useState(() => {
    try {
      const sub = new URLSearchParams(window.location.search).get('sub');
      return SUBPAGES.some((sp) => sp.key === sub) ? sub : 'compras';
    } catch { return 'compras'; }
  });

  const subVisible = useMemo(() => {
    const v = {};
    for (const sp of SUBPAGES) v[sp.key] = !sp.flag || isAdmin || settings?.[sp.flag] === true;
    return v;
  }, [settings, isAdmin]);

  const activeSub = subVisible[subPage] ? subPage : 'compras';

  // Espelha a sub-página EXIBIDA na URL (?sub=), como o Dashboard faz com ?tab=.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('sub') === activeSub) return;
      url.searchParams.set('sub', activeSub);
      window.history.replaceState(null, '', url);
    } catch { /* URL malformada: navegação por estado segue funcionando */ }
  }, [activeSub]);

  // Contadores do submenu: itens no pedido (qty > 0) e itens contados em alguma
  // das lojas.
  const counts = useMemo(() => ({
    compras: itens.filter((i) => Number(i.qty) > 0).length,
    estoque: itens.filter(temContagem).length,
  }), [itens]);

  const visibleSubs = SUBPAGES.filter((sp) => subVisible[sp.key]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>
          {IS_V2 ? <><span className={styles.titleIcon}><Icon k="cart" /></span>Suprimentos</> : '🛒 Suprimentos'}
        </h2>
        {visibleSubs.length > 1 && (
          <div className={styles.subTabs}>
            {visibleSubs.map((sp) => {
              const active = activeSub === sp.key;
              return (
                <button
                  key={sp.key}
                  className={`${styles.subTab} ${active ? styles.subTabActive : ''}`}
                  style={{
                    borderColor: sp.color,
                    color: active ? '#fff' : sp.color,
                    background: active ? sp.color : 'transparent',
                  }}
                  onClick={() => setSubPage(sp.key)}
                >
                  {sp.label}
                  {counts[sp.key] > 0 && ` (${counts[sp.key]})`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeSub === 'estoque'
        ? <EstoqueView compras={compras} />
        : <ComprasView compras={compras} />}
    </div>
  );
}
