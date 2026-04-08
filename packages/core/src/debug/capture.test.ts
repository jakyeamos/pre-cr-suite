/**
 * Debug Session Capture Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DebugSessionManager,
  DebugSession,
  BreakpointHit,
  VariableCapture,
  truncateValue,
  flattenVariables,
  DEFAULT_DEBUG_CAPTURE_CONFIG
} from './capture';

describe('Debug Session Capture', () => {
  let manager: DebugSessionManager;
  
  beforeEach(() => {
    manager = new DebugSessionManager();
  });
  
  describe('startSession', () => {
    it('creates a new debug session', () => {
      const session = manager.startSession('Test Debug', 'node');
      
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^dbg_/);
      expect(session.name).toBe('Test Debug');
      expect(session.debugType).toBe('node');
      expect(session.startTime).toBeInstanceOf(Date);
    });
    
    it('stores launch configuration', () => {
      const config = { program: '${workspaceFolder}/app.js', args: ['--debug'] };
      const session = manager.startSession('Test', 'node', config);
      
      expect(session.launchConfig).toEqual(config);
    });
    
    it('sets session as active', () => {
      manager.startSession('Test', 'node');
      
      expect(manager.getActiveSession()).not.toBeNull();
    });
  });
  
  describe('endSession', () => {
    it('ends the active session', () => {
      manager.startSession('Test', 'node');
      const ended = manager.endSession('success');
      
      expect(ended).not.toBeNull();
      expect(ended?.endTime).toBeInstanceOf(Date);
      expect(ended?.outcome).toBe('success');
      expect(manager.getActiveSession()).toBeNull();
    });
    
    it('returns null if no active session', () => {
      expect(manager.endSession()).toBeNull();
    });
  });
  
  describe('recordBreakpointHit', () => {
    it('records breakpoint hits', () => {
      manager.startSession('Test', 'node');
      
      const hit = manager.recordBreakpointHit({
        location: { file: 'src/app.ts', line: 42 },
        hitCount: 1,
        stackTrace: [
          { id: 0, name: 'main', file: 'src/app.ts', line: 42, isUserCode: true }
        ],
        scopes: []
      });
      
      expect(hit).not.toBeNull();
      expect(hit?.id).toMatch(/^hit_/);
      expect(hit?.location.file).toBe('src/app.ts');
      
      const session = manager.getActiveSession();
      expect(session?.breakpointHits.length).toBe(1);
    });
    
    it('adds to execution path', () => {
      manager.startSession('Test', 'node');
      
      manager.recordBreakpointHit({
        location: { file: 'src/app.ts', line: 10 },
        hitCount: 1,
        stackTrace: [],
        scopes: []
      });
      
      const session = manager.getActiveSession();
      expect(session?.executionPath.length).toBe(1);
      expect(session?.executionPath[0].type).toBe('breakpoint');
    });
    
    it('respects max breakpoint hits limit', () => {
      const manager = new DebugSessionManager({ maxBreakpointHits: 3 });
      manager.startSession('Test', 'node');
      
      for (let i = 0; i < 5; i++) {
        manager.recordBreakpointHit({
          location: { file: 'src/app.ts', line: i },
          hitCount: 1,
          stackTrace: [],
          scopes: []
        });
      }
      
      const session = manager.getActiveSession();
      expect(session?.breakpointHits.length).toBe(3);
      // First two should have been removed
      expect(session?.breakpointHits[0].location.line).toBe(2);
    });
    
    it('returns null if no active session', () => {
      const hit = manager.recordBreakpointHit({
        location: { file: 'src/app.ts', line: 42 },
        hitCount: 1,
        stackTrace: [],
        scopes: []
      });
      
      expect(hit).toBeNull();
    });
  });
  
  describe('recordException', () => {
    it('records exceptions', () => {
      manager.startSession('Test', 'node');
      
      const exception = manager.recordException({
        type: 'TypeError',
        message: 'Cannot read property x of undefined',
        stackTrace: [
          { id: 0, name: 'getData', file: 'src/data.ts', line: 15, isUserCode: true }
        ]
      });
      
      expect(exception.timestamp).toBeInstanceOf(Date);
      
      const session = manager.getActiveSession();
      expect(session?.exceptions.length).toBe(1);
    });
    
    it('adds exception to execution path', () => {
      manager.startSession('Test', 'node');
      
      manager.recordException({
        type: 'Error',
        message: 'Something went wrong',
        stackTrace: [
          { id: 0, name: 'process', file: 'src/util.ts', line: 100, isUserCode: true }
        ]
      });
      
      const session = manager.getActiveSession();
      expect(session?.executionPath[0].type).toBe('exception');
    });
  });
  
  describe('recordStep', () => {
    it('records step events', () => {
      manager.startSession('Test', 'node');
      
      manager.recordStep('step-over', { file: 'src/app.ts', line: 10 });
      manager.recordStep('step-into', { file: 'src/util.ts', line: 5 });
      
      const session = manager.getActiveSession();
      expect(session?.executionPath.length).toBe(2);
      expect(session?.executionPath[0].type).toBe('step-over');
      expect(session?.executionPath[1].type).toBe('step-into');
    });
    
    it('calculates duration between steps', () => {
      manager.startSession('Test', 'node');
      
      manager.recordStep('step-over', { file: 'src/app.ts', line: 10 });
      // Simulate some time passing
      manager.recordStep('step-over', { file: 'src/app.ts', line: 11 });
      
      const session = manager.getActiveSession();
      expect(session?.executionPath[1].duration).toBeDefined();
    });
  });
  
  describe('recordWatchValue', () => {
    it('tracks watch expression values', () => {
      manager.startSession('Test', 'node');
      
      manager.recordWatchValue('user.name', '"John"');
      manager.recordWatchValue('user.name', '"Jane"');
      manager.recordWatchValue('count', '5');
      
      const session = manager.getActiveSession();
      expect(session?.watchHistory.size).toBe(2);
      expect(session?.watchHistory.get('user.name')?.length).toBe(2);
    });
  });
  
  describe('recordConsoleOutput', () => {
    it('captures console output', () => {
      manager.startSession('Test', 'node');
      
      manager.recordConsoleOutput('log', 'Hello world');
      manager.recordConsoleOutput('error', 'Something failed');
      
      const session = manager.getActiveSession();
      expect(session?.consoleOutput.length).toBe(2);
      expect(session?.consoleOutput[0].type).toBe('log');
    });
    
    it('truncates long messages', () => {
      const manager = new DebugSessionManager({ 
        maxStringLength: 20,
        captureConsole: true
      });
      manager.startSession('Test', 'node');
      
      manager.recordConsoleOutput('log', 'This is a very long message that should be truncated');
      
      const session = manager.getActiveSession();
      expect(session?.consoleOutput[0].message.length).toBeLessThanOrEqual(20);
    });
    
    it('respects captureConsole config', () => {
      const manager = new DebugSessionManager({ captureConsole: false });
      manager.startSession('Test', 'node');
      
      manager.recordConsoleOutput('log', 'Hello');
      
      const session = manager.getActiveSession();
      expect(session?.consoleOutput.length).toBe(0);
    });
  });
  
  describe('analyzeSession', () => {
    it('analyzes a debug session', () => {
      manager.startSession('Test', 'node');
      
      // Add some breakpoint hits
      for (let i = 0; i < 5; i++) {
        manager.recordBreakpointHit({
          location: { file: 'src/app.ts', line: 10 },
          hitCount: i + 1,
          stackTrace: [],
          scopes: [{
            name: 'Local',
            variables: [{ name: 'i', value: String(i), type: 'number', isPrimitive: true }]
          }]
        });
      }
      
      manager.endSession('success');
      
      const session = manager.getAllSessions()[0];
      const analysis = manager.analyzeSession(session.id);
      
      expect(analysis).not.toBeNull();
      expect(analysis?.breakpointHitCount).toBe(5);
      expect(analysis?.filesVisited).toContain('src/app.ts');
      expect(analysis?.hotSpots.length).toBeGreaterThan(0);
    });
    
    it('detects null reference patterns', () => {
      manager.startSession('Test', 'node');
      
      manager.recordException({
        type: 'TypeError',
        message: "Cannot read property 'name' of undefined",
        stackTrace: [
          { id: 0, name: 'getUser', file: 'src/user.ts', line: 25, isUserCode: true }
        ]
      });
      
      manager.endSession('error');
      
      const session = manager.getAllSessions()[0];
      const analysis = manager.analyzeSession(session.id);
      
      const nullPattern = analysis?.patterns.find(p => p.type === 'null-reference');
      expect(nullPattern).toBeDefined();
      expect(nullPattern?.confidence).toBe('high');
    });
    
    it('detects hot paths', () => {
      manager.startSession('Test', 'node');
      
      // Simulate many hits to same line
      for (let i = 0; i < 150; i++) {
        manager.recordBreakpointHit({
          location: { file: 'src/loop.ts', line: 42 },
          hitCount: i + 1,
          stackTrace: [],
          scopes: []
        });
      }
      
      manager.endSession();
      
      const session = manager.getAllSessions()[0];
      const analysis = manager.analyzeSession(session.id);
      
      const hotPath = analysis?.patterns.find(p => p.type === 'hot-path');
      expect(hotPath).toBeDefined();
    });
    
    it('tracks volatile variables', () => {
      manager.startSession('Test', 'node');
      
      // Variable changes value multiple times
      for (let i = 0; i < 10; i++) {
        manager.recordBreakpointHit({
          location: { file: 'src/app.ts', line: 10 },
          hitCount: i + 1,
          stackTrace: [],
          scopes: [{
            name: 'Local',
            variables: [
              { name: 'counter', value: String(i), type: 'number', isPrimitive: true },
              { name: 'constant', value: '42', type: 'number', isPrimitive: true }
            ]
          }]
        });
      }
      
      manager.endSession();
      
      const session = manager.getAllSessions()[0];
      const analysis = manager.analyzeSession(session.id);
      
      const counterVar = analysis?.volatileVariables.find(v => v.name === 'counter');
      expect(counterVar).toBeDefined();
      expect(counterVar?.changeCount).toBeGreaterThan(0);
    });
  });
  
  describe('createScenario', () => {
    it('creates reproducible scenario', () => {
      manager.startSession('Debug Issue #123', 'node');
      
      manager.recordBreakpointHit({
        location: { file: 'src/auth.ts', line: 50 },
        condition: 'user.role === "admin"',
        hitCount: 1,
        stackTrace: [],
        scopes: []
      });
      
      manager.recordWatchValue('user.role', '"admin"');
      manager.recordWatchValue('token', '"abc123"');
      
      manager.endSession();
      
      const session = manager.getAllSessions()[0];
      const scenario = manager.createScenario(session.id);
      
      expect(scenario).not.toBeNull();
      expect(scenario?.breakpoints.length).toBe(1);
      expect(scenario?.breakpoints[0].condition).toBe('user.role === "admin"');
      expect(scenario?.watchExpressions).toContain('user.role');
      expect(scenario?.description).toContain('Debug Issue #123');
    });
  });
  
  describe('export/import', () => {
    it('exports session to JSON', () => {
      manager.startSession('Export Test', 'node');
      manager.recordBreakpointHit({
        location: { file: 'src/app.ts', line: 10 },
        hitCount: 1,
        stackTrace: [],
        scopes: []
      });
      manager.endSession();
      
      const session = manager.getAllSessions()[0];
      const exported = manager.exportSession(session.id);
      
      expect(exported).not.toBeNull();
      expect((exported as DebugSession).name).toBe('Export Test');
    });
    
    it('imports session from JSON', () => {
      manager.startSession('Import Test', 'python');
      manager.endSession();
      
      const session = manager.getAllSessions()[0];
      const exported = manager.exportSession(session.id);
      
      const newManager = new DebugSessionManager();
      const importedId = newManager.importSession(exported!);
      
      expect(importedId).not.toBeNull();
      
      const imported = newManager.getSession(importedId!);
      expect(imported?.name).toBe('Import Test');
      expect(imported?.debugType).toBe('python');
    });
  });
  
  describe('pruneOldSessions', () => {
    it('removes old sessions', () => {
      manager.startSession('Old Session', 'node');
      const session = manager.endSession();
      
      // Manually age the session
      if (session) {
        session.startTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      }
      
      const pruned = manager.pruneOldSessions();
      
      expect(pruned).toBe(1);
      expect(manager.getAllSessions().length).toBe(0);
    });
  });
  
  describe('utility functions', () => {
    describe('truncateValue', () => {
      it('truncates long values', () => {
        const result = truncateValue('This is a very long string', 15);
        expect(result).toBe('This is a ve...');
        expect(result.length).toBe(15);
      });
      
      it('leaves short values unchanged', () => {
        const result = truncateValue('Short', 100);
        expect(result).toBe('Short');
      });
    });
    
    describe('flattenVariables', () => {
      it('flattens nested variables', () => {
        const variables: VariableCapture[] = [{
          name: 'user',
          value: '{...}',
          type: 'Object',
          isPrimitive: false,
          children: [
            { name: 'name', value: '"John"', type: 'string', isPrimitive: true },
            { name: 'age', value: '30', type: 'number', isPrimitive: true }
          ]
        }];
        
        const flat = flattenVariables(variables);
        
        expect(flat.length).toBe(3);
        expect(flat[0].path).toBe('user');
        expect(flat[1].path).toBe('user.name');
        expect(flat[2].path).toBe('user.age');
      });
      
      it('respects max depth', () => {
        const deepNested: VariableCapture = {
          name: 'a',
          value: '{}',
          type: 'Object',
          isPrimitive: false,
          children: [{
            name: 'b',
            value: '{}',
            type: 'Object',
            isPrimitive: false,
            children: [{
              name: 'c',
              value: '1',
              type: 'number',
              isPrimitive: true
            }]
          }]
        };
        
        const flat = flattenVariables([deepNested], '', 2);
        
        // Should only go 2 levels deep
        expect(flat.length).toBe(2);
        expect(flat.map(f => f.path)).not.toContain('a.b.c');
      });
    });
  });
});
