export type Verdict = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "CONTRADICTED" | "UNVERIFIABLE";
export type Decision = "PENDING" | "ACCEPTED" | "EDITED" | "IGNORED";
export type ClaimType = "NUMBER" | "DATE" | "ENTITY" | "GENERALIZATION" | "QUALITATIVE";

export interface User {
  id: number;
  email: string;
  display_name: string;
}

export interface EvidenceItem {
  chunk_id: number;
  doc_title: string;
  content: string;
  score: number;
}

export interface Claim {
  id: number;
  seq: number;
  content: string;
  span_start: number;
  span_end: number;
  claim_type: ClaimType;
  verdict: Verdict;
  confidence: number;
  risk: number;
  evidence_chunk_id: number | null;
  quote: string | null;
  explanation: string | null;
  suggestion: string | null;
  evidence: EvidenceItem[];
  decision: Decision;
  edited_text: string | null;
}

export interface ReviewSummary {
  id: number;
  title: string;
  sample_id: string | null;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  stage: string;
  total_claims: number;
  processed_claims: number;
  provider: string;
  error_message: string | null;
  created_at: string | null;
  finished_at: string | null;
  completed_at: string | null;
  flagged_claims?: number;
}

export interface SourceDoc {
  id?: number;
  title: string;
  content: string;
}

export interface ReviewDetail extends ReviewSummary {
  draft: { id: number; title: string; content: string } | null;
  sources: SourceDoc[];
  claims: Claim[];
}

export interface SampleInfo {
  id: string;
  title: string;
  description: string;
  source_count: number;
}

export interface SampleDetail {
  id: string;
  title: string;
  description: string;
  draft: SourceDoc;
  sources: SourceDoc[];
}

export interface CompleteResult {
  stats: {
    duration_sec: number;
    total_claims: number;
    flagged_claims: number;
    decided_claims: number;
    planted_errors: number;
    ai_detected: number;
    found_errors: number;
    false_positives: number;
    missed_errors: number | null;
  };
  final_text: string;
}

export interface MetricSummary {
  count: number;
  avg_duration_sec: number | null;
  detection_rate: number | null;
  avg_false_positives: number | null;
  has_sample: boolean;
}

export interface SessionRow {
  id: number;
  review_id: number | null;
  session_kind: "MANUAL" | "ASSISTED";
  reviewer: string;
  duration_sec: number;
  planted_errors: number;
  found_errors: number;
  false_positives: number;
  is_sample: boolean;
  note: string | null;
  created_at: string | null;
}

export interface Metrics {
  manual: MetricSummary;
  assisted: MetricSummary;
  verdicts: Partial<Record<Verdict, number>>;
  sessions: SessionRow[];
}

export interface InstanceInfo {
  on_oci: boolean;
  container_hostname: string;
  reason?: string;
  display_name?: string;
  instance_id?: string;
  region?: string;
  region_key?: string;
  availability_domain?: string;
  fault_domain?: string;
  shape?: string;
  ocpus?: number;
  memory_gb?: number;
  compartment_id?: string;
  image_id?: string;
  time_created?: number;
  private_ip?: string;
}

export interface SystemInfo {
  app: {
    name: string;
    version: string;
    commit: string;
    provider: string;
    public_hostname: string;
    python: string;
    arch: string;
    container_hostname: string;
    uptime_sec: number;
  };
  instance: InstanceInfo;
  db: {
    ok: boolean;
    dialect: string;
    server_label: string | null;
    version?: string;
    server_host?: string;
    db_name?: string;
    container?: string;
    user?: string;
    vector_column?: boolean;
    latency_ms: number;
    error?: string;
  };
}
