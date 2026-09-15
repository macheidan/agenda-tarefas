import { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, query, orderBy, limit, updateDoc, setDoc, deleteDoc, serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import { novaCampanhaId } from '../utils/whatsapp';

/**
 * Usos da campanha, digitados à mão (quantos clientes usaram o cupom/oferta).
 * É o ÚNICO campo de `campanhas` que o cliente escreve — as regras só deixam
 * mexer em `usos*`, para ninguém adulterar os contadores que vêm da Meta.
 * `usos` vazio apaga o campo: "não conferido" é diferente de zero.
 */
export async function salvarUsosCampanha(campanhaId, usos, usuario) {
  await updateDoc(doc(db, 'campanhas', campanhaId), {
    usos: usos === null ? deleteField() : usos,
    usosAtualizadoEm: serverTimestamp(),
    usosAtualizadoPor: usuario?.email || usuario?.uid || null,
  });
}

/**
 * Envio de teste vira campanha própria (`teste-…`) pelo mesmo caminho do
 * disparo de verdade, mas não é campanha de ninguém: fica fora das listas.
 */
export const ehTeste = (c) => String(c?.id || '').startsWith('teste-');

/**
 * Campanha salva, ainda sem envio: o molde que a Lista escolhe na hora de
 * disparar. O id dela é o `campanhaId` do disparo — é por
 * `campanhaId__telefone` que o servidor pula quem já recebeu, então mandar a
 * mesma campanha de novo (outro dia, outro recorte, ou retomando um disparo
 * interrompido) nunca repete mensagem. Para mandar outra vez a quem já
 * recebeu, copia-se a campanha, o que gera id novo.
 *
 * As rules só deixam o cliente CRIAR com estes campos; os contadores continuam
 * sendo só do servidor.
 */
export async function salvarCampanha(dados, usuario) {
  const id = novaCampanhaId(dados.loja);
  await setDoc(doc(db, 'campanhas', id), {
    titulo: dados.titulo,
    loja: dados.loja,
    template: dados.template,
    idioma: dados.idioma,
    texto: dados.texto,
    cupom: dados.cupom,
    botaoUrl: dados.botaoUrl,
    salva: true,
    criadoEm: serverTimestamp(),
    criadoPor: usuario?.email || usuario?.uid || null,
  });
  return id;
}

/**
 * Apaga só o cabeçalho. Os envios (`campanhaEnvios`) ficam — são o histórico
 * de quem recebeu o quê e o índice `clientesMeta/ultimoEnvio` depende deles.
 */
export async function excluirCampanha(campanhaId) {
  await deleteDoc(doc(db, 'campanhas', campanhaId));
}

/**
 * Arquivar só tira a campanha da lista principal — os envios, contadores e o
 * bloqueio de reenvio por `campanhaId__telefone` continuam intactos.
 */
export async function arquivarCampanha(campanhaId, arquivada, usuario) {
  await updateDoc(doc(db, 'campanhas', campanhaId), {
    arquivada,
    arquivadaEm: serverTimestamp(),
    arquivadaPor: usuario?.email || usuario?.uid || null,
  });
}

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
  const [ultimoEnvio, setUltimoEnvio] = useState({});
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
    // `campanhas` sem orderBy de propósito: o Firestore OMITE da query ordenada
    // todo documento que não tem o campo, então uma campanha cujo cabeçalho
    // ficou sem `criadoEm` desapareceria da tela inteira — com os envios todos
    // gravados. Ordenar aqui no cliente custa nada em 30 documentos e não
    // esconde nada. Limite de 60, não 30: os envios de teste também são docs
    // desta coleção e, escondidos da tela, ainda comeriam a cota da query.
    const porData = (a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0);
    const unsubs = [
      onSnapshot(
        query(collection(db, 'campanhas'), limit(60)),
        (snap) => {
          setCampanhas(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porData));
          setLoading(false);
        },
        (err) => {
          console.error('Firestore campanhas error:', err);
          setLoading(false);
        }
      ),
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

  // Quando cada telefone recebeu a última mensagem: {telefone: ms}. Mesmo
  // motivo do índice de opt-out — a alternativa seria varrer campanhaEnvios,
  // que tem um documento por MENSAGEM enviada.
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'clientesMeta', 'ultimoEnvio'),
        (snap) => setUltimoEnvio(snap.exists() ? snap.data()?.tel || {} : {}),
        (err) => console.error('Firestore clientesMeta/ultimoEnvio error:', err)
      ),
    []
  );

  return { campanhas, respostas, optOuts, optOutTelefones, ultimoEnvio, loading };
}
