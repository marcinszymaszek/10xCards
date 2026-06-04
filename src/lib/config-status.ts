import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

// Must be a function, not a module-level constant — astro:env/server reads from
// the Cloudflare Workers env binding which is only available during request handling.
export function getMissingConfigs(): ConfigStatus[] {
  const statuses: ConfigStatus[] = [
    {
      name: "Supabase",
      configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
      message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
      docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
      docsLabel: "Zobacz instrukcję konfiguracji",
    },
  ];
  return statuses.filter((s) => !s.configured);
}
