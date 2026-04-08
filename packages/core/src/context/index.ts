/**
 * Context Module
 * 
 * Context snapshot and restore functionality:
 * - Capture editor state
 * - Restore on branch switch
 * - "Where was I?" summaries
 */

export {
  ContextManager,
  createMinimalSnapshot,
  DEFAULT_CONTEXT_CONFIG
} from './snapshot';

export type {
  FilePosition,
  OpenFileState,
  BreakpointState,
  TerminalState,
  SearchState,
  GitState,
  LayoutState,
  ContextSnapshot,
  ContextDiff,
  ContextSummary,
  ContextConfig
} from './snapshot';
