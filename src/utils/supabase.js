import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uaeqvecqlkjqffwbtqsm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZXF2ZWNxbGtqcWZmd2J0cXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTU2NTIsImV4cCI6MjA5NzY3MTY1Mn0.dNp_jo88vU0CQxGhzMYR3acc5tuNf8wLYnRvMx7eugE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
