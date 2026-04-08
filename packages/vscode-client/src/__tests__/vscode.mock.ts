/**
 * VS Code Mock for Unit Testing
 * 
 * Provides mock implementations of VS Code APIs for testing
 * extension code without a running VS Code instance.
 */

import { vi } from 'vitest';

// Mock Disposable
export class Disposable {
  private callback: () => void;
  
  constructor(callback: () => void = () => {}) {
    this.callback = callback;
  }
  
  dispose() {
    this.callback();
  }
}

// Mock EventEmitter
export class EventEmitter<T> {
  private listeners: Set<(e: T) => void> = new Set();
  
  event = (listener: (e: T) => void): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  
  fire(data: T) {
    this.listeners.forEach(l => l(data));
  }
  
  dispose() {
    this.listeners.clear();
  }
}

// Mock Uri
export class Uri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
  readonly fsPath: string;
  
  private constructor(
    scheme: string,
    authority: string,
    path: string,
    query: string,
    fragment: string
  ) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
    this.fsPath = path;
  }
  
  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }
  
  static parse(value: string): Uri {
    return new Uri('file', '', value, '', '');
  }
  
  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.path, ...pathSegments].join('/');
    return new Uri(base.scheme, base.authority, joined, '', '');
  }
  
  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
  
  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment
    );
  }
}

// Mock Range
export class Range {
  readonly start: Position;
  readonly end: Position;
  
  constructor(startLine: number, startChar: number, endLine: number, endChar: number);
  constructor(start: Position, end: Position);
  constructor(
    startOrLine: number | Position,
    startCharOrEnd: number | Position,
    endLine?: number,
    endChar?: number
  ) {
    if (typeof startOrLine === 'number') {
      this.start = new Position(startOrLine, startCharOrEnd as number);
      this.end = new Position(endLine!, endChar!);
    } else {
      this.start = startOrLine;
      this.end = startCharOrEnd as Position;
    }
  }
}

// Mock Position
export class Position {
  readonly line: number;
  readonly character: number;
  
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

// Mock StatusBarItem
export interface StatusBarItem {
  text: string;
  tooltip: string | undefined;
  command: string | undefined;
  backgroundColor: any;
  color: any;
  name: string | undefined;
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createMockStatusBarItem(): StatusBarItem {
  return {
    text: '',
    tooltip: undefined,
    command: undefined,
    backgroundColor: undefined,
    color: undefined,
    name: undefined,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn()
  };
}

// Mock ExtensionContext
export interface ExtensionContext {
  subscriptions: Disposable[];
  globalState: {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: any): Promise<void>;
  };
  workspaceState: {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: any): Promise<void>;
  };
  extensionPath: string;
  asAbsolutePath(relativePath: string): string;
}

export function createMockExtensionContext(): ExtensionContext {
  const globalStore = new Map<string, any>();
  const workspaceStore = new Map<string, any>();
  
  return {
    subscriptions: [],
    globalState: {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return globalStore.has(key) ? globalStore.get(key) : defaultValue;
      },
      update: vi.fn(async (key: string, value: any) => {
        globalStore.set(key, value);
      })
    },
    workspaceState: {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return workspaceStore.has(key) ? workspaceStore.get(key) : defaultValue;
      },
      update: vi.fn(async (key: string, value: any) => {
        workspaceStore.set(key, value);
      })
    },
    extensionPath: '/mock/extension/path',
    asAbsolutePath: (p: string) => `/mock/extension/path/${p}`
  };
}

// Mock window
export const window = {
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn().mockResolvedValue(undefined),
  showErrorMessage: vi.fn().mockResolvedValue(undefined),
  showQuickPick: vi.fn().mockResolvedValue(undefined),
  showInputBox: vi.fn().mockResolvedValue(undefined),
  createStatusBarItem: vi.fn(() => createMockStatusBarItem()),
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn()
  })),
  createWebviewPanel: vi.fn(),
  activeTextEditor: undefined as any,
  visibleTextEditors: [] as any[],
  onDidChangeActiveTextEditor: new EventEmitter<any>().event,
  registerTreeDataProvider: vi.fn()
};

// Mock workspace
export const workspace = {
  workspaceFolders: [{ uri: Uri.file('/mock/workspace'), name: 'mock', index: 0 }],
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string, defaultValue?: any) => defaultValue),
    update: vi.fn(),
    has: vi.fn(() => false),
    inspect: vi.fn()
  })),
  openTextDocument: vi.fn().mockResolvedValue({
    getText: () => '',
    uri: Uri.file('/mock/file.ts'),
    languageId: 'typescript',
    lineCount: 0
  }),
  onDidSaveTextDocument: new EventEmitter<any>().event,
  onDidChangeConfiguration: new EventEmitter<any>().event,
  createFileSystemWatcher: vi.fn(() => ({
    onDidChange: new EventEmitter<any>().event,
    onDidCreate: new EventEmitter<any>().event,
    onDidDelete: new EventEmitter<any>().event,
    dispose: vi.fn()
  })),
  asRelativePath: (uri: any) => typeof uri === 'string' ? uri : uri.fsPath,
  fs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn()
  }
};

// Mock commands
export const commands = {
  registerCommand: vi.fn((command: string, callback: (...args: any[]) => any) => {
    return new Disposable();
  }),
  executeCommand: vi.fn().mockResolvedValue(undefined),
  getCommands: vi.fn().mockResolvedValue([])
};

// Mock languages
export const languages = {
  createDiagnosticCollection: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
    forEach: vi.fn(),
    get: vi.fn(),
    has: vi.fn()
  })),
  registerCodeActionsProvider: vi.fn(() => new Disposable())
};

// Mock extensions
export const extensions = {
  getExtension: vi.fn().mockReturnValue(undefined)
};

// Mock env
export const env = {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue('')
  },
  openExternal: vi.fn().mockResolvedValue(true)
};

// Enums
export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export enum QuickPickItemKind {
  Separator = -1,
  Default = 0
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3
}

// Mock ThemeColor
export class ThemeColor {
  constructor(public id: string) {}
}

// Mock Diagnostic
export class Diagnostic {
  range: Range;
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
  code?: string | number;
  
  constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}

// Mock RelativePattern
export class RelativePattern {
  constructor(public base: any, public pattern: string) {}
}

// Reset all mocks
export function resetAllMocks() {
  vi.clearAllMocks();
  window.activeTextEditor = undefined;
  window.visibleTextEditors = [];
}

// Default export for easy mocking
export default {
  Disposable,
  EventEmitter,
  Uri,
  Range,
  Position,
  ThemeColor,
  Diagnostic,
  RelativePattern,
  StatusBarAlignment,
  QuickPickItemKind,
  DiagnosticSeverity,
  ViewColumn,
  window,
  workspace,
  commands,
  languages,
  extensions,
  env,
  createMockStatusBarItem,
  createMockExtensionContext,
  resetAllMocks
};
