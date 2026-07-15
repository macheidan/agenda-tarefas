import { useState, useRef, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Sugestão de Fator (Regra3) por LLM: analisa o nome do produto e a embalagem
// e devolve o fator que converte o preço normalizado para 1kg/1L/1un.
// Usa a mesma chave Gemini do chat (knowledge/config.geminiKey).

// Ordem por disponibilidade real da chave do projeto (3.0-flash dá 404 nela).
const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

function buildPrompt(p) {
  return `Você normaliza preços de insumos de pizzaria (Regra3).
O preço deste produto está expresso por "${p.unidade_normalizada || 'un'}".
Analise o NOME do produto e a EMBALAGEM: se indicarem um peso, volume ou
quantidade (ex.: "4KG", "500G", "2L", "900ML", "CX 12UN", "FARDO 6X2L"),
informe o fator que, aplicado ao preço, resulta no preço de 1kg (sólidos),
1L (líquidos) ou 1un (itens unitários).

Formato do fator (texto):
- número puro multiplica o preço (ex.: "2" = preço x2)
- prefixo "/" divide (ex.: "/4" = preço ÷4)
Exemplos: peça de 4kg com preço por un → "/4" · pacote 500g com preço por un
→ "/0,5" · caixa com 12un com preço por un(caixa) → "/12".

Se o preço JÁ está na unidade final (ex.: preço por kg e o nome não indica
embalagem maior), responda fator null.
Se o nome e a embalagem não derem nenhuma pista de peso/volume/quantidade,
responda fator null com motivo "sem pista no nome".

Produto: ${p.produto}
Embalagem: ${p.qtd_embalagem || '?'} ${p.unidade_embalagem || ''}
Preço por: ${p.unidade_normalizada || '?'}

Responda SOMENTE JSON: {"fator": "/4" ou "2" ou null, "motivo": "curto, no máximo 8 palavras"}`;
}

export function useFatorSugestao() {
  // produto_id -> { status: 'loading'|'ok'|'erro', fator, motivo }
  const [sugestoes, setSugestoes] = useState({});
  const keyPromiseRef = useRef(null);
  const pedidasRef = useRef(new Set()); // evita chamadas duplicadas por produto

  const getKey = useCallback(() => {
    if (!keyPromiseRef.current) {
      keyPromiseRef.current = getDoc(doc(db, 'knowledge', 'config'))
        .then((snap) => (snap.exists() ? snap.data().geminiKey || '' : ''));
    }
    return keyPromiseRef.current;
  }, []);

  // Pede a sugestão pro produto da linha (uma vez por produto_id por sessão).
  const sugerir = useCallback(async (p) => {
    const id = p.produto_id;
    if (pedidasRef.current.has(id)) return;
    pedidasRef.current.add(id);
    setSugestoes((prev) => ({ ...prev, [id]: { status: 'loading' } }));

    const fail = (motivo) => {
      pedidasRef.current.delete(id); // permite tentar de novo num próximo clique
      setSugestoes((prev) => ({ ...prev, [id]: { status: 'erro', motivo } }));
    };

    let apiKey;
    try {
      apiKey = await getKey();
    } catch {
      return fail('erro ao buscar a chave Gemini');
    }
    if (!apiKey) return fail('chave Gemini não configurada (Configurações)');

    const genAI = new GoogleGenerativeAI(apiKey);
    for (const m of MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: m,
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        });
        const res = await model.generateContent(buildPrompt(p));
        const txt = res.response.text();
        const json = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || txt);
        const fator = json.fator == null || json.fator === '' ? null : String(json.fator).trim();
        setSugestoes((prev) => ({
          ...prev,
          [id]: { status: 'ok', fator, motivo: String(json.motivo || '').trim() },
        }));
        return;
      } catch (err) {
        console.warn(`[fator-llm] ${m} falhou:`, err?.message);
      }
    }
    fail('LLM indisponível, tente de novo');
  }, [getKey]);

  return { sugestoes, sugerir };
}
