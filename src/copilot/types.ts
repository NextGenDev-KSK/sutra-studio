import type { Proposal } from '../domain/ops';

export type InsightBlock =
  | { kind: 'list'; title?: string; items: string[] }
  | { kind: 'table'; title?: string; columns: string[]; rows: string[][] }
  | { kind: 'text'; title?: string; body: string; copyable?: boolean };

export interface FollowUp {
  label: string;
  request: string;
}

export type ReplySource = 'rules' | 'model';

export interface CopilotReply {
  text: string;
  blocks: InsightBlock[];
  proposal?: Proposal;
  followUps: FollowUp[];
  source: ReplySource;
  /** Shown when the reply came from a fallback path or was degraded. */
  notice?: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  at: string;
  text: string;
  reply?: CopilotReply;
  proposalState?: 'pending' | 'applied' | 'rejected';
}
