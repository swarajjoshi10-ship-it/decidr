import { z } from 'zod';

export const ADRSchema = z.object({
  id: z.string(), // e.g., "ADR-001"
  status: z.enum(['active', 'deprecated', 'proposed']),
  decision: z.object({
    statement: z.string(),
    rationale: z.array(z.string()),
  }),
  constraints: z.array(z.object({
    subject: z.string(),
    must_use: z.string().optional(),
    allowed_for: z.array(z.string()).optional(),
    prohibited_for: z.array(z.string()).optional(),
  })),
  approved_by: z.string(),
});

export const ExceptionSchema = z.object({
  id: z.string(), // e.g., "EXC-001"
  decision_id: z.string(),
  scope: z.object({
    paths: z.array(z.string()),
  }),
  reason: z.string(),
  approved_by: z.string(),
  created_at: z.string(),
  expires_at: z.string(), // YYYY-MM-DD
});

export const HistoryEventSchema = z.object({
  timestamp: z.string(),
  event_type: z.enum(['DECISION_CREATED', 'VIOLATION_DETECTED', 'APPEAL_SUBMITTED', 'EXCEPTION_APPROVED']),
  entity_id: z.string(),
  actor: z.string(),  
  details: z.record(z.string(), z.any()),
});

export type ADR = z.infer<typeof ADRSchema>;
export type Exception = z.infer<typeof ExceptionSchema>;
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;