import {createClient} from '@supabase/supabase-js';
import {supabaseUrl, supabasePublishableKey} from './config.js';

// The official SDK persists and refreshes the Supabase session on this browser.
// Access tokens never enter app data, logs, URLs we construct, or our source.
export const client = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:true},
});
export {supabaseUrl, supabasePublishableKey};
