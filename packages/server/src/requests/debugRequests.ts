import { DebugSessionManager } from '@pre-cr/core/experimental';
import type { DebugCaptureConfig, DebugSession, SessionAnalysis } from '@pre-cr/core/experimental';
import type { Connection } from 'vscode-languageserver/node';

export function registerDebugRequests(connection: Connection): void {
  let debugManager: DebugSessionManager | null = null;

  // Initialize debug manager
  connection.onRequest(
    '$/preCr/initDebugManager',
    async (params: { config?: Partial<DebugCaptureConfig> }): Promise<{
      success: boolean;
    }> => {
      debugManager = new DebugSessionManager(params.config);
      return { success: true };
    }
  );

  // Start a debug session
  connection.onRequest(
    '$/preCr/startDebugSession',
    async (params: {
      name: string;
      debugType: string;
      launchConfig?: Record<string, unknown>;
    }): Promise<{
      session: { id: string; name: string; startTime: string } | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          debugManager = new DebugSessionManager();
        }

        const session = debugManager.startSession(
          params.name,
          params.debugType,
          params.launchConfig
        );

        return {
          session: {
            id: session.id,
            name: session.name,
            startTime: session.startTime.toISOString()
          }
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { session: null, error: errorMessage };
      }
    }
  );

  // End debug session
  connection.onRequest(
    '$/preCr/endDebugSession',
    async (params: { outcome?: 'success' | 'error' | 'terminated' }): Promise<{
      session: { id: string; duration: number } | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { session: null, error: 'Debug manager not initialized' };
        }

        const session = debugManager.endSession(params.outcome);
        if (!session) {
          return { session: null, error: 'No active session' };
        }

        const duration = (session.endTime?.getTime() || Date.now()) - session.startTime.getTime();

        return {
          session: {
            id: session.id,
            duration
          }
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { session: null, error: errorMessage };
      }
    }
  );

  // Record breakpoint hit
  connection.onRequest(
    '$/preCr/recordBreakpointHit',
    async (params: {
      location: { file: string; line: number; column?: number };
      hitCount: number;
      condition?: string;
      stackTrace: Array<{
        id: number;
        name: string;
        file: string;
        line: number;
        isUserCode: boolean;
      }>;
      scopes: Array<{
        name: string;
        variables: Array<{
          name: string;
          value: string;
          type: string;
          isPrimitive: boolean;
        }>;
      }>;
    }): Promise<{
      hitId: string | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { hitId: null, error: 'Debug manager not initialized' };
        }

        const hit = debugManager.recordBreakpointHit(params);
        return { hitId: hit?.id || null };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { hitId: null, error: errorMessage };
      }
    }
  );

  // Record exception
  connection.onRequest(
    '$/preCr/recordException',
    async (params: {
      type: string;
      message: string;
      stackTrace: Array<{
        id: number;
        name: string;
        file: string;
        line: number;
        isUserCode: boolean;
      }>;
    }): Promise<{
      recorded: boolean;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { recorded: false, error: 'Debug manager not initialized' };
        }

        debugManager.recordException(params);
        return { recorded: true };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { recorded: false, error: errorMessage };
      }
    }
  );

  // Record step
  connection.onRequest(
    '$/preCr/recordDebugStep',
    async (params: {
      type: 'step-over' | 'step-into' | 'step-out' | 'continue';
      location: { file: string; line: number };
    }): Promise<{
      recorded: boolean;
    }> => {
      if (!debugManager) {
        return { recorded: false };
      }

      debugManager.recordStep(params.type, params.location);
      return { recorded: true };
    }
  );

  // Analyze session
  connection.onRequest(
    '$/preCr/analyzeDebugSession',
    async (params: { sessionId: string }): Promise<{
      analysis: SessionAnalysis | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { analysis: null, error: 'Debug manager not initialized' };
        }

        const analysis = debugManager.analyzeSession(params.sessionId);
        return { analysis };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { analysis: null, error: errorMessage };
      }
    }
  );

  // Create reproducible scenario
  connection.onRequest(
    '$/preCr/createDebugScenario',
    async (params: { sessionId: string }): Promise<{
      scenario: {
        breakpoints: Array<{ file: string; line: number; condition?: string }>;
        watchExpressions: string[];
        description: string;
      } | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { scenario: null, error: 'Debug manager not initialized' };
        }

        const scenario = debugManager.createScenario(params.sessionId);
        return { scenario };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { scenario: null, error: errorMessage };
      }
    }
  );

  // List debug sessions
  connection.onRequest(
    '$/preCr/listDebugSessions',
    async (): Promise<{
      sessions: Array<{
        id: string;
        name: string;
        debugType: string;
        startTime: string;
        endTime?: string;
        outcome?: string;
        breakpointHits: number;
        exceptions: number;
      }>;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { sessions: [], error: 'Debug manager not initialized' };
        }

        const sessions = debugManager.getAllSessions();

        return {
          sessions: sessions.map(s => ({
            id: s.id,
            name: s.name,
            debugType: s.debugType,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime?.toISOString(),
            outcome: s.outcome,
            breakpointHits: s.breakpointHits.length,
            exceptions: s.exceptions.length
          }))
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { sessions: [], error: errorMessage };
      }
    }
  );

  // Get session details
  connection.onRequest(
    '$/preCr/getDebugSession',
    async (params: { sessionId: string }): Promise<{
      session: DebugSession | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { session: null, error: 'Debug manager not initialized' };
        }

        const session = debugManager.getSession(params.sessionId);
        return { session: session || null };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { session: null, error: errorMessage };
      }
    }
  );

  // Delete session
  connection.onRequest(
    '$/preCr/deleteDebugSession',
    async (params: { sessionId: string }): Promise<{
      success: boolean;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { success: false, error: 'Debug manager not initialized' };
        }

        const deleted = debugManager.deleteSession(params.sessionId);
        return { success: deleted };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Export session
  connection.onRequest(
    '$/preCr/exportDebugSession',
    async (params: { sessionId: string }): Promise<{
      data: object | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          return { data: null, error: 'Debug manager not initialized' };
        }

        const data = debugManager.exportSession(params.sessionId);
        return { data };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { data: null, error: errorMessage };
      }
    }
  );

  // Import session
  connection.onRequest(
    '$/preCr/importDebugSession',
    async (params: { data: object }): Promise<{
      sessionId: string | null;
      error?: string;
    }> => {
      try {
        if (!debugManager) {
          debugManager = new DebugSessionManager();
        }

        const sessionId = debugManager.importSession(params.data);
        return { sessionId };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { sessionId: null, error: errorMessage };
      }
    }
  );

  // ============================================================================
  // Start Server
}
