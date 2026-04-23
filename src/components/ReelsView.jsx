import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ReelsView.module.css';

const STATUS_LABELS = { draft: 'Rascunho', ready: 'Pronto', recorded: 'Gravado' };
const STATUS_COLORS = { draft: '#9e9e9e', ready: '#2196f3', recorded: '#4caf50' };

export default function ReelsView({
  reels, addReel, approveReel, archiveReel, unarchiveReel, deleteReel, updateDescription,
  scripts, addScript, updateScript, archiveScript, unarchiveScript, deleteScript,
}) {
  const { user, isAdmin } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showStories, setShowStories] = useState(false);
  const [showScripts, setShowScripts] = useState(false);
  const [text, setText] = useState('');
  const [itemType, setItemType] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDescText, setEditDescText] = useState('');

  // Script form
  const [scriptForm, setScriptForm] = useState(false);
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptStore, setScriptStore] = useState('');
  const [scriptType, setScriptType] = useState('reel');
  const [scriptMusic, setScriptMusic] = useState('');
  const [scriptCallText, setScriptCallText] = useState('');
  const [scriptBody, setScriptBody] = useState('');
  const [scriptDialogues, setScriptDialogues] = useState('');
  const [scriptCamera, setScriptCamera] = useState('');
  const [scriptRefs, setScriptRefs] = useState('');
  const [editingScript, setEditingScript] = useState(null);
  const [expandedScript, setExpandedScript] = useState(null);

  const startEditDesc = (reel) => {
    setEditingId(reel.id);
    setEditDescText(reel.description || '');
  };

  const saveEditDesc = async (reelId) => {
    await updateDescription(reelId, editDescText);
    setEditingId(null);
    setEditDescText('');
  };

  const cancelEditDesc = () => {
    setEditingId(null);
    setEditDescText('');
  };

  const pending = reels.filter((r) => (r.status === 'pending' || !r.status) && (r.type || 'reel') === 'reel');
  const approved = reels.filter((r) => r.status === 'approved' && (r.type || 'reel') === 'reel');
  const archived = reels.filter((r) => r.status === 'archived');

  const archivedScripts = scripts.filter((s) => s.archived);

  const pendingStories = reels.filter((r) => (r.status === 'pending' || !r.status) && r.type === 'story');
  const approvedStories = reels.filter((r) => r.status === 'approved' && r.type === 'story');

  const formatDate = (ts) => {
    if (!ts?.seconds) return '';
    const d = new Date(ts.seconds * 1000);
    return d.toLocaleDateString('pt-BR');
  };

  const parseReelInput = (raw) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = [...raw.matchAll(urlRegex)];
    if (matches.length === 0) return [];
    const entries = [];
    for (let i = 0; i < matches.length; i++) {
      const link = matches[i][0];
      const start = matches[i].index + link.length;
      const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
      const description = raw.slice(start, end).replace(/^[\s\-–—:|]+/, '').trim();
      entries.push({ link, description });
    }
    return entries;
  };

  const parseStoryInput = (raw) => {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          const link = urlMatch[0];
          const description = line.replace(link, '').replace(/^[\s\-–—:|]+/, '').trim();
          return { link, description };
        }
        return { link: '', description: line };
      });
  };

  const getEntries = () => {
    if (!itemType || !text.trim()) return [];
    return itemType === 'reel' ? parseReelInput(text) : parseStoryInput(text);
  };

  const canSubmit = () => {
    if (!itemType || !text.trim()) return false;
    const entries = getEntries();
    if (entries.length === 0) return false;
    if (itemType === 'reel') return entries.every((e) => e.link);
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit()) return;
    const entries = getEntries();
    for (const { link, description } of entries) {
      await addReel(link, description, user, itemType);
    }
    setText('');
    setItemType(null);
    setShowForm(false);
  };

  const handleDelete = (reelId) => {
    if (window.confirm('Excluir este item?')) {
      deleteReel(reelId);
    }
  };

  // Script handlers
  const openScriptForm = (script) => {
    if (script) {
      setEditingScript(script);
      setScriptTitle(script.title);
      setScriptStore(script.store || '');
      setScriptType(script.type || 'reel');
      setScriptMusic(script.music || '');
      setScriptCallText(script.callText || '');
      setScriptBody(script.script || '');
      setScriptDialogues(script.dialogues || '');
      setScriptCamera(script.camera || '');
      setScriptRefs(script.references || '');
    } else {
      setEditingScript(null);
      setScriptTitle('');
      setScriptStore('');
      setScriptType('reel');
      setScriptMusic('');
      setScriptCallText('');
      setScriptBody('');
      setScriptDialogues('');
      setScriptCamera('');
      setScriptRefs('');
    }
    setScriptForm(true);
  };

  const closeScriptForm = () => {
    setScriptForm(false);
    setEditingScript(null);
    setScriptTitle('');
    setScriptStore('');
    setScriptType('reel');
    setScriptMusic('');
    setScriptCallText('');
    setScriptBody('');
    setScriptDialogues('');
    setScriptCamera('');
    setScriptRefs('');
  };

  const handleScriptSubmit = async (e) => {
    e.preventDefault();
    if (!scriptTitle.trim() || !scriptBody.trim() || !scriptStore) return;
    const data = {
      title: scriptTitle,
      store: scriptStore,
      type: scriptType,
      music: scriptMusic,
      callText: scriptCallText,
      script: scriptBody,
      dialogues: scriptDialogues,
      camera: scriptCamera,
      references: scriptRefs,
    };
    if (editingScript) {
      await updateScript(editingScript.id, {
        title: data.title.trim(),
        store: data.store,
        type: data.type,
        music: data.music.trim(),
        callText: data.callText.trim(),
        script: data.script.trim(),
        dialogues: data.dialogues.trim(),
        camera: data.camera.trim(),
        references: data.references.trim(),
      });
    } else {
      await addScript(data, user);
    }
    closeScriptForm();
  };

  const handleScriptDelete = async (id) => {
    if (window.confirm('Excluir este roteiro?')) {
      await deleteScript(id);
    }
  };

  const cycleScriptStatus = async (script) => {
    const order = ['draft', 'ready', 'recorded'];
    const idx = order.indexOf(script.status || 'draft');
    const next = order[(idx + 1) % order.length];
    await updateScript(script.id, { status: next });
  };

  const extractLinks = (text) => {
    const matches = text.match(/(https?:\/\/[^\s]+)/g);
    return matches || [];
  };

  const renderTable = (items) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Data</th>
            <th>Autor</th>
            <th>Link</th>
            <th>Descrição</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((reel) => (
            <tr key={reel.id}>
              <td className={styles.cellDate}>{formatDate(reel.createdAt)}</td>
              <td>{reel.authorName}</td>
              <td>
                {reel.link ? (
                  <a className={styles.link} href={reel.link} target="_blank" rel="noopener noreferrer">
                    {reel.link}
                  </a>
                ) : '—'}
              </td>
              <td className={styles.cellDesc}>
                {editingId === reel.id ? (
                  <textarea
                    className={styles.descEdit}
                    value={editDescText}
                    onChange={(e) => setEditDescText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditDesc(reel.id);
                      if (e.key === 'Escape') cancelEditDesc();
                    }}
                    rows={2}
                    autoFocus
                  />
                ) : (
                  <span
                    className={`${styles.descClickable} ${reel.descriptionEdited ? styles.descEdited : ''}`}
                    onClick={() => startEditDesc(reel)}
                    title="Clique para editar"
                  >
                    {reel.description || '—'}
                  </span>
                )}
              </td>
              <td>
                <div className={styles.cellActions}>
                  {editingId === reel.id ? (
                    <>
                      <button className={styles.saveBtn} onClick={() => saveEditDesc(reel.id)} title="Salvar">
                        Salvar
                      </button>
                      <button className={styles.archiveBtnSmall} onClick={cancelEditDesc} title="Cancelar">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button className={styles.archiveBtnSmall} onClick={() => archiveReel(reel.id)} title="Arquivar">
                      Arquivar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Archived sub-view
  if (showArchived) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>📱 Instagram — Arquivados</h2>
          <button className={styles.newBtn} onClick={() => setShowArchived(false)}>
            ← Voltar
          </button>
        </div>
        {archived.length === 0 && archivedScripts.length === 0 ? (
          <div className={styles.empty}>Nenhum item arquivado.</div>
        ) : (
          <>
            {archived.length > 0 && (
              <div className={styles.list}>
                {archived.map((reel) => (
                  <div key={reel.id} className={styles.card}>
                    <div className={styles.cardMain}>
                      <div className={styles.authorRow}>
                        {reel.authorPhoto && (
                          <img className={styles.authorAvatar} src={reel.authorPhoto} alt={reel.authorName} />
                        )}
                        <div className={styles.authorInfo}>
                          <span className={styles.authorName}>{reel.authorName}</span>
                          <span className={styles.date}>{formatDate(reel.createdAt)}</span>
                        </div>
                        <span className={reel.type === 'story' ? styles.typeBadgeStory : styles.typeBadgeReel}>
                          {reel.type === 'story' ? 'Story' : 'Reel'}
                        </span>
                      </div>
                      {reel.link && (
                        <a className={styles.link} href={reel.link} target="_blank" rel="noopener noreferrer">
                          {reel.link}
                        </a>
                      )}
                      {reel.description && <p className={styles.description}>{reel.description}</p>}
                    </div>
                    <div className={styles.cardActions}>
                      {isAdmin && (
                        <>
                          <button className={styles.unarchiveBtn} onClick={() => unarchiveReel(reel.id)} title="Restaurar">
                            ↩ Restaurar
                          </button>
                          <button className={styles.deleteBtn} onClick={() => handleDelete(reel.id)} title="Excluir">
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {archivedScripts.length > 0 && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Roteiros Arquivados ({archivedScripts.length})</h3>
                <div className={styles.list}>
                  {archivedScripts.map((s) => (
                    <div key={s.id} className={styles.card}>
                      <div className={styles.cardMain}>
                        <div className={styles.authorRow}>
                          <div className={styles.authorInfo}>
                            <span className={styles.authorName}>{s.title}</span>
                            <span className={styles.date}>{formatDate(s.createdAt)}</span>
                          </div>
                          <span className={s.type === 'story' ? styles.typeBadgeStory : styles.typeBadgeReel}>
                            {s.type === 'story' ? 'Story' : 'Reel'}
                          </span>
                        </div>
                        <p className={styles.description}>{s.authorName}</p>
                      </div>
                      <div className={styles.cardActions}>
                        {isAdmin && (
                          <>
                            <button className={styles.unarchiveBtn} onClick={() => unarchiveScript(s.id)} title="Restaurar">
                              ↩ Restaurar
                            </button>
                            <button className={styles.deleteBtn} onClick={() => handleScriptDelete(s.id)} title="Excluir">
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Stories sub-view
  if (showStories) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>📱 Stories</h2>
          <button className={styles.newBtn} onClick={() => setShowStories(false)}>
            ← Voltar
          </button>
        </div>
        {pendingStories.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Pendentes ({pendingStories.length})</h3>
            <div className={styles.pendingList}>
              {pendingStories.map((reel) => (
                <div key={reel.id} className={styles.pendingRow}>
                  <span className={styles.pendingDate}>{formatDate(reel.createdAt)}</span>
                  <span className={styles.pendingAuthor}>{reel.authorName}</span>
                  {reel.link && (
                    <a className={styles.pendingLink} href={reel.link} target="_blank" rel="noopener noreferrer">
                      {reel.link}
                    </a>
                  )}
                  {reel.description && <span className={styles.pendingDesc}>{reel.description}</span>}
                  <div className={styles.pendingActions}>
                    {isAdmin && (
                      <button className={styles.approveBtn} onClick={() => approveReel(reel.id)} title="Aprovar">
                        ✓
                      </button>
                    )}
                    <button className={styles.archiveBtn} onClick={() => archiveReel(reel.id)} title="Arquivar">
                      ✗
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Aprovados ({approvedStories.length})</h3>
          {approvedStories.length === 0 ? (
            <div className={styles.empty}>Nenhum story aprovado.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Link</th>
                    <th className={styles.thDesc}>Descrição</th>
                    <th className={styles.thActions}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedStories.map((reel) => (
                    <tr key={reel.id}>
                      <td>
                        {reel.link ? (
                          <a className={styles.link} href={reel.link} target="_blank" rel="noopener noreferrer">
                            {reel.link}
                          </a>
                        ) : '—'}
                      </td>
                      <td className={styles.cellDesc}>
                        {editingId === reel.id ? (
                          <textarea
                            className={styles.descEdit}
                            value={editDescText}
                            onChange={(e) => setEditDescText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditDesc(reel.id);
                              if (e.key === 'Escape') cancelEditDesc();
                            }}
                            rows={2}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={`${styles.descClickable} ${reel.descriptionEdited ? styles.descEdited : ''}`}
                            onClick={() => startEditDesc(reel)}
                            title="Clique para editar"
                          >
                            {reel.description || '—'}
                          </span>
                        )}
                      </td>
                      <td className={styles.cellActionsRight}>
                        {editingId === reel.id ? (
                          <div className={styles.cellActions}>
                            <button className={styles.saveBtn} onClick={() => saveEditDesc(reel.id)} title="Salvar">
                              Salvar
                            </button>
                            <button className={styles.archiveBtnSmall} onClick={cancelEditDesc} title="Cancelar">
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button className={styles.archiveBtnSmall} onClick={() => archiveReel(reel.id)} title="Arquivar">
                            Arquivar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Scripts sub-view
  if (showScripts) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>📱 Roteiros</h2>
          <div className={styles.headerActions}>
            <button className={styles.newBtn} onClick={() => setShowScripts(false)}>
              ← Voltar
            </button>
            {!scriptForm && (
              <button className={styles.newBtn} onClick={() => openScriptForm(null)}>
                + Novo Roteiro
              </button>
            )}
          </div>
        </div>

        {scriptForm && (
          <form className={styles.scriptForm} onSubmit={handleScriptSubmit}>
            <div className={styles.scriptRow}>
              <div className={styles.scriptSection} style={{ flex: 1 }}>
                <label className={styles.scriptLabel}>Nome do vídeo *</label>
                <span className={styles.scriptHint}>Ex: "Trena com mensagem", "Se fosse crime"</span>
                <input
                  className={styles.scriptInput}
                  type="text"
                  placeholder="Ex: Dado surpresa da noite"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.scriptSection} style={{ width: 130, flexShrink: 0 }}>
                <label className={styles.scriptLabel}>Loja *</label>
                <span className={styles.scriptHint}>&nbsp;</span>
                <select
                  className={styles.scriptSelect}
                  value={scriptStore}
                  onChange={(e) => setScriptStore(e.target.value)}
                  required
                >
                  <option value="" disabled>Selecione</option>
                  <option value="dame">Dame</option>
                  <option value="lov">Lov</option>
                </select>
              </div>
            </div>

            <div className={styles.scriptRow} style={{ alignItems: 'flex-end' }}>
              <div className={styles.scriptSection} style={{ width: 130, flexShrink: 0 }}>
                <label className={styles.scriptLabel}>Formato</label>
                <select
                  className={styles.scriptSelect}
                  value={scriptType}
                  onChange={(e) => setScriptType(e.target.value)}
                >
                  <option value="reel">Reel</option>
                  <option value="story">Story</option>
                </select>
              </div>
              <div className={styles.scriptSection} style={{ flex: 1 }}>
                <label className={styles.scriptLabel}>Música / Som</label>
                <input
                  className={styles.scriptInput}
                  type="text"
                  placeholder='Ex: Áudio "Se fosse crime" do reels'
                  value={scriptMusic}
                  onChange={(e) => setScriptMusic(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.scriptSection}>
              <label className={styles.scriptLabel}>Legenda / Chamada</label>
              <span className={styles.scriptHint}>O texto que aparece na legenda do post ou na tela do vídeo</span>
              <textarea
                className={styles.scriptTextareaSmall}
                placeholder='Ex: "Se amar pizza fosse crime"&#10;Ex: "Surpresa da noite: Par = 10% / Ímpar = Coquinha"'
                value={scriptCallText}
                onChange={(e) => setScriptCallText(e.target.value)}
                rows={3}
              />
            </div>

            <div className={styles.scriptSection}>
              <label className={styles.scriptLabel}>O que acontece no vídeo *</label>
              <span className={styles.scriptHint}>Descreva passo a passo o que deve ser gravado. Quem faz o quê, onde, como.</span>
              <textarea
                className={styles.scriptTextarea}
                placeholder={'Ex: Grava a mão escrita, segura o dado na outra mão.\nTroca de mão, estica o braço e vai andando pela pizzaria.\nCutuca a Cíntia no ombro, ela vira, abre a mão com o dado.\nEla joga na bancada. Mostra a palma da mão e grava a reação.'}
                value={scriptBody}
                onChange={(e) => setScriptBody(e.target.value)}
                rows={8}
                required
              />
            </div>

            <div className={styles.scriptSection}>
              <label className={styles.scriptLabel}>Falas / Diálogos</label>
              <span className={styles.scriptHint}>O que cada pessoa fala. Deixe em branco se ninguém fala.</span>
              <textarea
                className={styles.scriptTextareaSmall}
                placeholder={'Ex:\n- E aí Leandro, qual tua pizza preferida?\n- (resposta)\n- E tu Fabi?\n- (resposta)\n- E vcs, oq acham??'}
                value={scriptDialogues}
                onChange={(e) => setScriptDialogues(e.target.value)}
                rows={5}
              />
            </div>

            <div className={styles.scriptSection}>
              <label className={styles.scriptLabel}>Câmera / Ângulo</label>
              <span className={styles.scriptHint}>Dicas de como filmar: ângulo, cortes, posição.</span>
              <textarea
                className={styles.scriptTextareaSmall}
                placeholder={'Ex: Sem corte, braço esticado com câmera fixa.\nOu: Mãos pra cima virando, corta pra imagens em sequência.'}
                value={scriptCamera}
                onChange={(e) => setScriptCamera(e.target.value)}
                rows={3}
              />
            </div>

            <div className={styles.scriptSection}>
              <label className={styles.scriptLabel}>Links de referência</label>
              <span className={styles.scriptHint}>Reels ou vídeos de exemplo que inspiraram essa ideia</span>
              <textarea
                className={styles.scriptTextareaSmall}
                placeholder="Cole links de reels de exemplo, um por linha"
                value={scriptRefs}
                onChange={(e) => setScriptRefs(e.target.value)}
                rows={2}
              />
            </div>

            <div className={styles.formFooter}>
              <button type="button" className={styles.archivedBtn} onClick={closeScriptForm}>
                Cancelar
              </button>
              <button type="submit" className={styles.submitBtn} disabled={!scriptTitle.trim() || !scriptStore || !scriptBody.trim()}>
                {editingScript ? 'Salvar' : 'Criar Roteiro'}
              </button>
            </div>
          </form>
        )}

        {scripts.filter((s) => !s.archived).length === 0 && !scriptForm ? (
          <div className={styles.empty}>Nenhum roteiro criado.</div>
        ) : (
          <div className={styles.scriptList}>
            {scripts.filter((s) => !s.archived).map((s) => {
              const links = extractLinks(s.script);
              const isExpanded = expandedScript === s.id;
              return (
                <div key={s.id} className={styles.scriptCard}>
                  <div className={styles.scriptHeader} onClick={() => setExpandedScript(isExpanded ? null : s.id)}>
                    <div className={styles.scriptMeta}>
                      <span className={s.type === 'story' ? styles.typeBadgeStory : styles.typeBadgeReel}>
                        {s.type === 'story' ? 'Story' : 'Reel'}
                      </span>
                      {s.store && <span className={styles.storeBadge}>{s.store === 'lov' ? 'Lov' : 'Dame'}</span>}
                      <span className={styles.scriptTitleText}>{s.title}</span>
                      {s.music && <span className={styles.scriptMusicTag}>{s.music}</span>}
                    </div>
                    <div className={styles.scriptMetaRight}>
                      <button
                        className={styles.statusBadge}
                        style={{ background: STATUS_COLORS[s.status || 'draft'] }}
                        onClick={(e) => { e.stopPropagation(); isAdmin && cycleScriptStatus(s); }}
                        title={isAdmin ? 'Clique para avançar status' : ''}
                      >
                        {STATUS_LABELS[s.status || 'draft']}
                      </button>
                      <span className={styles.scriptDateSmall}>{formatDate(s.createdAt)}</span>
                      <span className={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.scriptBody}>
                      {s.callText && (
                        <div className={styles.scriptBlock}>
                          <span className={styles.scriptBlockLabel}>Legenda / Chamada</span>
                          <pre className={styles.scriptPre}>{s.callText}</pre>
                        </div>
                      )}
                      <div className={styles.scriptBlock}>
                        <span className={styles.scriptBlockLabel}>O que acontece</span>
                        <pre className={styles.scriptPre}>{s.script}</pre>
                      </div>
                      {s.dialogues && (
                        <div className={styles.scriptBlock}>
                          <span className={styles.scriptBlockLabel}>Falas</span>
                          <pre className={styles.scriptPre}>{s.dialogues}</pre>
                        </div>
                      )}
                      {s.camera && (
                        <div className={styles.scriptBlock}>
                          <span className={styles.scriptBlockLabel}>Câmera / Ângulo</span>
                          <pre className={styles.scriptPre}>{s.camera}</pre>
                        </div>
                      )}
                      {s.references && (
                        <div className={styles.scriptBlock}>
                          <span className={styles.scriptBlockLabel}>Referências</span>
                          <pre className={styles.scriptPre}>{s.references}</pre>
                          {extractLinks(s.references).length > 0 && (
                            <div className={styles.scriptLinks}>
                              {extractLinks(s.references).map((l, i) => (
                                <a key={`ref-${i}`} className={styles.link} href={l} target="_blank" rel="noopener noreferrer">
                                  {l}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div className={styles.scriptFooter}>
                        <span className={styles.scriptAuthor}>{s.authorName}</span>
                        <div className={styles.cellActions}>
                          <button className={styles.saveBtn} onClick={() => openScriptForm(s)}>
                            Editar
                          </button>
                          <button className={styles.archiveBtnSmall} onClick={() => archiveScript(s.id)}>
                            Arquivar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Main view
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>📱 Instagram</h2>
        <div className={styles.headerActions}>
          <button className={styles.reelsBtn}>
            Reels ({pending.length + approved.length})
          </button>
          <button className={styles.storyBtn} onClick={() => setShowStories(true)}>
            Stories ({approvedStories.length + pendingStories.length})
          </button>
          <button className={styles.scriptBtn} onClick={() => setShowScripts(true)}>
            Roteiros ({scripts.filter((s) => !s.archived).length})
          </button>
          <button className={styles.archivedBtn} onClick={() => setShowArchived(true)}>
            Arquivados ({archived.length + archivedScripts.length})
          </button>
          <button className={styles.newBtn} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancelar' : '+ Novo'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            className={styles.titleInput}
            placeholder={itemType === 'story'
              ? 'Um story por linha (link e/ou texto)...'
              : 'Cole links dos reels (um por linha, descrição opcional após \'-\')...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className={styles.formFooter}>
            <label className={styles.checkOption}>
              <input
                type="checkbox"
                checked={itemType === 'reel'}
                onChange={() => setItemType(itemType === 'reel' ? null : 'reel')}
              />
              Reel
            </label>
            <label className={styles.checkOption}>
              <input
                type="checkbox"
                checked={itemType === 'story'}
                onChange={() => setItemType(itemType === 'story' ? null : 'story')}
              />
              Story
            </label>
            <button type="submit" className={styles.submitBtn} disabled={!canSubmit()}>
              Enviar ({getEntries().length})
            </button>
          </div>
        </form>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Pendentes ({pending.length})</h3>
        {pending.length === 0 ? (
          <div className={styles.empty}>Nenhum reel pendente.</div>
        ) : (
          <div className={styles.pendingList}>
            {pending.map((reel) => (
              <div key={reel.id} className={styles.pendingRow}>
                <span className={styles.pendingDate}>{formatDate(reel.createdAt)}</span>
                <span className={styles.pendingAuthor}>{reel.authorName}</span>
                {reel.link && (
                  <a className={styles.pendingLink} href={reel.link} target="_blank" rel="noopener noreferrer">
                    {reel.link}
                  </a>
                )}
                {reel.description && <span className={styles.pendingDesc}>{reel.description}</span>}
                <div className={styles.pendingActions}>
                  {isAdmin && (
                    <button className={styles.approveBtn} onClick={() => approveReel(reel.id)} title="Aprovar">
                      ✓
                    </button>
                  )}
                  <button className={styles.archiveBtn} onClick={() => archiveReel(reel.id)} title="Arquivar">
                    ✗
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Aprovados ({approved.length})</h3>
        {approved.length === 0 ? (
          <div className={styles.empty}>Nenhum reel aprovado.</div>
        ) : (
          renderTable(approved)
        )}
      </div>
    </div>
  );
}
