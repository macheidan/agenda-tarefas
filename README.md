# Agenda de Tarefas
> **2nd Brain Vault:** `G:\Meu Drive\01 AI\Vault\` | Contexto master: `00-meta/AGENT-START-HERE.md` | GitHub: github.com/macheidan/2ndbrain

Aplicativo de gerenciamento de tarefas com visualização em calendário e kanban, autenticação via Google e sincronização em tempo real com Firebase.

## Stack

- **React + Vite** — Frontend
- **Firebase Auth** — Login com Google
- **Cloud Firestore** — Banco de dados em tempo real
- **FullCalendar** — Visualização mensal
- **@hello-pangea/dnd** — Drag and drop no Kanban

## Setup do Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com) e crie um novo projeto
2. Ative **Authentication** → método **Google**
3. Crie um banco **Cloud Firestore** (modo de teste ou aplique as regras de `firestore.rules`)
4. Em **Configurações do projeto**, copie as credenciais do app web

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (use `.env.example` como referência):

```env
VITE_FIREBASE_API_KEY=sua_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_ADMIN_EMAIL=admin@example.com
```

O email definido em `VITE_ADMIN_EMAIL` terá permissão de visualizar e editar a agenda de qualquer usuário.

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

## Deploy (GitHub Pages)

```bash
npm run deploy
```

Isso executa `vite build` e publica a pasta `dist` via `gh-pages`.

## Estrutura Firestore

```
users/{uid}
  ├── email
  ├── displayName
  └── photoURL

tasks/{uid}/items/{taskId}
  ├── title
  ├── date
  ├── endDate
  ├── recurrence
  ├── recurrenceGroup
  ├── status
  ├── comments[]
  ├── createdAt
  └── createdBy
```

## Regras Firestore

O arquivo `firestore.rules` contém regras que permitem que cada usuário acesse apenas seus próprios dados, com exceção do admin que pode acessar dados de qualquer usuário. Substitua `ADMIN_EMAIL_PLACEHOLDER` pelo email do admin antes de publicar as regras.
