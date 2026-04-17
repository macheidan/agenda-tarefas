import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import RichContent from './RichContent';
import styles from '../styles/ChatView.module.css';

export default function ChatView({ users, conversations, onSendMessage, onMarkAsRead }) {
  const { user, isAdmin } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);

  // For non-admin, the room is always their own uid (chat with admin)
  const roomId = isAdmin ? selectedRoom : user.uid;
  const messages = (roomId && conversations[roomId]) || [];

  // Mark as read when viewing a room
  useEffect(() => {
    if (roomId && onMarkAsRead) {
      onMarkAsRead(roomId);
    }
  }, [roomId, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!message.trim() || !roomId) return;
    onSendMessage(roomId, message);
    setMessage('');
  };

  const otherUsers = users.filter((u) => u.uid !== user.uid);

  // For non-admin: show chat directly
  // For admin: show user list on left, chat on right
  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <h3>Chat com Administrador</h3>
          </div>
          <div className={styles.messagesList}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${msg.senderUid === user.uid ? styles.sent : styles.received}`}
              >
                {msg.senderUid !== user.uid && (
                  <img className={styles.msgAvatar} src={msg.senderPhoto || 'https://via.placeholder.com/28'} alt="" />
                )}
                <div className={styles.msgBubble}>
                  <RichContent className={styles.msgText} html={msg.text} />
                  <span className={styles.msgTime}>
                    {msg.timestamp?.toDate
                      ? msg.timestamp.toDate().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className={styles.inputArea}>
            <input
              type="text"
              placeholder="Digite uma mensagem..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button onClick={handleSend}>Enviar</button>
          </div>
        </div>
      </div>
    );
  }

  // Admin view with sidebar
  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>Conversas</h3>
        <div className={styles.userList}>
          {otherUsers.map((u) => {
            const roomMsgs = conversations[u.uid] || [];
            const unread = roomMsgs.filter(
              (m) => m.senderUid !== user.uid && !m.readBy?.includes(user.uid)
            ).length;
            const lastMsg = roomMsgs[roomMsgs.length - 1];

            return (
              <div
                key={u.uid}
                className={`${styles.userItem} ${selectedRoom === u.uid ? styles.userItemActive : ''}`}
                onClick={() => setSelectedRoom(u.uid)}
              >
                <img className={styles.userAvatar} src={u.photoURL || 'https://via.placeholder.com/36'} alt="" />
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{u.displayName || u.email}</span>
                  {lastMsg && (
                    <span className={styles.lastMsg}>
                      {lastMsg.text.length > 30 ? lastMsg.text.slice(0, 30) + '...' : lastMsg.text}
                    </span>
                  )}
                </div>
                {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
              </div>
            );
          })}
          {otherUsers.length === 0 && (
            <p className={styles.noUsers}>Nenhum usuário cadastrado.</p>
          )}
        </div>
      </div>

      <div className={styles.chatPanel}>
        {selectedRoom ? (
          <>
            <div className={styles.chatHeader}>
              <h3>{otherUsers.find((u) => u.uid === selectedRoom)?.displayName || 'Chat'}</h3>
            </div>
            <div className={styles.messagesList}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.message} ${msg.senderUid === user.uid ? styles.sent : styles.received}`}
                >
                  {msg.senderUid !== user.uid && (
                    <img className={styles.msgAvatar} src={msg.senderPhoto || 'https://via.placeholder.com/28'} alt="" />
                  )}
                  <div className={styles.msgBubble}>
                    <RichContent className={styles.msgText} html={msg.text} />
                    <span className={styles.msgTime}>
                      {msg.timestamp?.toDate
                        ? msg.timestamp.toDate().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className={styles.inputArea}>
              <input
                type="text"
                placeholder="Digite uma mensagem..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <button onClick={handleSend}>Enviar</button>
            </div>
          </>
        ) : (
          <div className={styles.emptyChat}>
            <p>Selecione um usuário para iniciar a conversa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
