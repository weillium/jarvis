declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void
  const env: {
    get(key: string): string | undefined
  }
}

declare module "npm:@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: { auth: { persistSession: boolean } }
  ): {
    from: (table: string) => {
      insert: (data: unknown | unknown[]) => {
        select: (columns?: string) => {
          single: () => Promise<{
            data: unknown
            error: { message: string; code?: string } | null
          }>
          then: (onfulfilled?: (value: any) => any) => Promise<any>
        }
      }
    }
    rpc: (name: string, params?: Record<string, unknown>) => Promise<{
      data: unknown
      error: { message: string } | null
    }>
  }
}

