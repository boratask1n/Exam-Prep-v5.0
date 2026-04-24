function isDesktopShell() {
  return (
    typeof window !== "undefined" &&
    typeof window.examPrepDesktop !== "undefined"
  );
}

export function isAllowedApiRequest(url: string) {
  if (url.startsWith("/api")) return true;

  try {
    const target = new URL(url, window.location.origin);
    if (!target.pathname.startsWith("/api")) return false;
    if (target.origin === window.location.origin) return true;

    return [
      "examduck.mooo.com",
      "examduck.duckdns.org",
      "localhost",
      "127.0.0.1",
    ].includes(target.hostname);
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function fromBase64(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function buildSerializableBody(body: BodyInit | null | undefined) {
  if (body == null) return {};
  if (typeof body === "string") return { bodyText: body };
  if (body instanceof URLSearchParams) return { bodyText: body.toString() };
  if (body instanceof ArrayBuffer) {
    return { bodyBase64: toBase64(new Uint8Array(body)) };
  }
  if (ArrayBuffer.isView(body)) {
    return {
      bodyBase64: toBase64(
        new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      ),
    };
  }

  return null;
}

export async function desktopBridgeFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  nativeFetch: typeof window.fetch = window.fetch.bind(window),
) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (!isDesktopShell() || !isAllowedApiRequest(url)) {
    return nativeFetch(input, init);
  }

  const baseHeaders =
    typeof input !== "string" && !(input instanceof URL)
      ? input.headers
      : undefined;
  const headers = new Headers(init.headers ?? baseHeaders);
  const bodySource = init.body;
  const serializedBody = await buildSerializableBody(bodySource);

  if (serializedBody === null) {
    return nativeFetch(input, init);
  }

  const response = await window.examPrepDesktop!.requestApi({
    url,
    method:
      init.method ??
      (typeof input !== "string" && !(input instanceof URL)
        ? input.method
        : undefined) ??
      "GET",
    headers: Object.fromEntries(headers.entries()),
    ...serializedBody,
  });

  const body = response.bodyBase64 ? fromBase64(response.bodyBase64) : undefined;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
