/**
 * Debug Module
 * 
 * Debug session capture and analysis:
 * - Record breakpoint hits
 * - Track variable states
 * - Detect common bug patterns
 * - Create reproducible scenarios
 */

export {
  DebugSessionManager,
  truncateValue,
  flattenVariables,
  DEFAULT_DEBUG_CAPTURE_CONFIG
} from './capture';

export type {
  StackFrame,
  VariableCapture,
  VariableScope,
  BreakpointHit,
  ExceptionCapture,
  ExecutionStep,
  DebugSession,
  DebugPattern,
  DebugPatternType,
  SessionAnalysis,
  DebugCaptureConfig
} from './capture';
