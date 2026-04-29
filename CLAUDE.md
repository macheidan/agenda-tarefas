# CLAUDE.md

> **2nd Brain Vault:** `G:\Meu Drive AI\Vault\` | Contexto master: `00-meta/AGENT-START-HERE.md` | GitHub: github.com/macheidan/2ndbrain

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # production build to dist/
npm run lint      # ESLint
npm run deploy    # legado: publica dist/ no gh-pages (não usar — produção é Vercel)
```

**Produção:** https://agenda-tarefas-eight.vercel.app/ — deploy automático via Vercel quando a branch padrão recebe commits. Após mudanças em UI, **mergear o PR direto** (sem pedir confirmação — usuário autorizou) pra atualizar produção. PR preview do Vercel sai automaticamente em cada push da branch. **Não** rodar `npm run deploy` (gh-pages está deprecado).

## Environment

Precisa de `.env` na raiz com credenciais Firebase (`VITE_FIREBASE_*`) e `VITE_ADMIN_EMAIL`. Ver `README.md` para lista completa. O email em `VITE_ADMIN_EMAIL` também está hard-coded em `firestore.rules` (substituir `ADMIN_EMAIL_PLACEHOLDER` antes de publicar regras).

## Arquitetura

**Stack:** React 19 + Vite + Firebase (Auth Google + Firestore em tempo real). Sem router — a navegação é por estado (`activeTab` em `Dashboard.jsx`).

**Fluxo auth/data:**
```
AuthProvider (contexts/AuthContext.jsx)
  └─ onAuthStateChanged → user, isAdmin (email === VITE_ADMIN_EMAIL)
  └─ auto-cria users/{uid} no primeiro login
       ↓
App.jsx: se user, renderiza Dashboard; senão, Login
       ↓
Dashboard.jsx decide o tab ativo e instancia hooks (useTasks, useIdeas, useReels…)
       ↓
Cada hook faz onSnapshot numa coleção do Firestore e devolve dados + mutations
       ↓
Views (CalendarView, ReelsView, NotesView…) consomem hook e emitem mutations
```

Não tem backend próprio — toda lógica de permissão está em `firestore.rules` + checagem no cliente (`isAdmin`).

## Coleções Firestore (big picture)

Hooks em `src/hooks/` são a fonte da verdade sobre shape dos documentos. Coleções principais:

- `users/{uid}` — perfil básico, criado no primeiro login
- `tasks/{uid}/items/{taskId}` — **subcoleção por usuário** (único caso); tarefas com status, recorrência, comentários inline
- `notes/{noteId}`, `ideas/{ideaId}`, `reviews/{reviewId}`, `reels/{reelId}`, `scripts/{scriptId}` — coleções flat com `authorUid`/`targetUid`
- `chats/{roomId}/messages/{msgId}` — 1 room por usuário não-admin; admin ouve todos
- `adminMessages/{msgId}` — broadcast com `targetUids[]`, `readBy[]`
- `settings/{uid}` — toggles de features por usuário (admin escreve)
- `knowledge/{docId}` — base de conhecimento + persona para o chat Gemini

## Padrões não-óbvios (ler antes de mexer)

**1. Hooks variam escopo por admin/usuário comum.** Ex: `useIdeas(null, user, true)` traz ideias de todo mundo quando `fetchAll=true`; com `targetUid` específico, filtra. Admin quase sempre vê tudo. Ao adicionar feature nova, decida explicitamente: vale só pro dono, pro admin também, ou pra todos?

**2. Admin "viewing as" outro usuário.** `Dashboard` tem `selectedUid` (dropdown no Header) que faz admin navegar os dados de qualquer user. `viewingOther` banner sinaliza. Ao criar nova view, passe `selectedUid || user.uid` como alvo.

**3. Unread tracking via `readBy[]`.** Ideias, reviews, notes, chat, adminMessages usam array de UIDs em `readBy`. Contar unread = docs onde `user.uid` NÃO está em `readBy`. Marcar lido = `arrayUnion(user.uid)` em `readBy`. Segue esse padrão ao adicionar feature colaborativa.

**4. Comentários são arrays aninhados, não subcoleção.** Ideias/reviews/tasks guardam comentários como `comments: [{ text, authorUid, authorName, authorPhoto, createdAt, parentIndex }]`. Threading é via `parentIndex` (índice do pai no array). Cuidado com updates concorrentes (sem transação).

**5. Recorrência de tasks.** Tasks recorrentes são **múltiplos docs** com o mesmo `recurrenceGroup` (UUID). Editar "todas as ocorrências" = `updateTaskGroup(recurrenceGroup, updates)` em `useTasks`.

**6. Fallbacks de query sem índice.** Vários hooks têm catch do `FirebaseError` por índice composto faltando — refazem a query sem `orderBy` e ordenam client-side. Ao adicionar query nova com múltiplos `where`+`orderBy`, considere o mesmo fallback ou publique o índice.

**7. CSS modules + tema global.** Cada view tem `*.module.css` com classes scopeadas. Cores, sombras, bordas vêm de CSS vars em `src/styles/global.css` (tem 3 temas: Notion default, `[data-theme="dark"]`, `[data-theme="clean"]`). **Nunca hard-code cores** — use as vars (`var(--accent)`, `var(--text)`, etc.). A exceção são cores específicas de categorias (laranja #ff9800 pra Stories, roxo #9c27b0 pra Roteiros) que aparecem direto em classes.

**8. ReelsView tem 4 sub-seções no mesmo componente.** Reels / Stories / Roteiros / Arquivados são seções do Instagram controladas por booleanos (`showStories`, `showScripts`, `showArchived`). Cada sub-view retorna cedo (`if (showStories) return …`). Compartilham um `sectionHeader` JSX com tabs coloridas e botão **+ Novo** que adota a cor da seção ativa.

**9. Gemini no KnowledgeView.** Admin edita base de conhecimento + persona em Settings. O chat monta o system prompt concatenando persona e base. Modelo escolhido via dropdown no Settings.

**10. Sem router.** Navegação entre tabs é puro `useState`. Não usar URLs para links profundos a menos que adicione react-router explicitamente.

## Convenções de código

- Português nas mensagens de UI e commits; inglês no código (nomes de vars, funções).
- Commits seguem `feat:`/`fix:`/`refactor:`/`chore:`/`docs:` (Conventional Commits, mas livre).
- Hooks exportam objetos com dados + funções (`{ tasks, addTask, updateTask, deleteTask }`).
- Modais são componentes separados (`TaskModal`, `NoteModal`, `AdminMessageModal`) que recebem `open`, `onClose`, e os dados necessários.
