// Share URLs (P4 prefix, pulled forward): the CONTRACT travels in the URL
// fragment — deflated + base64url, no server, no storage. Opening the link
// re-validates and re-bakes locally through the same wasm core (D17), so a
// shared model is judged on arrival, never trusted.

async function pump(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeShareFragment(contractJson: string): Promise<string> {
  const input = new Blob([new TextEncoder().encode(contractJson)]);
  const compressed = await pump(
    input.stream().pipeThrough(new CompressionStream("deflate-raw")),
  );
  return `m=${toBase64Url(compressed)}`;
}

export async function decodeShareFragment(hash: string): Promise<string | null> {
  const m = /(?:^|[#&])m=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const bytes = fromBase64Url(m[1]);
    const out = await pump(
      new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
    );
    return new TextDecoder().decode(out);
  } catch {
    return null; // malformed fragments are ignored, never fatal
  }
}
