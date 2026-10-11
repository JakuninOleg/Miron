export class DomainError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function domainResponse(error: unknown) {
  if (error instanceof DomainError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  if (error instanceof Error && "status" in error && typeof error.status === "number")
    return Response.json(
      { error: { code: "AUTH_REQUIRED", message: error.message } },
      { status: error.status },
    );
  if (error instanceof Error && error.name === "ZodError")
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Проверьте введённые данные." } },
      { status: 400 },
    );
  console.error("Domain request failed", error instanceof Error ? error.name : "unknown");
  return Response.json(
    {
      error: { code: "SERVICE_UNAVAILABLE", message: "Не удалось сохранить. Попробуйте ещё раз." },
    },
    { status: 503 },
  );
}

export function privateDomainResponse(error: unknown) {
  const response = domainResponse(error);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
