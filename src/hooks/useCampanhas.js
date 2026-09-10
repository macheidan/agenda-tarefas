import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Campanhas de WhatsApp e o que voltou delas.
 *
 * As três coleções são escritas SÓ pelo servidor (o proxy na Vercel e o webhook
 * da Meta); aqui é leitura. Os contadores de cada campanha (enviados, entregues,
 * lidos, falhas) sobem por `increment` no webhook, então nunca são recalculados
 * no cliente — quem lê aqui vê o que a Meta confirmou.
 *
 * `campanhaEnvios` (1 doc por mensagem) NÃO é carregada: são centenas por
 * campanha e a tela mostra totais. Quem precisa do detalhe abre a campanha.
 *
 * Os descadastros chegam por dois caminhos, de propósito. `optOuts` é a lista
 * dos últimos 500, para o painel mostrar quem saiu e quando. `optOutTelefones`
 * vem do índice `clientesMeta/optOut` — um documento só, com TODOS os números —
 * e é ele que decide quem fica de fora da cópia e do disparo. Filtrar pela
 * lista dos 500 mais recentes faria o descadastro mais antigo voltar às listas
 * calado, e a cópia não tem servidor nenhum atrás para segurar o erro.
 */
export function useCampanhas(ativo) {
  const [campanhas, setCampanhas] = useState([]);
  const [respostas, setRespostas] = useState([]);
  const [optOuts, setOptOuts] = useState([]);
  const [optOutTelefones, setOptOutTelefones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ativo) return undefined;
    const assinar = (nome, campo, n, set) =>
      onSnapshot(
        query(collection(db, nome), orderBy(campo, 'desc'), limit(n)),
        (snap) => {
          set(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => {
          console.error(`Firestore ${nome} error:`, err);
          setLoading(false);
        }
      );
    const unsubs = [
      assinar('campanhas', 'criadoEm', 30, setCampanhas),
      assinar('campanhaRespostas', 'recebidoEm', 100, setRespostas),
      assinar('clientesOptOut', 'criadoEm', 500, setOptOuts),
    ];
    return () => unsubs.forEach((u) => u());
  }, [ativo]);

  // Fora do `ativo` de propósito: o botão de copiar telefones aparece para quem
  // só ENXERGA a lista, sem permissão de disparar. Preso ao `ativo`, essa
  // pessoa receberia o índice vazio e copiaria os descadastrados junto — o
  // caminho que não tem servidor nenhum atrás para corrigir o erro.
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'clientesMeta', 'optOut'),
        (snap) => setOptOutTelefones(snap.exists() ? snap.data()?.telefones || [] : []),
        (err) => console.error('Firestore clientesMeta/optOut error:', err)
      ),
    []
  );

  return { campanhas, respostas, optOuts, optOutTelefones, loading };
}
