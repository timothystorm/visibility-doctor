// ─── Configuration types ──────────────────────────────────────────────────────

export type EnvConfig = {
  /** Display name, e.g. "Production" */
  name: string;
  /** ForgeRock login page URL — where the browser navigates to authenticate */
  loginUrl: string;
  /** Root app URL used for health checks after login (may be a different path/domain) */
  baseUrl: string;
  /** GraphQL endpoint, e.g. https://api.fedex.com/graphql */
  graphqlEndpoint: string;
  /** MFE route paths to check, e.g. ['/visibility', '/monitor', '/overview'] */
  mfeRoutes: string[];
  /**
   * One or more cookie names that signal a completed login.
   * The poll loop watches for ALL of these to be present and non-empty, then
   * captures ALL cookies from the session (not just these).
   * Pick 1–2 session cookies that only appear after a successful ForgeRock login.
   */
  cookieNames: string[];
  /** Optional: Traefik health/ping URL */
  traefikHealthUrl?: string;
  /** Optional: Kubernetes namespace to check pod health in */
  aksNamespace?: string;
};

export type DynatraceConfig = {
  apiToken: string;
  baseUrl: string;
  /** Dynatrace entity selector for the service, e.g. "type(SERVICE),tag(visibility)" */
  entitySelector: string;
};

export type Config = {
  envs: Record<string, EnvConfig>;
  defaultEnv?: string;
  dynatrace?: DynatraceConfig;
};
