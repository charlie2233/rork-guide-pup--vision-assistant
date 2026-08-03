declare namespace Cloudflare {
  interface Env {
    AI_GATEWAY_API_KEY?: string;
    AI_GATEWAY_FALLBACK_API_KEY?: string;
    HUGGINGFACE_MINICPM_O_API_KEY?: string;
    SENTRY_DSN?: string;
  }

  interface StagingEnv {
    AI_GATEWAY_API_KEY?: string;
    AI_GATEWAY_FALLBACK_API_KEY?: string;
    HUGGINGFACE_MINICPM_O_API_KEY?: string;
    SENTRY_DSN?: string;
  }

  interface ProductionEnv {
    AI_GATEWAY_API_KEY?: string;
    AI_GATEWAY_FALLBACK_API_KEY?: string;
    HUGGINGFACE_MINICPM_O_API_KEY?: string;
    SENTRY_DSN?: string;
  }
}
