import type { ApiError } from "@/shared/contracts";

export class BuilderRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export async function builderRequest<T>(
  path: string,
  options?: RequestInit,
  ownerId?: string,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options?.signal?.aborted) abort();
  else options?.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`/api/workout-builder${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(ownerId ? { "x-miron-owner": ownerId } : {}),
        ...options?.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiError | null;
      throw new BuilderRequestError(
        body?.error?.message ?? "Нет связи с сервером. Попробуй ещё раз.",
        response.status,
        body?.error?.code ?? "REQUEST_FAILED",
      );
    }
    return (await response.json()) as T;
  } catch (cause) {
    if (cause instanceof BuilderRequestError) throw cause;
    throw new BuilderRequestError(
      "Нет связи с сервером. Подключись к интернету и повтори действие.",
      0,
      "NETWORK_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", abort);
  }
}
