import type {
  Claim,
  CompleteResult,
  Decision,
  Metrics,
  ReviewDetail,
  ReviewSummary,
  SampleDetail,
  SampleInfo,
  SourceDoc,
  SystemInfo,
  User,
} from "./types";

const TOKEN_KEY = "verifi.token";
const USER_KEY = "verifi.user";

// 브라우저 저장소는 막혀 있을 수 있으므로 메모리 값을 함께 둔다
let memToken: string | null = null;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* 저장소를 못 쓰면 메모리만 사용 */
  }
}

export const session = {
  token(): string | null {
    return memToken ?? storageGet(TOKEN_KEY);
  },
  user(): User | null {
    const raw = storageGet(USER_KEY);
    try {
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  save(token: string, user: User) {
    memToken = token;
    storageSet(TOKEN_KEY, token);
    storageSet(USER_KEY, JSON.stringify(user));
  },
  clear() {
    memToken = null;
    storageSet(TOKEN_KEY, null);
    storageSet(USER_KEY, null);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = session.token();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없어요. 네트워크나 서버 상태를 확인해 주세요.");
  }
  if (res.status === 401 && !path.endsWith("/login")) {
    session.clear();
    window.location.hash = "#/login";
  }
  if (!res.ok) {
    let msg = `요청이 실패했어요 (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = "입력값을 확인해 주세요.";
    } catch {
      /* 본문 없음 */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  samples: () => request<SampleInfo[]>("/api/samples"),
  sample: (id: string) => request<SampleDetail>(`/api/samples/${id}`),
  reviews: () => request<ReviewSummary[]>("/api/reviews"),
  review: (id: number) => request<ReviewDetail>(`/api/reviews/${id}`),
  createReview: (body: { title: string; sample_id: string | null; draft: SourceDoc; sources: SourceDoc[] }) =>
    request<ReviewSummary>("/api/reviews", { method: "POST", body: JSON.stringify(body) }),
  decide: (claimId: number, decision: Decision, edited_text?: string) =>
    request<Claim>(`/api/claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ decision, edited_text: edited_text ?? null }),
    }),
  complete: (reviewId: number, duration_sec: number, reviewer: string) =>
    request<CompleteResult>(`/api/reviews/${reviewId}/complete`, {
      method: "POST",
      body: JSON.stringify({ duration_sec, reviewer }),
    }),
  metrics: () => request<Metrics>("/api/metrics"),
  addManualSession: (body: {
    reviewer: string;
    duration_sec: number;
    planted_errors: number;
    found_errors: number;
    false_positives: number;
  }) => request("/api/metrics/sessions", { method: "POST", body: JSON.stringify(body) }),
  clearSampleSessions: () => request<{ deleted: number }>("/api/metrics/samples", { method: "DELETE" }),
  system: () => request<SystemInfo>("/api/system"),
  streamUrl: (reviewId: number) => `/api/reviews/${reviewId}/stream?token=${encodeURIComponent(session.token() ?? "")}`,
};
