interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_STORAGE_BUCKET?: string;
  readonly VITE_SUPABASE_EMAIL_FUNCTION?: string;
  readonly VITE_SUPABASE_CALENDAR_SYNC_FUNCTION?: string;
  readonly VITE_SUPABASE_USER_ADMIN_FUNCTION?: string;
  readonly VITE_EMAIL_WEBHOOK_URL?: string;
  readonly VITE_ALLOW_PUBLIC_SIGNUP?: string;
  readonly VITE_ADMIN_EMAILS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
