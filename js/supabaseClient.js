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

export async function reloadCache(){
  getCurrentProfile(getAuthenticatedUser());
} 

export async function getAuthenticatedUser() {
  const cachedUser = UncacheUser();
  if(!cachedUser){
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    CacheUser(data.user);
    return data.user;
  } else {
    return cachedUser;
  }
}

export async function getCurrentProfile(userId) {
  const cachedProfile = UncacheProfile();
  if(cachedProfile == null){
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    CacheProfile(data);
    return data;
  } else {
    return cachedProfile;
  }
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  ClearAllCache();
  window.location.href = 'login.html';
}



function CacheUser(user){
  sessionStorage.setItem("userData", JSON.stringify(user));
}

function UncacheUser(){
  return JSON.parse(sessionStorage.getItem("userData"));
}

function CacheProfile(profile){
  sessionStorage.setItem("userProfile", JSON.stringify(profile));
}

function UncacheProfile(){
  return JSON.parse(sessionStorage.getItem("userProfile"));
}

function ClearAllCache(){
  sessionStorage.clear();
  localStorage.clear();
}