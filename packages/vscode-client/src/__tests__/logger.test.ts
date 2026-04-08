/**
 * Logger Utility Tests
 * 
 * Tests for structured logging functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn()
    }))
  }
}));

import { logger, initLogger, createLogger, withTiming, withErrorLogging } from '../utils/logger';

describe('Logger Utility', () => {
  let mockOutputChannel: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutputChannel = {
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn()
    };
  });

  describe('initLogger', () => {
    it('should initialize with output channel', () => {
      expect(() => initLogger(mockOutputChannel)).not.toThrow();
    });

    it('should accept custom min level', () => {
      expect(() => initLogger(mockOutputChannel, 'debug')).not.toThrow();
    });
  });

  describe('logger methods', () => {
    beforeEach(() => {
      initLogger(mockOutputChannel, 'debug');
    });

    it('should log debug messages', () => {
      logger.debug('Test debug message');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('DEBUG');
      expect(call).toContain('Test debug message');
    });

    it('should log info messages', () => {
      logger.info('Test info message');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('INFO');
    });

    it('should log warn messages', () => {
      logger.warn('Test warning');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('WARN');
    });

    it('should log error messages', () => {
      logger.error('Test error', new Error('Something went wrong'));
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('ERROR');
    });

    it('should include metadata', () => {
      logger.info('Test with metadata', { userId: '123', action: 'test' });
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('userId');
      expect(call).toContain('123');
    });
  });

  describe('createLogger (child logger)', () => {
    beforeEach(() => {
      initLogger(mockOutputChannel, 'debug');
    });

    it('should create a child logger with context', () => {
      const childLogger = createLogger('MyModule');
      childLogger.info('Child message');
      
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('MyModule');
    });

    it('should support all log levels', () => {
      const childLogger = createLogger('TestModule');
      
      childLogger.debug('Debug');
      childLogger.info('Info');
      childLogger.warn('Warn');
      childLogger.error('Error');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(4);
    });
  });

  describe('logger.time', () => {
    beforeEach(() => {
      initLogger(mockOutputChannel, 'debug');
    });

    it('should measure and log timing', async () => {
      const end = logger.time('Test operation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      end();
      
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('Test operation');
      expect(call).toContain('completed');
    });
  });

  describe('logger.onError', () => {
    beforeEach(() => {
      initLogger(mockOutputChannel, 'debug');
    });

    it('should call error handlers on error', () => {
      const handler = vi.fn();
      const disposable = logger.onError(handler);
      
      logger.error('Test error', new Error('Something broke'));
      
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0]).toHaveProperty('level', 'error');
      expect(handler.mock.calls[0][0]).toHaveProperty('message', 'Test error');
      
      disposable.dispose();
    });

    it('should not call handler after dispose', () => {
      const handler = vi.fn();
      const disposable = logger.onError(handler);
      
      disposable.dispose();
      
      logger.error('Another error');
      
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('withTiming', () => {
    beforeEach(() => {
      initLogger(mockOutputChannel, 'debug');
    });

    it('should wrap async function with timing', async () => {
      const result = await withTiming('Async operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return 'done';
      });
      
      expect(result).toBe('done');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });
  });

  describe('withErrorLogging', () => {
    beforeEach(() => {
      initLogger(mockOutputChannel, 'debug');
    });

    it('should return result on success', async () => {
      const result = await withErrorLogging('Success op', async () => 'success');
      expect(result).toBe('success');
    });

    it('should return null and log on error', async () => {
      const result = await withErrorLogging('Failing op', async () => {
        throw new Error('Failed');
      });
      
      expect(result).toBeNull();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain('Failing op');
      expect(call).toContain('failed');
    });
  });

  describe('log level filtering', () => {
    it('should filter out debug when min level is info', () => {
      initLogger(mockOutputChannel, 'info');
      
      logger.debug('Should not appear');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
      
      logger.info('Should appear');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });

    it('should filter out debug and info when min level is warn', () => {
      initLogger(mockOutputChannel, 'warn');
      
      logger.debug('No');
      logger.info('No');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
      
      logger.warn('Yes');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });
  });
});
