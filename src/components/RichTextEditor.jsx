import { useRef, useCallback, useState, useEffect } from 'react';
import styles from '../styles/RichTextEditor.module.css';

export default function RichTextEditor({ value, onChange, placeholder, resizable }) {
  const editorRef = useRef(null);
  const internalValue = useRef(value || '');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);

  // Only set innerHTML when value changes externally (not from user input)
  useEffect(() => {
    if (editorRef.current && value !== internalValue.current) {
      internalValue.current = value || '';
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = useCallback((command, val = null) => {
    document.execCommand(command, false, val);
    if (editorRef.current && onChange) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  }, [onChange]);

  const handleInput = () => {
    if (editorRef.current && onChange) {
      internalValue.current = editorRef.current.innerHTML;
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

  const handleHeading = (e) => {
    const val = e.target.value;
    if (val === 'p') {
      exec('formatBlock', 'p');
    } else {
      exec('formatBlock', val);
    }
  };

  const COLORS = ['#1a1a1a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#2563eb', '#8b5cf6', '#888888'];

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <select className={styles.headingSelect} onChange={handleHeading} defaultValue="p" title="Formato">
          <option value="p">Normal</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>
        <span className={styles.separator} />
        <button type="button" className={styles.toolBtn} onClick={() => exec('bold')} title="Negrito">
          <strong>B</strong>
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('italic')} title="Itálico">
          <em>I</em>
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('underline')} title="Sublinhado">
          <u>U</u>
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('strikeThrough')} title="Riscado">
          <s>S</s>
        </button>
        <span className={styles.separator} />
        <div className={styles.colorPickerWrapper}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => { setShowColorPicker(!showColorPicker); setShowHighlightPicker(false); }}
            title="Cor do texto"
          >
            <span style={{ borderBottom: '3px solid #ef4444', lineHeight: 1 }}>A</span>
          </button>
          {showColorPicker && (
            <div className={styles.colorDropdown}>
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={styles.colorSwatch}
                  style={{ background: color }}
                  onClick={() => { exec('foreColor', color); setShowColorPicker(false); }}
                />
              ))}
            </div>
          )}
        </div>
        <div className={styles.colorPickerWrapper}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => { setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false); }}
            title="Cor de destaque"
          >
            <span style={{ background: '#fef08a', padding: '0 3px', lineHeight: 1 }}>A</span>
          </button>
          {showHighlightPicker && (
            <div className={styles.colorDropdown}>
              <button
                className={styles.colorSwatch}
                style={{ background: '#fff', border: '2px solid #ddd' }}
                onClick={() => { exec('hiliteColor', 'transparent'); setShowHighlightPicker(false); }}
                title="Sem destaque"
              />
              {['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa'].map((color) => (
                <button
                  key={color}
                  className={styles.colorSwatch}
                  style={{ background: color }}
                  onClick={() => { exec('hiliteColor', color); setShowHighlightPicker(false); }}
                />
              ))}
            </div>
          )}
        </div>
        <span className={styles.separator} />
        <button type="button" className={styles.toolBtn} onClick={() => exec('justifyLeft')} title="Alinhar à esquerda">
          ≡
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('justifyCenter')} title="Centralizar">
          ≡
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('justifyRight')} title="Alinhar à direita">
          ≡
        </button>
        <span className={styles.separator} />
        <button type="button" className={styles.toolBtn} onClick={() => exec('insertUnorderedList')} title="Lista com marcadores">
          •≡
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('insertOrderedList')} title="Lista numerada">
          1.
        </button>
        <span className={styles.separator} />
        <button type="button" className={styles.toolBtn} onClick={handleLink} title="Link">
          🔗
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('insertHorizontalRule')} title="Linha horizontal">
          ―
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('removeFormat')} title="Limpar formatação">
          ✕
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
        className={`${styles.editor} ${resizable ? styles.resizable : ''}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onClick={() => { setShowColorPicker(false); setShowHighlightPicker(false); }}
        data-placeholder={placeholder || 'Descreva a tarefa...'}
      />
    </div>
  );
}
