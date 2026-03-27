import { useState, useEffect } from 'react';
import RichTextEditor from './RichTextEditor';
import styles from '../styles/TaskModal.module.css';

export default function NoteModal({ note, onSave, onUpdate, onDelete, onClose }) {
  const isEditing = !!note;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content || '');
    }
  }, [note]);

  const handleSave = () => {
    if (!title.trim()) return;
    if (isEditing) {
      onUpdate(note.id, { title: title.trim(), content });
    } else {
      onSave({ title: title.trim(), content });
    }
    onClose();
  };

  const handleDelete = () => {
    if (note && window.confirm('Excluir esta anotação?')) {
      onDelete(note.id);
      onClose();
    }
  };

  const hasUnsavedContent = () => {
    if (isEditing) {
      return title !== (note.title || '') || content !== (note.content || '');
    }
    return title.trim() !== '' || (content.trim() !== '' && content !== '<p></p>');
  };

  const handleClose = () => {
    if (hasUnsavedContent()) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={handleClose}>
          &times;
        </button>

        <input
          className={styles.titleInput}
          type="text"
          placeholder="Título da anotação"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className={styles.field} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 4, display: 'block' }}>
            Conteúdo
          </label>
          <RichTextEditor value={content} onChange={setContent} placeholder="Escreva sua anotação..." resizable />
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave}>
            Salvar
          </button>
          {isEditing && (
            <button className={styles.deleteBtn} onClick={handleDelete}>
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
