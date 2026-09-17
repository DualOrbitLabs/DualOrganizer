import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL)
  || (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL)
  || '';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY)
  || (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY)
  || '';

export const supabaseConfigError = !supabaseUrl || !supabaseAnonKey
  ? 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.'
  : null;

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

export async function getAuthenticatedUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCurrentProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  window.location.href = 'login.html';
}