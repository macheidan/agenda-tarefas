import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';

export function useKnowledge() {
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState(null);
  const [error, setError] = useState('');

  const initChat = useCallback((content, apiKey) => {
    if (!content || !apiKey) return;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
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

  // Load knowledge base and API key from Firestore
  useEffect(() => {
    const load = async () => {
      try {
        const [baseSnap, configSnap] = await Promise.all([
          getDoc(doc(db, 'knowledge', 'base')),
          getDoc(doc(db, 'knowledge', 'config')),
        ]);
        const content = baseSnap.exists() ? baseSnap.data().content || '' : '';
        const apiKey = configSnap.exists() ? configSnap.data().geminiKey || '' : '';
        setKnowledgeBase(content);
        setGeminiKey(apiKey);
        if (content && apiKey) {
          initChat(content, apiKey);
        } else if (!apiKey) {
          setError('Chave API do Gemini não configurada. O admin deve configurar em Gerenciar Base.');
        }
      } catch (err) {
        console.error('[Knowledge] Erro ao carregar:', err);
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
      initChat(content, geminiKey);
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
      await setDoc(ref, { geminiKey: key, updatedAt: new Date() });
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

  return { messages, loading, sendMessage, knowledgeBase, updateKnowledgeBase, updateGeminiKey, geminiKey, ready: !!chat, error };
}
