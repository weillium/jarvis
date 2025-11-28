import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Lazy-load Supabase client to avoid initialization errors blocking app startup
let supabaseClient: SupabaseClient | null = null;

function getSupabaseConfig() {
  // Get Supabase URL and anon key from environment variables
  // Priority: Constants.expoConfig.extra (from app.config.js) > process.env (for development)
  // Use try-catch to safely access Constants in case it's not ready yet
  let supabaseUrl: string | undefined;
  let supabaseAnonKey: string | undefined;
  
  try {
    const extra = Constants.expoConfig?.extra;
    supabaseUrl = 
      extra?.supabaseUrl || 
      extra?.EXPO_PUBLIC_SUPABASE_URL ||
      process.env.EXPO_PUBLIC_SUPABASE_URL;

    supabaseAnonKey = 
      extra?.supabaseAnonKey || 
      extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  } catch (e) {
    // Fallback to process.env if Constants access fails
    supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  }

  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Get or create the Supabase client.
 * Lazy initialization prevents module-level errors from blocking app startup.
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

  // Don't throw during initialization - log warning instead
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[Supabase] Missing environment variables. Please check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local'
    );
    console.error('[Supabase] Current values:', {
      supabaseUrl: supabaseUrl || 'MISSING',
      supabaseAnonKey: supabaseAnonKey ? '***' : 'MISSING',
      extra: Constants.expoConfig?.extra,
    });
  }

  // Validate URL format
  if (supabaseUrl) {
    try {
      new URL(supabaseUrl);
    } catch (urlError) {
      console.error(
        '[Supabase] Invalid Supabase URL format. EXPO_PUBLIC_SUPABASE_URL must be a valid URL.'
      );
    }
  }

  // Create client with fallback values if needed
  supabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }
  );

  return supabaseClient;
}

// Note: All code should use getSupabaseClient() instead of importing supabase directly
// This ensures lazy initialization and prevents module-level errors

