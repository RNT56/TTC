export type ReviewStatus = "needs_review" | "approved" | "rejected";
export type ReviewDecision = "approved" | "rejected";

export interface ReviewQueueItem {
  id: number;
  artifactId: string;
  artifactKind: "component" | "reference-rig";
  reason: string;
  status: ReviewStatus;
  confidence: number;
  payload: unknown;
  createdAt: string;
  reviewedAt: string | null;
  reviewer: string | null;
}

interface ReviewListResponse {
  items: ReviewQueueItem[];
}

const env = (import.meta as ImportMeta & { env?: { VITE_FORGE_GATEWAY_URL?: string } }).env;
const gatewayBase = (env?.VITE_FORGE_GATEWAY_URL ?? "").replace(/\/$/, "");

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${gatewayBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      /* keep status text */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function listReviews(status: ReviewStatus, limit = 25): Promise<ReviewQueueItem[]> {
  const params = new URLSearchParams({ status, limit: String(limit) });
  const body = await requestJson<ReviewListResponse>(`/v1/reviews?${params}`);
  return body.items;
}

export function decideReview(
  id: number,
  status: ReviewDecision,
  reviewer = "owner",
): Promise<ReviewQueueItem> {
  return requestJson<ReviewQueueItem>(`/v1/reviews/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, reviewer }),
  });
}
