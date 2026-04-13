import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

export function useKnowledge() {
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState(null);

  // Load knowledge base from Firestore
  useEffect(() => {
    const load = async () => {
      const ref = doc(db, 'knowledge', 'base');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setKnowledgeBase(snap.data().content || '');
      }
    };
    load();
  }, []);

  // Initialize chat session when knowledge base loads
  useEffect(() => {
    if (!apiKey || !knowledgeBase) return;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: `Você é um assistente de conhecimento interno de uma rede de pizzarias. Responda APENAS com base no conhecimento fornecido abaixo. Se a pergunta não puder ser respondida com o conhecimento disponível, diga que não tem essa informação na base de conhecimento.\n\n--- BASE DE CONHECIMENTO ---\n${knowledgeBase}\n--- FIM DA BASE ---`,
      });
      const chatSession = model.startChat({ history: [] });
      setChat(chatSession);
    } catch (err) {
      console.error('Erro ao inicializar Gemini:', err);
    }
  }, [knowledgeBase]);

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
      console.error('Erro Gemini:', err);
      const errorMsg = { role: 'ai', text: 'Erro ao processar a pergunta. Tente novamente.', timestamp: Date.now() };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const updateKnowledgeBase = async (content) => {
    const ref = doc(db, 'knowledge', 'base');
    await setDoc(ref, { content, updatedAt: new Date() });
    setKnowledgeBase(content);
    // Reset chat with new knowledge
    setMessages([]);
    setChat(null);
  };

  return { messages, loading, sendMessage, knowledgeBase, updateKnowledgeBase, ready: !!chat };
}
