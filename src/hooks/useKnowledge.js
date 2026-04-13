import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';

export function useKnowledge() {
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState(null);
  const [error, setError] = useState('');

  const initChat = useCallback((content) => {
    if (!content) return;
    try {
      const key = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: `Você é um assistente de conhecimento interno de uma rede de pizzarias. Responda APENAS com base no conhecimento fornecido abaixo. Se a pergunta não puder ser respondida com o conhecimento disponível, diga que não tem essa informação na base de conhecimento.\n\n--- BASE DE CONHECIMENTO ---\n${content}\n--- FIM DA BASE ---`,
      });
      const chatSession = model.startChat({ history: [] });
      setChat(chatSession);
      setError('');
    } catch (err) {
      console.error('[Knowledge] Erro ao inicializar Gemini:', err);
      setError('Erro ao inicializar Gemini: ' + err.message);
    }
  }, []);

  // Load knowledge base from Firestore
  useEffect(() => {
    const load = async () => {
      try {
        const ref = doc(db, 'knowledge', 'base');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const content = snap.data().content || '';
          setKnowledgeBase(content);
          initChat(content);
        }
      } catch (err) {
        console.error('[Knowledge] Erro ao carregar base:', err);
        setError('Erro ao carregar base de conhecimento: ' + err.message);
      }
    };
    load();
  }, [initChat]);

  const sendMessage = async (text) => {
    if (!chat || !text.trim()) return;

    const userMsg = { role: 'user', text: text.trim(), timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await chat.sendMessage(text.trim());
      const response = await result.response.text();
      const aiMsg = { role: 'ai', text: response, timestamp: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('[Knowledge] Erro Gemini:', err);
      const detail = err?.message || err?.statusText || String(err);
      const errorMsg = { role: 'ai', text: `Erro: ${detail}`, timestamp: Date.now() };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const updateKnowledgeBase = async (content) => {
    try {
      const ref = doc(db, 'knowledge', 'base');
      await setDoc(ref, { content, updatedAt: new Date() });
      setKnowledgeBase(content);
      setMessages([]);
      initChat(content);
      return true;
    } catch (err) {
      console.error('[Knowledge] Erro ao salvar base:', err);
      setError('Erro ao salvar: ' + err.message);
      return false;
    }
  };

  return { messages, loading, sendMessage, knowledgeBase, updateKnowledgeBase, ready: !!chat, error };
}
