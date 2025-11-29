import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Missing Supabase environment variables");
}

// @ts-ignore
export const supabase = createClient(
    supabaseUrl || "",
    supabaseAnonKey || "",
    {
        auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    },
) as any;
