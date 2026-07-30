import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useComprasPedidos } from '../hooks/useComprasPedidos';
import {
  useNotasCandidatas, useConferencias, useFornecedoresNota, maisDias,
} from '../hooks/useConferencia';
import {
  COMPRAS_LOJAS, hojeISO, fmtDiaMes, fmtBRL,
} from '../lib/suprimentos';
import {
  normNome, perfilPedido, converter, situacao, sugereEquivalencia, nfNumero,
  SITUACAO_LABEL, fmtNum,
} from '../lib/conferencia';
import styles from '../styles/ComprasView.module.css';
import tbl from '../styles/ConferirPedidosView.module.css';

// Sub-seção de Suprimentos: a assistente administrativa confere o que o gerente
// PEDIU (comprasPedidos, congelado no clique de Copiar) contra o que o
// fornecedor ENTREGOU (nota fiscal, importada sozinha no Supabase).
//
// A espinha é o PEDIDO, não a nota — e essa é a decisão de desenho central:
// entrega incompleta muitas vezes vem em DUAS notas, e uma tela organizada por
// nota esconderia justamente o caso que ela existe pra achar. Por isso um
// pedido agrega N notas candidatas.

const PERIODOS = [
  { dias: 14, label: '14 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
];

// Folga (em dias) depois da entrega prevista em que uma nota ainda conta como
// deste pedido. Curta de propósito: larga demais, a nota da semana seguinte
// entraria marcada no pedido anterior.
const FOLGA_PADRAO = 3;

/** Melhor palpite de fornecedor do Supabase para um fornecedor de Compras. */
function sugereFornecedor(nome, fornecedoresNota) {
  const k = normNome(nome);
  if (!k || k.length < 3) return null;
  const exato = fornecedoresNota.find(
    (f) => normNome(f.nome) === k || normNome(f.nome_curto) === k
  );
  if (exato) return exato;
  return fornecedoresNota.find((f) => {
    const alvo = normNome(f.nome);
    return alvo.startsWith(`${k} `) || alvo === k || alvo.includes(` ${k} `);
  }) || null;
}

export default function ConferirPedidosView({ compras }) {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  const { fornecedores, itens, vincularFornecedorNota, updateItem } = compras;
  const canEdit = isAdmin || settings?.conferenciaEditar === true;

  const [dias, setDias] = useState(30);
  const [lojaFiltro, setLojaFiltro] = useState('');
  const [abertoId, setAbertoId] = useState(null);
  const [mostraDePara, setMostraDePara] = useState(false);

  const desde = useMemo(() => maisDias(hojeISO(), -dias), [dias]);
  const { pedidos, loading, error } = useComprasPedidos(desde);
  const { conferencias, fechar, reabrir } = useConferencias(desde);
  const fornecedoresNota = useFornecedoresNota();

  const visiveis = useMemo(
    () => pedidos.filter((p) => !lojaFiltro || p.lojaId === lojaFiltro),
    [pedidos, lojaFiltro]
  );
  const pendentes = visiveis.filter((p) => !conferencias[p.id]);
  const aberto = visiveis.find((p) => p.id === abertoId) || null;

  // Fornecedores de Compras que ainda não têm de-para, com o palpite pronto.
  const semVinculo = useMemo(
    () => fornecedores
      .filter((f) => f.notaFornecedorId == null)
      .map((f) => ({ fornec: f, sugestao: sugereFornecedor(f.name, fornecedoresNota) })),
    [fornecedores, fornecedoresNota]
  );
  const comSugestao = semVinculo.filter((s) => s.sugestao);

  const confirmarSugestoes = async () => {
    for (const { fornec, sugestao } of comSugestao) {
      await vincularFornecedorNota(fornec.id, sugestao.id);
    }
  };

  if (aberto) {
    return (
      <Detalhe
        pedido={aberto}
        fornecedor={fornecedores.find((f) => f.id === aberto.fornecedorId) || null}
        fornecedoresNota={fornecedoresNota}
        itens={itens}
        conferencia={conferencias[aberto.id] || null}
        conferencias={conferencias}
        canEdit={canEdit}
        user={user}
        onVincular={vincularFornecedorNota}
        onEquiv={updateItem}
        onFechar={fechar}
        onReabrir={reabrir}
        onVoltar={() => setAbertoId(null)}
      />
    );
  }

  return (
    <>
      <div className={styles.lojaTabs}>
        <button
          className={`${styles.lojaTab} ${!lojaFiltro ? styles.lojaTabActive : ''}`}
          onClick={() => setLojaFiltro('')}
        >
          Todas
        </button>
        {COMPRAS_LOJAS.map((l) => (
          <button
            key={l.id}
            className={`${styles.lojaTab} ${lojaFiltro === l.id ? styles.lojaTabActive : ''}`}
            onClick={() => setLojaFiltro(l.id)}
          >
            {l.nome}
          </button>
        ))}
      </div>

      <div className={tbl.barra}>
        <div className={tbl.periodo}>
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              className={`${tbl.periodoBtn} ${dias === p.dias ? tbl.periodoBtnActive : ''}`}
              onClick={() => setDias(p.dias)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={tbl.barraInfo}>
          {pendentes.length > 0 && (
            <span className={tbl.chipPendente}>
              {pendentes.length} a conferir
            </span>
          )}
          {canEdit && (
            <button className={tbl.btnGhost} onClick={() => setMostraDePara((v) => !v)}>
              {mostraDePara ? 'Fechar' : 'Fornecedores da nota'}
              {semVinculo.length > 0 && ` (${semVinculo.length})`}
            </button>
          )}
        </div>
      </div>

      {mostraDePara && canEdit && (
        <DePara
          fornecedores={fornecedores}
          fornecedoresNota={fornecedoresNota}
          comSugestao={comSugestao}
          onVincular={vincularFornecedorNota}
          onConfirmarTodas={confirmarSugestoes}
        />
      )}

      {error && (
        <p className={tbl.aviso}>Não foi possível carregar os pedidos: {error}</p>
      )}

      {loading ? (
        <p className={tbl.vazio}>Carregando pedidos...</p>
      ) : visiveis.length === 0 ? (
        <p className={tbl.vazio}>
          Nenhum pedido nos últimos <strong>{dias} dias</strong>.
          {' '}O pedido é registrado quando o gerente clica em <strong>+ Copiar</strong> na
          aba <strong>Compras</strong> — pedidos feitos antes disso não aparecem aqui.
        </p>
      ) : (
        <div className={tbl.tableWrap}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fornecedor</th>
                <th>Loja</th>
                <th>Entrega</th>
                <th className={tbl.num}>Itens</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => {
                const conf = conferencias[p.id];
                return (
                  <tr key={p.id} className={tbl.rowClick} onClick={() => setAbertoId(p.id)}>
                    <td data-label="Pedido">
                      <span className={tbl.produto}>{fmtDiaMes(p.data)}</span>
                    </td>
                    <td data-label="Fornecedor">{p.fornecedorNome || '—'}</td>
                    <td data-label="Loja" className={tbl.dim}>{p.lojaNome || '—'}</td>
                    <td data-label="Entrega" className={tbl.dim}>
                      {p.entregaDia || '—'}
                      {p.entregaData ? ` ${fmtDiaMes(p.entregaData)}` : ''}
                    </td>
                    <td data-label="Itens" className={tbl.num}>{(p.linhas || []).length}</td>
                    <td data-label="Situação">
                      {conf ? (
                        <ResumoChips resumo={conf.resumo} />
                      ) : (
                        <span className={tbl.chipPendente}>a conferir</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Chips do resultado de uma conferência fechada. */
function ResumoChips({ resumo }) {
  const r = resumo || {};
  const problemas = (r.faltou || 0) + (r.naoVeio || 0) + (r.sobrou || 0) + (r.confirmar || 0);
  if (!problemas) return <span className={tbl.chipOk}>conferido</span>;
  return (
    <span className={tbl.chipsRow}>
      <span className={tbl.chipDiverg}>
        {problemas} {problemas === 1 ? 'divergência' : 'divergências'}
      </span>
    </span>
  );
}

/** De-para de fornecedores: Compras -> fornecedor que assina a nota. */
function DePara({ fornecedores, fornecedoresNota, comSugestao, onVincular, onConfirmarTodas }) {
  const [salvando, setSalvando] = useState(false);
  const ordenados = [...fornecedores].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));
  const sugestaoDe = new Map(comSugestao.map((s) => [s.fornec.id, s.sugestao]));

  return (
    <div className={tbl.caixa}>
      <div className={tbl.caixaHead}>
        <h4 className={tbl.caixaTitulo}>Fornecedor da nota</h4>
        {comSugestao.length > 0 && (
          <button
            className={tbl.btnPrimary}
            disabled={salvando}
            onClick={async () => {
              setSalvando(true);
              try { await onConfirmarTodas(); } finally { setSalvando(false); }
            }}
          >
            {salvando ? 'Salvando...' : `Aceitar ${comSugestao.length} ${comSugestao.length === 1 ? 'sugestão' : 'sugestões'}`}
          </button>
        )}
      </div>
      <p className={tbl.caixaHint}>
        Diga qual fornecedor da nota fiscal corresponde a cada fornecedor de Compras.
        É uma vez na vida — sem isso a conferência não acha as notas dele.
      </p>
      <div className={tbl.deparaList}>
        {ordenados.map((f) => {
          const sug = sugestaoDe.get(f.id);
          return (
            <label key={f.id} className={tbl.deparaRow}>
              <span className={tbl.deparaNome}>{f.name}</span>
              <select
                className={`${tbl.select} ${f.notaFornecedorId == null ? tbl.selectVazio : ''}`}
                value={f.notaFornecedorId ?? ''}
                onChange={(e) => onVincular(f.id, e.target.value)}
              >
                <option value="">— sem vínculo —</option>
                {fornecedoresNota.map((n) => (
                  <option key={n.id} value={n.id}>{n.nome_curto || n.nome}</option>
                ))}
              </select>
              {f.notaFornecedorId == null && sug && (
                <button
                  className={tbl.btnSugestao}
                  onClick={() => onVincular(f.id, sug.id)}
                  title="Aceitar a sugestão"
                >
                  {sug.nome_curto || sug.nome}
                </button>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ detalhe

function Detalhe({
  pedido, fornecedor, fornecedoresNota, itens, conferencia, conferencias,
  canEdit, user, onVincular, onEquiv, onFechar, onReabrir, onVoltar,
}) {
  const [folga, setFolga] = useState(FOLGA_PADRAO);
  const [override, setOverride] = useState({});
  const [obs, setObs] = useState('');
  const [fechando, setFechando] = useState(false);

  const notaFornId = fornecedor?.notaFornecedorId ?? null;
  const de = pedido.data;
  const ate = maisDias(pedido.entregaData || pedido.data, folga);
  const { notas, linhas: notaLinhas, loading, error } = useNotasCandidatas({
    lojaId: pedido.lojaId,
    fornecedorSupabaseId: notaFornId,
    de,
    ate,
  });

  // Nota já usada numa OUTRA conferência fechada: entra desmarcada, pra mesma
  // entrega não ser contada duas vezes em dois pedidos.
  const usadaEm = useMemo(() => {
    const m = {};
    for (const id in conferencias) {
      if (id === pedido.id) continue;
      for (const nfe of conferencias[id].nfeIds || []) m[nfe] = conferencias[id];
    }
    return m;
  }, [conferencias, pedido.id]);

  const marcada = (nfeId) => override[nfeId] ?? !usadaEm[nfeId];
  const toggle = (nfeId) => setOverride((o) => ({ ...o, [nfeId]: !marcada(nfeId) }));

  const itensPorId = useMemo(() => {
    const m = {};
    itens.forEach((i) => { m[i.id] = i; });
    return m;
  }, [itens]);

  const ativas = useMemo(
    () => notaLinhas.filter((l) => marcada(l.nfeId)),
    [notaLinhas, override, usadaEm] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Índice das linhas da nota por nome normalizado (nome padronizado e nome cru).
  const porNome = useMemo(() => {
    const m = new Map();
    for (const l of ativas) {
      for (const k of [normNome(l.planilha), normNome(l.produto)]) {
        if (!k) continue;
        if (!m.has(k)) m.set(k, []);
        const bucket = m.get(k);
        if (!bucket.includes(l)) bucket.push(l);
      }
    }
    return m;
  }, [ativas]);

  /**
   * Cruza pedido × nota. Cada linha da nota é consumida pela PRIMEIRA linha do
   * pedido que a reivindica — sem isso, dois itens do catálogo apontando para o
   * mesmo produto da planilha contariam a mesma entrega duas vezes.
   */
  const analise = useMemo(() => {
    const usados = new Set();
    const linhas = (pedido.linhas || []).map((l) => {
      const item = itensPorId[l.itemId];
      const equiv = item?.equiv || {};
      const perfil = perfilPedido(l);
      const achadas = [];
      for (const k of [normNome(l.planilha), normNome(l.produto)]) {
        if (!k) continue;
        for (const nl of porNome.get(k) || []) {
          if (!usados.has(nl.id)) { usados.add(nl.id); achadas.push(nl); }
        }
      }
      let veio = 0;
      let converteu = achadas.length > 0;
      const regras = new Set();
      const naoConv = [];
      let valor = 0;
      for (const nl of achadas) {
        valor += nl.valor;
        const r = converter(perfil, nl.qtd, nl.unid, equiv);
        if (r) { veio += r.qtd; regras.add(r.regra); } else { converteu = false; naoConv.push(nl); }
      }
      return {
        ...l,
        itemExiste: Boolean(item),
        achadas,
        naoConv,
        veio,
        valor,
        regras: [...regras],
        sit: achadas.length === 0 ? 'naoVeio' : situacao(l.qty, veio, converteu),
      };
    });
    const extras = ativas.filter((nl) => !usados.has(nl.id));
    const resumo = { ok: 0, faltou: 0, sobrou: 0, naoVeio: 0, confirmar: 0 };
    linhas.forEach((l) => { resumo[l.sit] += 1; });
    return { linhas, extras, resumo };
  }, [pedido.linhas, itensPorId, porNome, ativas]);

  const notasMarcadas = notas.filter((n) => marcada(n.id));
  const totalNota = notasMarcadas.reduce((s, n) => s + (Number(n.valor_total) || 0), 0);
  const fechada = Boolean(conferencia);

  // Linhas exibidas: a conferência fechada mostra o snapshot, não o cálculo de
  // hoje (nota que entre depois não pode reescrever o que já foi conferido).
  const linhas = fechada ? (conferencia.linhas || []) : analise.linhas;
  const extras = fechada ? (conferencia.extras || []) : analise.extras;
  const resumo = fechada ? (conferencia.resumo || {}) : analise.resumo;

  const handleFechar = async () => {
    const problemas = (resumo.faltou || 0) + (resumo.naoVeio || 0) + (resumo.sobrou || 0);
    const pendentes = resumo.confirmar || 0;
    if (pendentes && !window.confirm(
      `${pendentes} ${pendentes === 1 ? 'linha ainda está' : 'linhas ainda estão'} sem conversão de unidade e ${pendentes === 1 ? 'vai' : 'vão'} ficar registrada${pendentes === 1 ? '' : 's'} como "confirmar".\n\nFechar assim mesmo?`
    )) return;
    if (!window.confirm(
      `Marcar como conferido o pedido de ${pedido.fornecedorNome} (${fmtDiaMes(pedido.data)} · ${pedido.lojaNome})?\n\n` +
      `${problemas} ${problemas === 1 ? 'divergência' : 'divergências'} · ${notasMarcadas.length} ${notasMarcadas.length === 1 ? 'nota' : 'notas'}\n\n` +
      'Os valores ficam congelados — nota que entrar depois não muda mais esta conferência.'
    )) return;
    setFechando(true);
    try {
      await onFechar(pedido, {
        entregaData: pedido.entregaData || '',
        janela: { de, ate },
        nfeIds: notasMarcadas.map((n) => n.id),
        notas: notasMarcadas.map((n) => ({
          id: n.id,
          nf: nfNumero(n.chave_acesso),
          data: n.data_emissao,
          valor: Number(n.valor_total) || 0,
        })),
        totalNota,
        resumo: analise.resumo,
        linhas: analise.linhas.map((l) => ({
          itemId: l.itemId, produto: l.produto, marca: l.marca, unid: l.unid,
          qty: l.qty, veio: l.veio, sit: l.sit, valor: l.valor,
          cru: l.naoConv.map((n) => `${fmtNum(n.qtd)} ${n.unid}`).join(' + '),
        })),
        extras: analise.extras.map((e) => ({
          produto: e.produto, qtd: e.qtd, unid: e.unid, valor: e.valor,
        })),
        obs: obs.trim(),
        fechadoPorUid: user.uid,
        fechadoPorNome: user.displayName || user.email || '',
      });
      onVoltar();
    } catch (e) {
      window.alert(`Erro ao fechar a conferência: ${e?.message || e}`);
    } finally {
      setFechando(false);
    }
  };

  const handleReabrir = async () => {
    if (!window.confirm(
      `Reabrir a conferência de ${pedido.fornecedorNome} (${fmtDiaMes(pedido.data)})?\n\n` +
      'O resultado congelado será APAGADO e a tela volta a comparar com as notas de hoje. Esta ação não pode ser desfeita.'
    )) return;
    try { await onReabrir(pedido.id); } catch (e) {
      window.alert(`Erro ao reabrir: ${e?.message || e}`);
    }
  };

  return (
    <>
      <div className={tbl.detalheHead}>
        <button className={tbl.btnVoltar} onClick={onVoltar}>← Pedidos</button>
        <div className={tbl.detalheTitulo}>
          <strong>{pedido.fornecedorNome}</strong>
          <span className={tbl.dim}>
            {pedido.lojaNome} · pedido {fmtDiaMes(pedido.data)}
            {pedido.entregaData ? ` · entrega ${pedido.entregaDia} ${fmtDiaMes(pedido.entregaData)}` : ''}
            {pedido.autorNome ? ` · por ${pedido.autorNome}` : ''}
          </span>
        </div>
        <div className={tbl.detalheAcoes}>
          {fechada ? (
            <>
              <span className={tbl.chipOk}>Conferido</span>
              {canEdit && <button className={tbl.btnGhost} onClick={handleReabrir}>Reabrir</button>}
            </>
          ) : canEdit ? (
            <button className={tbl.btnPrimary} onClick={handleFechar} disabled={fechando || loading}>
              {fechando ? 'Fechando...' : 'Marcar conferido'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Sem de-para não há como achar a nota: resolve na hora, ali mesmo. */}
      {!fechada && notaFornId == null && (
        <div className={tbl.caixa}>
          <h4 className={tbl.caixaTitulo}>Qual fornecedor emite a nota de {pedido.fornecedorNome}?</h4>
          <p className={tbl.caixaHint}>
            Escolha uma vez e a conferência deste fornecedor passa a achar as notas sozinha.
          </p>
          <div className={tbl.deparaRow}>
            <select
              className={`${tbl.select} ${tbl.selectVazio}`}
              defaultValue=""
              disabled={!canEdit}
              onChange={(e) => e.target.value && onVincular(pedido.fornecedorId, e.target.value)}
            >
              <option value="">— escolher fornecedor da nota —</option>
              {fornecedoresNota.map((n) => (
                <option key={n.id} value={n.id}>{n.nome_curto || n.nome}</option>
              ))}
            </select>
            {(() => {
              const sug = sugereFornecedor(pedido.fornecedorNome, fornecedoresNota);
              return sug && canEdit ? (
                <button className={tbl.btnSugestao} onClick={() => onVincular(pedido.fornecedorId, sug.id)}>
                  {sug.nome_curto || sug.nome}
                </button>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Notas candidatas */}
      {!fechada && notaFornId != null && (
        <div className={tbl.notasBox}>
          <div className={tbl.notasHead}>
            <span className={tbl.notasTitulo}>
              {loading ? 'Buscando notas...' : notas.length === 0
                ? 'Nenhuma nota encontrada na janela'
                : `${notas.length} ${notas.length === 1 ? 'nota encontrada' : 'notas encontradas'}`}
            </span>
            <label className={tbl.folgaLabel}>
              até
              <input
                className={tbl.folgaInput}
                type="number"
                min="0"
                max="60"
                value={folga}
                onChange={(e) => setFolga(Math.max(0, Number(e.target.value) || 0))}
              />
              dias após a entrega
            </label>
          </div>
          {notas.length > 0 && (
            <div className={tbl.notasList}>
              {notas.map((n) => {
                const usada = usadaEm[n.id];
                return (
                  <label key={n.id} className={`${tbl.notaChip} ${marcada(n.id) ? tbl.notaChipOn : ''}`}>
                    <input type="checkbox" checked={marcada(n.id)} onChange={() => toggle(n.id)} />
                    <span>
                      {nfNumero(n.chave_acesso) ? `NF ${nfNumero(n.chave_acesso)}` : `Nota #${n.id}`}
                      {' · '}{fmtDiaMes(n.data_emissao)}
                      {' · '}{fmtBRL(n.valor_total)}
                    </span>
                    {usada && (
                      <span className={tbl.notaUsada} title={`Já conferida no pedido de ${fmtDiaMes(usada.data)}`}>
                        já conferida
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          {error && <p className={tbl.aviso}>Não foi possível carregar as notas: {error}</p>}
          {!loading && notas.length === 0 && (
            <p className={tbl.caixaHint}>
              Nenhuma nota deste fornecedor na {pedido.lojaNome} entre{' '}
              <strong>{fmtDiaMes(de)}</strong> e <strong>{fmtDiaMes(ate)}</strong>. Se a entrega
              atrasou, aumente os dias acima.
            </p>
          )}
        </div>
      )}

      {/* Resumo */}
      <div className={tbl.resumo}>
        <div className={tbl.resumoChips}>
          {resumo.ok > 0 && <span className={tbl.chipOk}>{resumo.ok} ok</span>}
          {resumo.faltou > 0 && <span className={tbl.chipFaltou}>{resumo.faltou} faltou</span>}
          {resumo.naoVeio > 0 && <span className={tbl.chipNaoVeio}>{resumo.naoVeio} não veio</span>}
          {resumo.sobrou > 0 && <span className={tbl.chipSobrou}>{resumo.sobrou} veio a mais</span>}
          {resumo.confirmar > 0 && <span className={tbl.chipConfirmar}>{resumo.confirmar} confirmar</span>}
        </div>
        <span className={tbl.resumoInfo}>
          {fechada ? (
            <>
              Congelado
              {conferencia.fechadoPorNome ? ` por ${conferencia.fechadoPorNome}` : ''}
              {' · '}{(conferencia.notas || []).length} {(conferencia.notas || []).length === 1 ? 'nota' : 'notas'}
              {' · '}{fmtBRL(conferencia.totalNota)}
            </>
          ) : (
            <>Total das notas marcadas: <strong>{fmtBRL(totalNota)}</strong></>
          )}
        </span>
      </div>

      {fechada && conferencia.obs && (
        <p className={tbl.obsSalva}><strong>Observação:</strong> {conferencia.obs}</p>
      )}

      {/* Tabela pedido × nota */}
      <div className={tbl.tableWrap}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th>Produto</th>
              <th className={tbl.num}>Pediu</th>
              <th className={tbl.num}>Veio</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaConf
                key={l.itemId}
                l={l}
                fechada={fechada}
                canEdit={canEdit}
                item={itensPorId[l.itemId]}
                onEquiv={onEquiv}
              />
            ))}
          </tbody>
        </table>
      </div>

      {extras.length > 0 && (
        <>
          <h4 className={tbl.extrasTitulo}>
            Na nota, fora do pedido ({extras.length})
          </h4>
          <div className={tbl.tableWrap}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className={tbl.num}>Veio</th>
                  <th className={tbl.num}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {extras.map((e, i) => (
                  <tr key={e.id ?? `${e.produto}-${i}`} className={tbl.rowExtra}>
                    <td data-label="Produto">{e.produto}</td>
                    <td data-label="Veio" className={tbl.num}>
                      {fmtNum(e.qtd)}<span className={tbl.medida}>{e.unid}</span>
                    </td>
                    <td data-label="Valor" className={tbl.num}>{fmtBRL(e.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={tbl.caixaHint}>
            Pode ser produto entregue sem pedido, ou um item de Compras ainda não vinculado
            ao produto da seção Preços — nesse caso o vínculo resolve e a linha some daqui.
          </p>
        </>
      )}

      {!fechada && canEdit && (
        <label className={tbl.obsLabel}>
          Observação (opcional)
          <textarea
            className={tbl.obsInput}
            rows={2}
            placeholder="Ex.: vendedor avisou que a muçarela vem na segunda."
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </label>
      )}
    </>
  );
}

/** Uma linha do cruzamento, com o campo de equivalência quando não converteu. */
function LinhaConf({ l, fechada, canEdit, item, onEquiv }) {
  const [aberto, setAberto] = useState(false);
  const podeEnsinar = !fechada && canEdit && item && l.naoConv?.length > 0;

  const classe = {
    ok: '', faltou: tbl.rowFaltou, naoVeio: tbl.rowNaoVeio,
    sobrou: tbl.rowSobrou, confirmar: tbl.rowConfirmar,
  }[l.sit] || '';

  // Unidades da nota que a linha não soube converter, com o fator sugerido a
  // partir dos próprios números observados.
  const pendentes = useMemo(() => {
    const m = new Map();
    for (const n of l.naoConv || []) {
      const u = String(n.unid || '').trim().toUpperCase();
      if (!m.has(u)) m.set(u, { unid: u, qtd: n.qtd, sugerido: sugereEquivalencia(l.qty, n.qtd) });
    }
    return [...m.values()];
  }, [l.naoConv, l.qty]);

  return (
    <>
      <tr className={classe}>
        <td data-label="Produto">
          <span className={tbl.produto}>{l.produto}</span>
          {l.marca && <span className={tbl.medida}> {l.marca}</span>}
        </td>
        <td data-label="Pediu" className={tbl.num}>
          {fmtNum(l.qty)}<span className={tbl.medida}>{l.unid}</span>
        </td>
        <td data-label="Veio" className={tbl.num}>
          {l.sit === 'naoVeio' ? <span className={tbl.dim}>—</span>
            : l.sit === 'confirmar' ? (
              <span className={tbl.cru} title="A tela não sabe traduzir esta unidade">
                {fechada ? (l.cru || '?') : (l.naoConv || []).map((n) => `${fmtNum(n.qtd)} ${n.unid}`).join(' + ')}
              </span>
            ) : (
              <>
                {fmtNum(l.veio)}<span className={tbl.medida}>{l.unid}</span>
                {l.regras?.length === 1 && l.regras[0] === 0 && (
                  <span className={tbl.medida} title="Convertido pela equivalência que você declarou"> ✓</span>
                )}
              </>
            )}
        </td>
        <td data-label="Situação">
          <span className={tbl[`sit${l.sit}`]}>{SITUACAO_LABEL[l.sit]}</span>
          {l.sit === 'faltou' && (
            <span className={tbl.medida}> {fmtNum(l.qty - l.veio)}{l.unid}</span>
          )}
          {podeEnsinar && (
            <button className={tbl.btnEnsinar} onClick={() => setAberto((v) => !v)}>
              {aberto ? 'fechar' : 'ensinar unidade'}
            </button>
          )}
        </td>
      </tr>
      {aberto && podeEnsinar && (
        <tr className={tbl.rowEnsinar}>
          <td colSpan={4}>
            {pendentes.map((p) => (
              <EnsinaUnidade
                key={p.unid}
                item={item}
                pendente={p}
                unidPedido={l.unid}
                onEquiv={onEquiv}
              />
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * "1 fardo = ___ UN". Grava no item, então na semana seguinte a mesma linha já
 * converte sozinha — é assim que os ~40% que nenhuma regra automática acerta vão
 * virando automáticos com o uso.
 *
 * A pergunta é feita na direção em que gente fala ("um fardo tem 6 unidades"),
 * não no fator inverso (0,1667) que a conta usaria.
 */
function EnsinaUnidade({ item, pendente, unidPedido, onEquiv }) {
  const [valor, setValor] = useState(pendente.sugerido != null ? String(pendente.sugerido) : '');
  const [salvo, setSalvo] = useState(false);
  const alvo = unidPedido || 'un';

  const salvar = async () => {
    const n = Number(String(valor).replace(',', '.'));
    if (!(n > 0)) {
      window.alert(`Informe quantos ${pendente.unid} cabem em 1 ${alvo}.`);
      return;
    }
    try {
      await onEquiv(item.id, { equiv: { ...(item.equiv || {}), [pendente.unid]: n } });
      setSalvo(true);
    } catch (e) {
      window.alert(`Erro ao salvar a equivalência: ${e?.message || e}`);
    }
  };

  return (
    <div className={tbl.ensinaRow}>
      <span className={tbl.ensinaTexto}>
        1 <strong>{alvo}</strong> do pedido tem
        <input
          className={tbl.ensinaInput}
          type="number"
          step="any"
          min="0"
          value={valor}
          onChange={(e) => { setValor(e.target.value); setSalvo(false); }}
        />
        <strong>{pendente.unid}</strong> da nota
      </span>
      {pendente.sugerido != null && !salvo && (
        <span className={tbl.ensinaHint}>
          sugerido pelos números desta linha — confira antes de salvar
        </span>
      )}
      <button className={tbl.btnPrimary} onClick={salvar} disabled={salvo}>
        {salvo ? 'Salvo' : 'Salvar'}
      </button>
    </div>
  );
}
