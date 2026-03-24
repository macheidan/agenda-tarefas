import { useRef, useCallback } from 'react';
import styles from '../styles/RichTextEditor.module.css';

export default function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);

  const exec = useCallback((command, val = null) => {
    document.execCommand(command, false, val);
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  }, [onChange]);

  const handleInput = () => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleLink = () => {
    const url = prompt('URL do link:');
    if (url) exec('createLink', url);
  };

  const handleFontSize = (e) => {
    exec('fontSize', e.target.value);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolBtn} onClick={() => exec('bold')} title="Negrito">
          <strong>B</strong>
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('italic')} title="Itálico">
          <em>I</em>
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('underline')} title="Sublinhado">
          <u>U</u>
        </button>
        <span className={styles.separator} />
        <button type="button" className={styles.toolBtn} onClick={handleLink} title="Link">
          🔗
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('insertUnorderedList')} title="Lista">
          ☰
        </button>
        <span className={styles.separator} />
        <select className={styles.fontSelect} onChange={handleFontSize} defaultValue="3" title="Tamanho da fonte">
          <option value="1">Pequeno</option>
          <option value="2">Normal-</option>
          <option value="3">Normal</option>
          <option value="4">Grande</option>
          <option value="5">Maior</option>
        </select>
      </div>
      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: value || '' }}
        onInput={handleInput}
        data-placeholder={placeholder || 'Descreva a tarefa...'}
      />
    </div>
  );
}
