/**
 * Debug Session Capture
 * 
 * Captures and analyzes debugging sessions:
 * - Records variable states at breakpoints
 * - Tracks execution path
 * - Suggests fixes based on patterns
 * - Creates reproducible debug scenarios
 */

import { getLogger } from '../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * A single stack frame
 */
export interface StackFrame {
  /** Frame ID */
  id: number;
  /** Function/method name */
  name: string;
  /** Source file path */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column?: number;
  /** Module/namespace */
  module?: string;
  /** Is this user code or library code? */
  isUserCode: boolean;
}

/**
 * A variable value capture
 */
export interface VariableCapture {
  /** Variable name */
  name: string;
  /** Value as string */
  value: string;
  /** Type name */
  type: string;
  /** Is this a primitive or complex type? */
  isPrimitive: boolean;
  /** Child variables for objects/arrays */
  children?: VariableCapture[];
  /** Memory reference if available */
  memoryReference?: string;
  /** Was this value changed since last capture? */
  changed?: boolean;
}

/**
 * Scope containing variables
 */
export interface VariableScope {
  /** Scope name (Local, Closure, Global, etc) */
  name: string;
  /** Variables in this scope */
  variables: VariableCapture[];
  /** Is this scope expensive to evaluate? */
  expensive?: boolean;
}

/**
 * A captured breakpoint hit
 */
export interface BreakpointHit {
  /** Unique ID for this hit */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Breakpoint location */
  location: {
    file: string;
    line: number;
    column?: number;
  };
  /** Breakpoint condition if any */
  condition?: string;
  /** Hit count */
  hitCount: number;
  /** Stack trace */
  stackTrace: StackFrame[];
  /** Variable scopes */
  scopes: VariableScope[];
  /** Thread ID */
  threadId?: number;
  /** Thread name */
  threadName?: string;
}

/**
 * An exception that was caught
 */
export interface ExceptionCapture {
  /** Exception type/class */
  type: string;
  /** Exception message */
  message: string;
  /** Stack trace */
  stackTrace: StackFrame[];
  /** Inner/cause exception */
  innerException?: ExceptionCapture;
  /** Variables at time of exception */
  scopes?: VariableScope[];
  /** Timestamp */
  timestamp: Date;
}

/**
 * A step in the execution path
 */
export interface ExecutionStep {
  /** Step type */
  type: 'breakpoint' | 'step-over' | 'step-into' | 'step-out' | 'continue' | 'exception';
  /** Location after step */
  location: {
    file: string;
    line: number;
  };
  /** Timestamp */
  timestamp: Date;
  /** Duration since last step (ms) */
  duration?: number;
  /** Associated data */
  data?: BreakpointHit | ExceptionCapture;
}

/**
 * Complete debug session
 */
export interface DebugSession {
  /** Session ID */
  id: string;
  /** Session name/description */
  name: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Debug adapter type (node, python, etc) */
  debugType: string;
  /** Launch configuration */
  launchConfig?: Record<string, unknown>;
  /** All breakpoint hits */
  breakpointHits: BreakpointHit[];
  /** All exceptions */
  exceptions: ExceptionCapture[];
  /** Execution path */
  executionPath: ExecutionStep[];
  /** Watch expressions and their values over time */
  watchHistory: Map<string, Array<{ timestamp: Date; value: string }>>;
  /** Console/debug output */
  consoleOutput: Array<{ timestamp: Date; type: 'log' | 'warn' | 'error' | 'info'; message: string }>;
  /** Session metadata */
  metadata?: Record<string, unknown>;
  /** Session outcome */
  outcome?: 'success' | 'error' | 'terminated' | 'unknown';
}

/**
 * Pattern detected in debug session
 */
export interface DebugPattern {
  /** Pattern type */
  type: DebugPatternType;
  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';
  /** Description of the pattern */
  description: string;
  /** Suggested fix */
  suggestion: string;
  /** Related locations */
  locations: Array<{ file: string; line: number }>;
  /** Related variables */
  variables?: string[];
}

/**
 * Types of patterns we can detect
 */
export type DebugPatternType =
  | 'null-reference'      // Null/undefined access
  | 'off-by-one'          // Array bounds issues
  | 'infinite-loop'       // Loop not terminating
  | 'state-mutation'      // Unexpected state change
  | 'race-condition'      // Timing-related issues
  | 'type-mismatch'       // Type coercion issues
  | 'unhandled-case'      // Missing switch/if case
  | 'resource-leak'       // Unclosed resources
  | 'repeated-exception'  // Same exception multiple times
  | 'hot-path';           // Frequently hit code

/**
 * Debug session analysis result
 */
export interface SessionAnalysis {
  /** Session ID */
  sessionId: string;
  /** Duration in ms */
  duration: number;
  /** Total breakpoint hits */
  breakpointHitCount: number;
  /** Unique files visited */
  filesVisited: string[];
  /** Hot spots (frequently hit lines) */
  hotSpots: Array<{ file: string; line: number; hitCount: number }>;
  /** Detected patterns */
  patterns: DebugPattern[];
  /** Variables that changed frequently */
  volatileVariables: Array<{ name: string; changeCount: number }>;
  /** Exceptions summary */
  exceptionSummary: Array<{ type: string; count: number; message: string }>;
  /** Recommendations */
  recommendations: string[];
}

/**
 * Configuration for debug capture
 */
export interface DebugCaptureConfig {
  /** Maximum breakpoint hits to store */
  maxBreakpointHits: number;
  /** Maximum variable depth to capture */
  maxVariableDepth: number;
  /** Maximum array elements to capture */
  maxArrayElements: number;
  /** Maximum string length to capture */
  maxStringLength: number;
  /** Capture console output */
  captureConsole: boolean;
  /** Enable pattern detection */
  enablePatternDetection: boolean;
  /** Session retention days */
  retentionDays: number;
}

export const DEFAULT_DEBUG_CAPTURE_CONFIG: DebugCaptureConfig = {
  maxBreakpointHits: 1000,
  maxVariableDepth: 5,
  maxArrayElements: 100,
  maxStringLength: 1000,
  captureConsole: true,
  enablePatternDetection: true,
  retentionDays: 7
};

// ============================================================================
// Debug Session Manager
// ============================================================================

/**
 * Manages debug session capture and analysis
 */
export class DebugSessionManager {
  private sessions: Map<string, DebugSession> = new Map();
  private activeSession: DebugSession | null = null;
  private config: DebugCaptureConfig;
  
  constructor(config: Partial<DebugCaptureConfig> = {}) {
    this.config = { ...DEFAULT_DEBUG_CAPTURE_CONFIG, ...config };
  }
  
  /**
   * Start a new debug session
   */
  startSession(
    name: string,
    debugType: string,
    launchConfig?: Record<string, unknown>
  ): DebugSession {
    const logger = getLogger();
    
    const session: DebugSession = {
      id: generateSessionId(),
      name,
      startTime: new Date(),
      debugType,
      launchConfig,
      breakpointHits: [],
      exceptions: [],
      executionPath: [],
      watchHistory: new Map(),
      consoleOutput: []
    };
    
    this.activeSession = session;
    this.sessions.set(session.id, session);
    
    logger.info('Debug session started', {
      id: session.id,
      name,
      debugType
    });
    
    return session;
  }
  
  /**
   * End current session
   */
  endSession(outcome?: DebugSession['outcome']): DebugSession | null {
    const logger = getLogger();
    
    if (!this.activeSession) {
      return null;
    }
    
    this.activeSession.endTime = new Date();
    this.activeSession.outcome = outcome || 'unknown';
    
    const session = this.activeSession;
    const endTime = session.endTime!; // We just set it above
    this.activeSession = null;
    
    logger.info('Debug session ended', {
      id: session.id,
      duration: endTime.getTime() - session.startTime.getTime(),
      breakpointHits: session.breakpointHits.length,
      exceptions: session.exceptions.length
    });
    
    return session;
  }
  
  /**
   * Record a breakpoint hit
   */
  recordBreakpointHit(hit: Omit<BreakpointHit, 'id' | 'timestamp'>): BreakpointHit | null {
    if (!this.activeSession) return null;
    
    // Check limit
    if (this.activeSession.breakpointHits.length >= this.config.maxBreakpointHits) {
      // Remove oldest
      this.activeSession.breakpointHits.shift();
    }
    
    const fullHit: BreakpointHit = {
      ...hit,
      id: generateHitId(),
      timestamp: new Date()
    };
    
    this.activeSession.breakpointHits.push(fullHit);
    
    // Add to execution path
    this.activeSession.executionPath.push({
      type: 'breakpoint',
      location: fullHit.location,
      timestamp: fullHit.timestamp,
      data: fullHit
    });
    
    return fullHit;
  }
  
  /**
   * Record an exception
   */
  recordException(exception: Omit<ExceptionCapture, 'timestamp'>): ExceptionCapture {
    const fullException: ExceptionCapture = {
      ...exception,
      timestamp: new Date()
    };
    
    if (this.activeSession) {
      this.activeSession.exceptions.push(fullException);
      
      this.activeSession.executionPath.push({
        type: 'exception',
        location: exception.stackTrace[0] ? {
          file: exception.stackTrace[0].file,
          line: exception.stackTrace[0].line
        } : { file: 'unknown', line: 0 },
        timestamp: fullException.timestamp,
        data: fullException
      });
    }
    
    return fullException;
  }
  
  /**
   * Record a step
   */
  recordStep(
    type: ExecutionStep['type'],
    location: ExecutionStep['location']
  ): void {
    if (!this.activeSession) return;
    
    const lastStep = this.activeSession.executionPath[
      this.activeSession.executionPath.length - 1
    ];
    
    const now = new Date();
    
    this.activeSession.executionPath.push({
      type,
      location,
      timestamp: now,
      duration: lastStep ? now.getTime() - lastStep.timestamp.getTime() : undefined
    });
  }
  
  /**
   * Record watch expression value
   */
  recordWatchValue(expression: string, value: string): void {
    if (!this.activeSession) return;
    
    const history = this.activeSession.watchHistory.get(expression) || [];
    history.push({ timestamp: new Date(), value });
    this.activeSession.watchHistory.set(expression, history);
  }
  
  /**
   * Record console output
   */
  recordConsoleOutput(
    type: 'log' | 'warn' | 'error' | 'info',
    message: string
  ): void {
    if (!this.activeSession || !this.config.captureConsole) return;
    
    this.activeSession.consoleOutput.push({
      timestamp: new Date(),
      type,
      message: message.substring(0, this.config.maxStringLength)
    });
  }
  
  /**
   * Get active session
   */
  getActiveSession(): DebugSession | null {
    return this.activeSession;
  }
  
  /**
   * Get session by ID
   */
  getSession(id: string): DebugSession | undefined {
    return this.sessions.get(id);
  }
  
  /**
   * Get all sessions
   */
  getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }
  
  /**
   * Delete a session
   */
  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }
  
  /**
   * Analyze a session
   */
  analyzeSession(sessionId: string): SessionAnalysis | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    const logger = getLogger();
    
    // Calculate duration
    const endTime = session.endTime || new Date();
    const duration = endTime.getTime() - session.startTime.getTime();
    
    // Find unique files
    const filesVisited = new Set<string>();
    for (const hit of session.breakpointHits) {
      filesVisited.add(hit.location.file);
    }
    
    // Find hot spots
    const hitCounts = new Map<string, number>();
    for (const hit of session.breakpointHits) {
      const key = `${hit.location.file}:${hit.location.line}`;
      hitCounts.set(key, (hitCounts.get(key) || 0) + 1);
    }
    
    const hotSpots = Array.from(hitCounts.entries())
      .map(([key, count]) => {
        const [file, lineStr] = key.split(':');
        return { file, line: parseInt(lineStr, 10), hitCount: count };
      })
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10);
    
    // Detect patterns
    const patterns = this.config.enablePatternDetection
      ? this.detectPatterns(session)
      : [];
    
    // Find volatile variables
    const variableChanges = new Map<string, number>();
    let prevVariables = new Map<string, string>();
    
    for (const hit of session.breakpointHits) {
      for (const scope of hit.scopes) {
        for (const variable of scope.variables) {
          const prev = prevVariables.get(variable.name);
          if (prev !== undefined && prev !== variable.value) {
            variableChanges.set(
              variable.name,
              (variableChanges.get(variable.name) || 0) + 1
            );
          }
          prevVariables.set(variable.name, variable.value);
        }
      }
    }
    
    const volatileVariables = Array.from(variableChanges.entries())
      .map(([name, changeCount]) => ({ name, changeCount }))
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 10);
    
    // Exception summary
    const exceptionCounts = new Map<string, { count: number; message: string }>();
    for (const ex of session.exceptions) {
      const existing = exceptionCounts.get(ex.type);
      if (existing) {
        existing.count++;
      } else {
        exceptionCounts.set(ex.type, { count: 1, message: ex.message });
      }
    }
    
    const exceptionSummary = Array.from(exceptionCounts.entries())
      .map(([type, data]) => ({ type, ...data }));
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(session, patterns, hotSpots);
    
    const analysis: SessionAnalysis = {
      sessionId,
      duration,
      breakpointHitCount: session.breakpointHits.length,
      filesVisited: Array.from(filesVisited),
      hotSpots,
      patterns,
      volatileVariables,
      exceptionSummary,
      recommendations
    };
    
    logger.info('Session analysis complete', {
      sessionId,
      patternsFound: patterns.length,
      hotSpotCount: hotSpots.length
    });
    
    return analysis;
  }
  
  /**
   * Create a reproducible scenario from a session
   */
  createScenario(sessionId: string): {
    breakpoints: Array<{ file: string; line: number; condition?: string }>;
    watchExpressions: string[];
    description: string;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    // Extract unique breakpoint locations
    const breakpointMap = new Map<string, { file: string; line: number; condition?: string }>();
    for (const hit of session.breakpointHits) {
      const key = `${hit.location.file}:${hit.location.line}`;
      if (!breakpointMap.has(key)) {
        breakpointMap.set(key, {
          file: hit.location.file,
          line: hit.location.line,
          condition: hit.condition
        });
      }
    }
    
    // Get watch expressions
    const watchExpressions = Array.from(session.watchHistory.keys());
    
    // Generate description
    let description = `Debug scenario from session "${session.name}"`;
    if (session.exceptions.length > 0) {
      description += `. Caught ${session.exceptions.length} exception(s): ${
        session.exceptions.map(e => e.type).join(', ')
      }`;
    }
    
    return {
      breakpoints: Array.from(breakpointMap.values()),
      watchExpressions,
      description
    };
  }
  
  /**
   * Export session to JSON
   */
  exportSession(sessionId: string): object | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    return {
      ...session,
      watchHistory: Array.from(session.watchHistory.entries())
    };
  }
  
  /**
   * Import session from JSON
   */
  importSession(data: object): string | null {
    try {
      const session = data as DebugSession & { watchHistory: Array<[string, Array<{ timestamp: Date; value: string }>]> };
      
      // Restore Map
      const watchHistory = new Map(session.watchHistory);
      
      const restored: DebugSession = {
        ...session,
        startTime: new Date(session.startTime),
        endTime: session.endTime ? new Date(session.endTime) : undefined,
        watchHistory
      };
      
      this.sessions.set(restored.id, restored);
      return restored.id;
    } catch {
      return null;
    }
  }
  
  /**
   * Prune old sessions
   */
  pruneOldSessions(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
    
    let pruned = 0;
    for (const [id, session] of this.sessions) {
      if (session.startTime < cutoff) {
        this.sessions.delete(id);
        pruned++;
      }
    }
    
    return pruned;
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  private detectPatterns(session: DebugSession): DebugPattern[] {
    const patterns: DebugPattern[] = [];
    
    // Detect null reference patterns
    for (const ex of session.exceptions) {
      if (ex.type.toLowerCase().includes('null') ||
          ex.type.toLowerCase().includes('undefined') ||
          ex.message.toLowerCase().includes('cannot read property') ||
          ex.message.toLowerCase().includes('is not defined')) {
        patterns.push({
          type: 'null-reference',
          confidence: 'high',
          description: `Null/undefined reference: ${ex.message}`,
          suggestion: 'Add null checks before accessing this property',
          locations: ex.stackTrace.slice(0, 3).map(f => ({
            file: f.file,
            line: f.line
          }))
        });
      }
    }
    
    // Detect repeated exceptions
    const exceptionCounts = new Map<string, number>();
    for (const ex of session.exceptions) {
      const key = `${ex.type}:${ex.stackTrace[0]?.file}:${ex.stackTrace[0]?.line}`;
      exceptionCounts.set(key, (exceptionCounts.get(key) || 0) + 1);
    }
    
    for (const [key, count] of exceptionCounts) {
      if (count >= 3) {
        const [type, file, lineStr] = key.split(':');
        patterns.push({
          type: 'repeated-exception',
          confidence: 'high',
          description: `${type} thrown ${count} times from same location`,
          suggestion: 'Consider adding error handling or fixing the root cause',
          locations: [{ file, line: parseInt(lineStr, 10) }]
        });
      }
    }
    
    // Detect hot paths (potential infinite loops)
    const hitCounts = new Map<string, number>();
    for (const hit of session.breakpointHits) {
      const key = `${hit.location.file}:${hit.location.line}`;
      hitCounts.set(key, (hitCounts.get(key) || 0) + 1);
    }
    
    for (const [key, count] of hitCounts) {
      if (count >= 100) {
        const [file, lineStr] = key.split(':');
        patterns.push({
          type: 'hot-path',
          confidence: count >= 500 ? 'high' : 'medium',
          description: `Line hit ${count} times - possible infinite loop or hot path`,
          suggestion: count >= 500 
            ? 'Check loop termination conditions'
            : 'Consider optimizing this frequently executed code',
          locations: [{ file, line: parseInt(lineStr, 10) }]
        });
      }
    }
    
    // Detect off-by-one errors
    for (const ex of session.exceptions) {
      if (ex.message.toLowerCase().includes('index') ||
          ex.message.toLowerCase().includes('bounds') ||
          ex.message.toLowerCase().includes('range')) {
        patterns.push({
          type: 'off-by-one',
          confidence: 'medium',
          description: `Array bounds error: ${ex.message}`,
          suggestion: 'Check array index calculations and loop bounds',
          locations: ex.stackTrace.slice(0, 2).map(f => ({
            file: f.file,
            line: f.line
          }))
        });
      }
    }
    
    return patterns;
  }
  
  private generateRecommendations(
    session: DebugSession,
    patterns: DebugPattern[],
    hotSpots: Array<{ file: string; line: number; hitCount: number }>
  ): string[] {
    const recommendations: string[] = [];
    
    if (session.exceptions.length > 10) {
      recommendations.push('High exception count - consider adding more error handling');
    }
    
    if (hotSpots.length > 0 && hotSpots[0].hitCount > 100) {
      recommendations.push(`Investigate hot spot at ${hotSpots[0].file}:${hotSpots[0].line}`);
    }
    
    const nullPatterns = patterns.filter(p => p.type === 'null-reference');
    if (nullPatterns.length > 0) {
      recommendations.push('Add defensive null checks to prevent null reference errors');
    }
    
    const hasInfiniteLoop = patterns.some(
      p => p.type === 'hot-path' && p.confidence === 'high'
    );
    if (hasInfiniteLoop) {
      recommendations.push('Review loop conditions - possible infinite loop detected');
    }
    
    if (session.executionPath.length > 1000) {
      recommendations.push('Long execution path - consider breaking into smaller units');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('No significant issues detected in this debug session');
    }
    
    return recommendations;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `dbg_${timestamp}_${random}`;
}

function generateHitId(): string {
  return `hit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Truncate variable value for storage
 */
export function truncateValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength - 3) + '...';
}

/**
 * Flatten nested variable structure
 */
export function flattenVariables(
  variables: VariableCapture[],
  prefix: string = '',
  maxDepth: number = 5,
  currentDepth: number = 0
): Array<{ path: string; value: string; type: string }> {
  const result: Array<{ path: string; value: string; type: string }> = [];
  
  if (currentDepth >= maxDepth) return result;
  
  for (const variable of variables) {
    const path = prefix ? `${prefix}.${variable.name}` : variable.name;
    
    result.push({
      path,
      value: variable.value,
      type: variable.type
    });
    
    if (variable.children) {
      result.push(...flattenVariables(
        variable.children,
        path,
        maxDepth,
        currentDepth + 1
      ));
    }
  }
  
  return result;
}
