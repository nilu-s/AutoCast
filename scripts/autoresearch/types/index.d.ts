// AutoResearch Types

export interface Run {
  run_id: string;
  timestamp: string;
  baseline_score: number | null;
  final_score: number | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export interface MethodRun {
  method_id: string;
  run_id: string;
  decision: 'KEEP' | 'REJECT' | 'FAILED';
  improvement: number | null;
  duration_ms: number | null;
}

export interface Status {
  runId: string;
  overallStatus: string;
  jobs: Record<string, Job>;
}

export interface Job {
  methodId: string;
  status: string;
  decision?: string;
  result?: any;
}

// Module Types
export * from './result_naming';
export * from './status_manager';
export * from './polling';
export * from './learning_db';
export * from './method_validator';
