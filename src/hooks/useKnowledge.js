import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { callGemini } from '../utils/gemini';

const MODELS = [
  'gemini-3.0-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const DEFAULT_NAME = 'Assistente';
const DEFAULT_PERSONALITY = 'Simpática, prestativa e profissional. Responde de forma clara e objetiva em português brasileiro.';

const buildSystemPrompt = (content, name, personality) =>
  `Você é ${name || DEFAULT_NAME}. ${personality || DEFAULT_PERSONALITY}

Regras:
- Use a base de conhecimento abaixo para responder.
- Se a informação não estiver na base, avise que não encontrou essa informação e sugira confirmar com o gestor.
- Quando a pergunta envolver procedimentos, dê respostas práticas e diretas.
- Pode sugerir próximos passos quando fizer sentido.
- Responda sempre em português brasileiro.

--- BASE DE CONHECIMENTO ---
${content}
--- FIM DA BASE ---`;

export function useKnowledge() {
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [persona, setPersona] = useState({ name: '', personality: '' });
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Histórico no formato do Gemini ({ role, parts }); o proxy é stateless, então
  // a conversa inteira vai em cada chamada (mesmo que o SDK fazia por baixo).
  const historyRef = useRef([]);
  const kbRef = useRef('');
  const personaRef = useRef({ name: '', personality: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const [baseSnap, configSnap] = await Promise.all([
          getDoc(doc(db, 'knowledge', 'base')),
          getDoc(doc(db, 'knowledge', 'config')),
        ]);
        const content = baseSnap.exists() ? baseSnap.data().content || '' : '';
        const config = configSnap.exists() ? configSnap.data() : {};
        const p = { name: config.assistantName || '', personality: config.assistantPersonality || '' };
        setKnowledgeBase(content);
        kbRef.current = content;
        setPersona(p);
        personaRef.current = p;
      } catch (err) {
        console.error('[Knowledge] Erro ao carregar:', err);
        setError('Erro ao carregar base de conhecimento: ' + err.message);
      }
    };
    load();
  }, []);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const askModel = (model, contents) => {
    const p = personaRef.current;
    return callGemini({
      model,
      contents,
      systemInstruction: buildSystemPrompt(kbRef.current, p.name, p.personality),
    });
  };

  const trySendWithRetry = async (contents, retries) => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await askModel(MODELS[0], contents);
      } catch (err) {
        const is503 = err?.message?.includes('503') || err?.message?.includes('high demand');
        const is429 = err?.message?.includes('429') || err?.message?.includes('quota');
        if ((is503 || is429) && i < retries) {
          console.log(`[Knowledge] Retry ${i + 1}/${retries} em ${(i + 1) * 3}s...`);
          await wait((i + 1) * 3000);
        } else {
          throw err;
        }
      }
    }
  };

  const tryFallbackModels = async (contents, startIndex) => {
    for (let i = startIndex; i < MODELS.length; i++) {
      try {
        console.log(`[Knowledge] Tentando modelo: ${MODELS[i]}`);
        return await askModel(MODELS[i], contents);
      } catch (err) {
        console.warn(`[Knowledge] ${MODELS[i]} falhou:`, err.message);
      }
    }
    return null;
  };

  const sendMessage = async (text) => {
    if (!kbRef.current || !text.trim()) return;

    const userMsg = { role: 'user', text: text.trim(), timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const contents = [...historyRef.current, { role: 'user', parts: [{ text: text.trim() }] }];
    try {
      let response;
      try {
        response = await trySendWithRetry(contents, 3);
      } catch {
        console.warn('[Knowledge] Retries esgotados, tentando fallback...');
        response = await tryFallbackModels(contents, 1);
      }
      if (response) {
        historyRef.current = [...contents, { role: 'model', parts: [{ text: response }] }];
        const aiMsg = { role: 'ai', text: response, timestamp: Date.now() };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg = { role: 'ai', text: 'Todos os modelos estão sobrecarregados. Tente novamente em alguns minutos.', timestamp: Date.now() };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateKnowledgeBase = async (content, newPersona) => {
    try {
      const ref = doc(db, 'knowledge', 'base');
      await setDoc(ref, { content, updatedAt: new Date() });
      if (newPersona) {
        const configRef = doc(db, 'knowledge', 'config');
        await setDoc(configRef, {
          assistantName: newPersona.name,
          assistantPersonality: newPersona.personality,
        }, { merge: true });
        setPersona(newPersona);
        personaRef.current = newPersona;
      }
      setKnowledgeBase(content);
      kbRef.current = content;
      setMessages([]);
      historyRef.current = [];
      return true;
    } catch (err) {
      console.error('[Knowledge] Erro ao salvar base:', err);
      setError('Erro ao salvar: ' + err.message);
      return false;
    }
  };

  return { messages, loading, sendMessage, knowledgeBase, updateKnowledgeBase, persona, ready: !!knowledgeBase, error };
}
