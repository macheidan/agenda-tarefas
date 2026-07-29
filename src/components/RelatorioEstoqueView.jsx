import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { usePrecosPlanilha, useRelatoriosEstoque } from '../hooks/useEstoqueRelatorio';
import {
  ESTOQUE_LOJAS, norm, isContado, mesAtual, inicioProximoMes, fimDoMes, fmtMes,
  fmtBRL, fmtQty, relatorioId,
} from '../lib/suprimentos';
import styles from '../styles/ComprasView.module.css';
import tbl from '../styles/RelatorioEstoqueView.module.css';

// Sub-seção de Suprimentos: valoriza a contagem do Estoque Mensal.
//
//   contagem do item (Estoque Mensal)  ×  preço do Produto (planilha)  =  total
//
// O preço vem da seção Preços — o mesmo custo/kg que alimenta o CMV (Resultado,
// ou seja, preço normalizado × Regra3) — considerando a ÚLTIMA compra até o
// último dia do mês de referência. Enquanto o mês não é salvo, tudo é calculado
// ao vivo; ao salvar, as linhas são congeladas num doc do Firestore e não mudam
// mais, mesmo que uma nota nova entre no banco depois. É o que a planilha faz
// nas abas de estoque de cada loja (Último valor · Contagem · Total).

// Casa o item do catálogo com o Produto (planilha) pelo nome, sem acento e sem
// caixa. `item.planilhaNome` é um vínculo explícito (gravado por importação) e
// ganha do casamento por nome.
function resolvePlanilha(item, nomesPorNorm) {
  if (item.planilhaNome) return { nome: item.planilhaNome };
  return { nome: nomesPorNorm.get(norm(item.produto)) || '' };
}

export default function RelatorioEstoqueView({ compras, contagens }) {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  const { fornecedores, itens } = compras;
  const { qtysDe } = contagens;

  const [mes, setMes] = useState(mesAtual);
  const [salvando, setSalvando] = useState(false);

  // Mesmas lojas (e mesma permissão de ver) do Estoque Mensal: quem enxerga só
  // a contagem da Lov também só vê o relatório da Lov.
  const lojasVisiveis = ESTOQUE_LOJAS.filter((l) => isAdmin || settings?.[l.verFlag] !== false);
  const [lojaId, setLojaId] = useState(ESTOQUE_LOJAS[0].id);
  const loja = lojasVisiveis.find((l) => l.id === lojaId) || lojasVisiveis[0] || null;
  const canEdit = isAdmin || settings?.relatorioEstoqueEditar === true;

  const corte = inicioProximoMes(mes);
  const { custos, loading: loadingPrecos, error: erroPrecos } = usePrecosPlanilha(corte);
  const { relatorios, salvar, reabrir } = useRelatoriosEstoque();

  const salvo = loja ? relatorios[relatorioId(mes, loja.id)] : null;

  // Nomes de Produto (planilha) que têm preço, indexados sem acento/caixa pra
  // casar com o nome do item no catálogo de Compras.
  const nomesPlanilha = useMemo(() => Object.keys(custos).sort((a, b) =>
    a.localeCompare(b, 'pt', { sensitivity: 'base' })), [custos]);
  const nomesPorNorm = useMemo(() => {
    const m = new Map();
    for (const n of nomesPlanilha) if (!m.has(norm(n))) m.set(norm(n), n);
    return m;
  }, [nomesPlanilha]);

  const fornecNome = useMemo(() => {
    const m = {};
    fornecedores.forEach((f) => { m[f.id] = f.name; });
    return m;
  }, [fornecedores]);

  // Linhas ao vivo: todo item COM contagem no mês e na loja ativos (o 0 conta —
  // significa "acabou").
  const lojaAtivaId = loja?.id || null;
  const qtysMes = useMemo(
    () => (lojaAtivaId ? qtysDe(mes, lojaAtivaId) : {}),
    [qtysDe, mes, lojaAtivaId]
  );
  const linhasVivas = useMemo(() => {
    if (!loja) return [];
    return itens
      .filter((i) => isContado(qtysMes[i.id]))
      .map((i) => {
        const { nome } = resolvePlanilha(i, nomesPorNorm);
        const preco = nome ? custos[nome] : null;
        const qtd = Number(qtysMes[i.id]) || 0;
        return {
          itemId: i.id,
          produto: i.produto || '',
          marca: i.marca || '',
          unid: i.unid || '',
          fornecedor: fornecNome[i.fornecedorId] || '',
          planilha: nome,
          medida: preco?.medida || '',
          precoData: preco?.data || '',
          preco: preco ? preco.custo : null,
          qtd,
          total: preco ? preco.custo * qtd : 0,
        };
      })
      // Ordena pela primeira coluna (o Produto (planilha)), com o fornecedor
      // como desempate quando dois itens do catálogo caem no mesmo produto.
      .sort((a, b) =>
        (a.planilha || a.produto).localeCompare(b.planilha || b.produto, 'pt', { sensitivity: 'base' }) ||
        a.fornecedor.localeCompare(b.fornecedor, 'pt', { sensitivity: 'base' }));
  }, [itens, loja, qtysMes, custos, nomesPorNorm, fornecNome]);

  const linhas = salvo ? (salvo.linhas || []) : linhasVivas;
  const total = salvo ? (Number(salvo.total) || 0) : linhas.reduce((s, l) => s + l.total, 0);
  const semPreco = linhas.filter((l) => l.preco == null).length;

  const handleSalvar = async () => {
    if (!linhas.length) {
      window.alert('Nenhum item contado neste mês — não há o que salvar.');
      return;
    }
    const aviso = semPreco
      ? `\n\nAtenção: ${semPreco} ${semPreco === 1 ? 'item ficou' : 'itens ficaram'} sem preço e ${semPreco === 1 ? 'entra' : 'entram'} como R$ 0,00.`
      : '';
    const ok = window.confirm(
      `Salvar o relatório de ${fmtMes(mes)} da ${loja.nome}?\n\n` +
      `Total: ${fmtBRL(total)}\n` +
      `Os preços e a contagem ficam congelados — não mudam mais depois de salvar.${aviso}`
    );
    if (!ok) return;
    setSalvando(true);
    try {
      await salvar(mes, loja, {
        corte: fimDoMes(mes),
        total,
        linhas,
        savedByUid: user.uid,
        savedByName: user.displayName || user.email || '',
      });
    } catch (e) {
      window.alert(`Erro ao salvar: ${e?.message || e}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleReabrir = async () => {
    if (!window.confirm(
      `Reabrir o relatório de ${fmtMes(mes)} da ${loja.nome}?\n\n` +
      'Os valores congelados serão APAGADOS e a tela volta a calcular com os preços de hoje. Esta ação não pode ser desfeita.'
    )) return;
    try {
      await reabrir(mes, loja.id);
    } catch (e) {
      window.alert(`Erro ao reabrir: ${e?.message || e}`);
    }
  };

  if (!loja) {
    return (
      <p className={tbl.vazio}>
        Nenhuma loja liberada pra você no Relatório Estoque. Peça ao admin em
        Configurações → Permissões → Suprimentos.
      </p>
    );
  }

  return (
    <>
      {lojasVisiveis.length > 1 && (
        <div className={styles.lojaTabs}>
          {lojasVisiveis.map((l) => (
            <button
              key={l.id}
              className={`${styles.lojaTab} ${loja.id === l.id ? styles.lojaTabActive : ''}`}
              onClick={() => setLojaId(l.id)}
            >
              {l.nome}
            </button>
          ))}
        </div>
      )}

      <div className={styles.mesRow}>
        <label className={styles.mesLabel}>
          Mês de referência
          <input
            className={styles.mesInput}
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value || mesAtual())}
          />
        </label>
        <div className={tbl.toolbarActions}>
          {salvo ? (
            <>
              <span className={tbl.chipSalvo}>Salvo</span>
              {canEdit && (
                <button className={tbl.btnGhost} onClick={handleReabrir}>Reabrir</button>
              )}
            </>
          ) : canEdit ? (
            <button className={tbl.btnPrimary} onClick={handleSalvar} disabled={salvando || loadingPrecos}>
              {salvando ? 'Salvando...' : 'Salvar mês'}
            </button>
          ) : null}
        </div>
      </div>

      <div className={tbl.resumo}>
        <div className={tbl.resumoBox}>
          <span className={tbl.resumoLabel}>Total em estoque — {loja.nome}</span>
          <strong className={tbl.resumoValor}>{fmtBRL(total)}</strong>
        </div>
        <p className={tbl.resumoInfo}>
          {salvo ? (
            <>
              Congelado com os preços até <strong>{(salvo.corte || fimDoMes(mes)).split('-').reverse().join('/')}</strong>
              {salvo.savedByName ? ` · salvo por ${salvo.savedByName}` : ''}
              {' '}· {linhas.length} {linhas.length === 1 ? 'item' : 'itens'}
            </>
          ) : (
            <>
              Cálculo ao vivo com o último preço até{' '}
              <strong>{fimDoMes(mes).split('-').reverse().join('/')}</strong>
              {' '}· {linhas.length} {linhas.length === 1 ? 'item contado' : 'itens contados'}
            </>
          )}
        </p>
      </div>

      {erroPrecos && !salvo && (
        <p className={tbl.aviso}>Não foi possível carregar os preços: {erroPrecos}</p>
      )}

      {!salvo && semPreco > 0 && (
        <p className={tbl.aviso}>
          <strong>{semPreco}</strong> {semPreco === 1 ? 'item contado não tem preço' : 'itens contados não têm preço'}:
          {' '}o Produto (planilha) não teve compra registrada nos últimos 12 meses, ou o item de
          Compras ainda não está vinculado a um produto da seção Preços. Eles entram no total como
          R$ 0,00.
        </p>
      )}

      {loadingPrecos && !salvo ? (
        <p className={tbl.vazio}>Carregando preços...</p>
      ) : linhas.length === 0 ? (
        <p className={tbl.vazio}>
          Nenhum item contado na <strong>{loja.nome}</strong> em <strong>{fmtMes(mes)}</strong>.
          Faça a contagem em <strong>Estoque Mensal</strong>, no mesmo mês — o relatório valoriza o
          que estiver lá.
        </p>
      ) : (
        <div className={tbl.tableWrap}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th>Produto (planilha)</th>
                <th>Fornecedor</th>
                <th className={tbl.num}>Preço</th>
                <th className={tbl.num}>Contagem</th>
                <th className={tbl.num}>Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.itemId} className={l.preco == null ? tbl.rowSemPreco : ''}>
                  <td data-label="Produto (planilha)">
                    <span className={l.planilha ? tbl.produto : tbl.dim}>
                      {l.planilha || 'sem vínculo'}
                    </span>
                  </td>
                  <td data-label="Fornecedor" className={tbl.dim}>{l.fornecedor || '—'}</td>
                  <td data-label="Preço" className={tbl.num}>
                    {l.preco == null ? <span className={tbl.dim}>—</span> : (
                      <>
                        {fmtBRL(l.preco)}
                        {l.medida && <span className={tbl.medida}>/{l.medida}</span>}
                      </>
                    )}
                  </td>
                  <td data-label="Contagem" className={tbl.num}>
                    {fmtQty(l.qtd)}{l.unid && <span className={tbl.medida}>{l.unid}</span>}
                  </td>
                  <td data-label="Total" className={`${tbl.num} ${tbl.totalCel}`}>{fmtBRL(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total</td>
                <td className={tbl.num}>{fmtBRL(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
