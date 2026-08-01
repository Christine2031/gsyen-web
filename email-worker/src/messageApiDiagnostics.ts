export function resolveMailRequestId(request: Request): string {
  return (
    request.headers.get("x-mail-request-id")
    ?? request.headers.get("x-request-id")
    ?? request.headers.get("cf-ray")
  ) || crypto.randomUUID();
}

export function logMessageApiPhase(
  request: Request,
  stage: string,
  extra: Record<string, unknown> = {},
): void {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/v1/")) return;
  console.log(JSON.stringify({
    event: "mail_api_request_phase",
    requestId: resolveMailRequestId(request),
    path,
    stage,
    ...extra,
  }));
}
