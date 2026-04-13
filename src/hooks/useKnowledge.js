import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  const [geminiKey, setGeminiKey] = useState('');
  const [persona, setPersona] = useState({ name: '', personality: '' });
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState(null);
  const [error, setError] = useState('');
  const genAIRef = useRef(null);
  const kbRef = useRef('');
  const personaRef = useRef({ name: '', personality: '' });

  const initChat = useCallback((content, apiKey, p) => {
    if (!content || !apiKey) return;
    const pData = p || personaRef.current;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      genAIRef.current = genAI;
      kbRef.current = content;
      personaRef.current = pData;
      const model = genAI.getGenerativeModel({
        model: MODELS[0],
        systemInstruction: buildSystemPrompt(content, pData.name, pData.personality),
      });
      const chatSession = model.startChat({ history: [] });
      setChat(chatSession);
      setError('');
    } catch (err) {
      console.error('[Knowledge] Erro ao inicializar Gemini:', err);
      setError('Erro ao inicializar Gemini: ' + err.message);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [baseSnap, configSnap] = await Promise.all([
          getDoc(doc(db, 'knowledge', 'base')),
          getDoc(doc(db, 'knowledge', 'config')),
        ]);
        const content = baseSnap.exists() ? baseSnap.data().content || '' : '';
        const config = configSnap.exists() ? configSnap.data() : {};
        const apiKey = config.geminiKey || '';
        const p = { name: config.assistantName || '', personality: config.assistantPersonality || '' };
        setKnowledgeBase(content);
        setGeminiKey(apiKey);
        setPersona(p);
        personaRef.current = p;
        if (content && apiKey) {
          initChat(content, apiKey, p);
        } else if (!apiKey) {
          setError('Chave API do Gemini não configurada. Configure nas Configurações.');
        }
      } catch (err) {
        console.error('[Knowledge] Erro ao carregar:', err);
        setError('Erro ao carregar base de conhecimento: ' + err.message);
      }
    };
    load();
  }, [initChat]);

  const tryFallbackModels = async (text, startIndex) => {
    const genAI = genAIRef.current;
    if (!genAI) return null;
    const p = personaRef.current;
    for (let i = startIndex; i < MODELS.length; i++) {
      try {
        console.log(`[Knowledge] Tentando modelo: ${MODELS[i]}`);
        const model = genAI.getGenerativeModel({
          model: MODELS[i],
          systemInstruction: buildSystemPrompt(kbRef.current, p.name, p.personality),
        });
        const result = await model.generateContent(text);
        return result.response.text();
      } catch (err) {
        console.warn(`[Knowledge] ${MODELS[i]} falhou:`, err.message);
      }
    }
    return null;
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const trySendWithRetry = async (chatSession, text, retries) => {
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await chatSession.sendMessage(text);
        return result.response.text();
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

  const sendMessage = async (text) => {
    if (!chat || !text.trim()) return;

    const userMsg = { role: 'user', text: text.trim(), timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const response = await trySendWithRetry(chat, text.trim(), 3);
      const aiMsg = { role: 'ai', text: response, timestamp: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.warn(`[Knowledge] Retries esgotados, tentando fallback...`);
      const fallbackResponse = await tryFallbackModels(text.trim(), 1);
      if (fallbackResponse) {
        const aiMsg = { role: 'ai', text: fallbackResponse, timestamp: Date.now() };
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
      setMessages([]);
      initChat(content, geminiKey, newPersona || persona);
      return true;
    } catch (err) {
      console.error('[Knowledge] Erro ao salvar base:', err);
      setError('Erro ao salvar: ' + err.message);
      return false;
    }
  };

  const updateGeminiKey = async (key) => {
    try {
      const ref = doc(db, 'knowledge', 'config');
      await setDoc(ref, { geminiKey: key, updatedAt: new Date() }, { merge: true });
      setGeminiKey(key);
      setMessages([]);
      if (knowledgeBase && key) {
        initChat(knowledgeBase, key);
      }
      return true;
    } catch (err) {
      console.error('[Knowledge] Erro ao salvar chave:', err);
      setError('Erro ao salvar chave: ' + err.message);
      return false;
    }
  };

  return { messages, loading, sendMessage, knowledgeBase, updateKnowledgeBase, updateGeminiKey, geminiKey, persona, ready: !!chat, error };
}
