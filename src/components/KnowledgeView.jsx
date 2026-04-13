import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/KnowledgeView.module.css';

export default function KnowledgeView({ messages, loading, sendMessage, knowledgeBase, updateKnowledgeBase, ready }) {
  const { isAdmin } = useAuth();
  const [input, setInput] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [kbText, setKbText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (showAdmin) setKbText(knowledgeBase);
  }, [showAdmin, knowledgeBase]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input);
    setInput('');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setKbText(ev.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveKb = () => {
    updateKnowledgeBase(kbText);
    setShowAdmin(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Conhecimento</h2>
        {isAdmin && (
          <button className={styles.adminBtn} onClick={() => setShowAdmin(!showAdmin)}>
            {showAdmin ? 'Voltar ao Chat' : 'Gerenciar Base'}
          </button>
        )}
      </div>

      {showAdmin ? (
        <div className={styles.adminPanel}>
          <p className={styles.adminDesc}>
            Cole ou envie o texto da base de conhecimento. O Gemini usará esse conteúdo para responder as perguntas.
          </p>
          <div className={styles.uploadRow}>
            <label className={styles.uploadBtn}>
              Enviar arquivo .txt
              <input type="file" accept=".txt,.md,.csv" onChange={handleFileUpload} hidden />
            </label>
            <span className={styles.uploadHint}>
              {knowledgeBase ? `Base atual: ${knowledgeBase.length} caracteres` : 'Nenhuma base carregada'}
            </span>
          </div>
          <textarea
            className={styles.kbTextarea}
            value={kbText}
            onChange={(e) => setKbText(e.target.value)}
            placeholder="Cole aqui o conteúdo da base de conhecimento..."
            rows={16}
          />
          <button className={styles.saveBtn} onClick={handleSaveKb}>
            Salvar Base de Conhecimento
          </button>
        </div>
      ) : (
        <>
          <div className={styles.chatArea}>
            {messages.length === 0 && !loading && (
              <div className={styles.empty}>
                {ready
                  ? 'Faça uma pergunta sobre os processos e procedimentos da empresa.'
                  : 'Base de conhecimento ainda não configurada. Peça ao administrador para carregar.'}
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`${styles.message} ${msg.role === 'user' ? styles.userMsg : styles.aiMsg}`}>
                <div className={styles.msgBubble}>
                  {msg.text.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className={`${styles.message} ${styles.aiMsg}`}>
                <div className={`${styles.msgBubble} ${styles.typing}`}>
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            <input
              className={styles.chatInput}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={ready ? 'Digite sua pergunta...' : 'Base de conhecimento não configurada'}
              disabled={!ready}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!ready || loading || !input.trim()}
            >
              Enviar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
