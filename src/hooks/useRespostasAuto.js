import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Textos das respostas automáticas do número de campanha.
 *
 * O número que dispara é um chip que não está aberto em aparelho nenhum — é
 * condição para ele registrar na Cloud API. Quem responde à campanha não fala
 * com ninguém, então o webhook responde sozinho. Estes são os textos dele.
 *
 * Vivem no Firestore e não no código porque quem escreve a mensagem é quem faz
 * o marketing, não quem faz deploy: mudar uma vírgula aqui não pode depender de
 * publicar o proxy na Vercel. O webhook lê este documento a cada mensagem
 * recebida e só cai nos padrões embutidos se ele não existir.
 */
export const PLACEHOLDERS = {
  link: 'o link do WhatsApp que atende (vem do número configurado no servidor)',
  nome: 'o primeiro nome de quem escreveu, quando o WhatsApp informa',
};

// Espelham os defaults do `wa-webhook.js`. Servem de ponto de partida no form —
// o texto que vale é sempre o que está gravado; sem documento, o servidor usa
// os dele.
export const PADROES = {
  clicou:
    'Que bom que você quer saber! 🍕\n\n' +
    'Chama a gente aqui que a gente te conta tudo: {link}',
  digitou:
    'Oi! Este número só envia novidades e não é atendido por aqui 🙂\n\n' +
    'Para falar com a gente, chama no nosso WhatsApp: {link}\n\n' +
    'Se não quiser mais receber, responda SAIR.',
  saiu: 'Pronto! Você não vai mais receber nossas mensagens. 👋',
};

export function useRespostasAuto(ativo) {
  const [mensagens, setMensagens] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ativo) return undefined;
    return onSnapshot(
      doc(db, 'campanhaConfig', 'mensagens'),
      (snap) => {
        setMensagens(snap.exists() ? snap.data() : {});
        setLoading(false);
      },
      (err) => {
        console.error('Firestore campanhaConfig/mensagens error:', err);
        setLoading(false);
      }
    );
  }, [ativo]);

  const salvar = async (valores, usuario) =>
    setDoc(
      doc(db, 'campanhaConfig', 'mensagens'),
      {
        ...valores,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: usuario?.email || usuario?.uid || '',
      },
      { merge: true }
    );

  return { mensagens, loading, salvar };
}
