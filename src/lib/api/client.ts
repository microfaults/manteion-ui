import { z } from "zod";

const DEFAULT_BASE = "http://localhost:9090";

export interface ApiClientOptions {
  baseUrl?: string;
  environment?: string;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = "ApiError";
  }
}

/** Typed fetch wrapper. Validates JSON responses through a Zod schema at the boundary. */
export class ApiClient {
  readonly baseUrl: string;
  readonly environment: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? import.meta.env?.VITE_MANTEION_URL ?? DEFAULT_BASE;
    this.environment = opts.environment ?? import.meta.env?.VITE_DEFAULT_ENV ?? "online-boutique";
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private headers(extra: HeadersInit = {}): HeadersInit {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Faults-Lab-Environment": this.environment,
      ...extra,
    };
  }

  async request<S extends z.ZodTypeAny>(
    method: string,
    path: string,
    body: unknown,
    schema: S,
  ): Promise<z.infer<S>> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const init: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchImpl(url, init);
    const text = await res.text();
    const json: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      throw new ApiError(res.status, url, json, extractErr(json, res.statusText));
    }
    if (res.status === 204 || json === undefined) {
      return schema.parse(null as unknown);
    }
    return schema.parse(json);
  }

  get<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
    return this.request("GET", path, undefined, schema);
  }
  post<S extends z.ZodTypeAny>(path: string, body: unknown, schema: S): Promise<z.infer<S>> {
    return this.request("POST", path, body, schema);
  }
  put<S extends z.ZodTypeAny>(path: string, body: unknown, schema: S): Promise<z.infer<S>> {
    return this.request("PUT", path, body, schema);
  }
  del(path: string): Promise<unknown> {
    return this.request("DELETE", path, undefined, z.unknown());
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function extractErr(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
  }
  return fallback;
}

/** Module-level singleton. Swap out in tests via `ApiClient` construction directly. */
export const apiClient = new ApiClient();
