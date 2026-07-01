import { createClient } from '@supabase/supabase-js';
import { auth } from '../firebase';

const SUPABASE_URL = 'https://uaeqvecqlkjqffwbtqsm.supabase.co';
// Chave anon (pública). Sozinha não dá mais acesso: com RLS ligado, só requisições
// com o token do usuário logado (Firebase) passam. Ela vai só como apikey header.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZXF2ZWNxbGtqcWZmd2J0cXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTU2NTIsImV4cCI6MjA5NzY3MTY1Mn0.dNp_jo88vU0CQxGhzMYR3acc5tuNf8wLYnRvMx7eugE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // Envia o ID token do Firebase como Authorization do Supabase. Com o Firebase
  // configurado como Third-Party Auth no Supabase, o banco valida esse token e
  // trata a requisição como usuário 'authenticated' — aí as policies RLS liberam.
  // Sem usuário logado, retorna null e a requisição fica como 'anon' (bloqueada).
  accessToken: async () => {
    const user = auth.currentUser;
    return user ? await user.getIdToken() : null;
  },
});
