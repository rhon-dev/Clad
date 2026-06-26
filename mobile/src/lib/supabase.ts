import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://trdacrdlzbxnozrnpnpz.supabase.co';
// This is the anon/public key — safe to embed in client (RLS enforces security)
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyZGFjcmRsemJ4bm96cm5wbnB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODEyNDAsImV4cCI6MjA5ODA1NzI0MH0.Q5WnBdJ_N27Bpy5Agy4a_z_PMYh27HsBZt3pipao8Bg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});
