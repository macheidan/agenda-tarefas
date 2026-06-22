import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uaeqvecqlkjqffwbtqsm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oKSOuf0sm7Y505CjUdeCQw_VtV2S5KG';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
