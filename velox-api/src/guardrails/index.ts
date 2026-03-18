// src/guardrails/index.ts
//
// Velox AI Guardrails Module
//
// Reference: docs/architecture/06-application-layer.md §6.3
//
// Provides input validation, output validation, and safety checks for the AI pipeline.

export { InputGuard, type InputValidationResult } from './inputGuard';
export { OutputGuard, type OutputValidationResult } from './outputGuard';
export { PiiDetector, type PiiMatch } from './piiDetector';
export { CostGuard, type CostCheckResult } from './costGuard';
export { GuardrailsService } from './guardrailsService';
