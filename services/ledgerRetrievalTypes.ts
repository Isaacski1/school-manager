import type { StudentFeeLedger } from "./types";

export interface LedgerSourceStatus {
  source: "primary" | "alternate";
  status: "ok" | "failed";
  error?: string;
  recordCount: number;
}

export interface LedgerRetrievalResult {
  ledgers: StudentFeeLedger[];
  status: "complete" | "partial" | "failed";
  sources: LedgerSourceStatus[];
  error?: string;
}
