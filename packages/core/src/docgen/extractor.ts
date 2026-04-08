/**
 * Signature Extractor
 * 
 * Parses TypeScript/JavaScript source files to extract
 * functions, classes, interfaces, and types that can be documented.
 */

import { getLogger } from '../logger';
import {
  ExtractedFunction,
  ExtractedParam,
  ExtractedClass,
  ExtractedInterface,
  ExtractedType,
  ExtractedProperty,
  ExtractedItems
} from './types';

// ============================================================================
// Regex Patterns
// ============================================================================

const PATTERNS = {
  // Match function declarations: function name(params): returnType
  functionDecl: /^(\s*)(export\s+)?(async\s+)?function\s*(\*?)\s*(\w+)\s*(<[^>]+>)?\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\s*\{/gm,
  
  // Match arrow functions: const name = (params) => or const name = async (params) =>
  arrowFunction: /^(\s*)(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+))?\s*=>/gm,
  
  // Match class declarations
  classDecl: /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)\s*(<[^>]+>)?(?:\s+extends\s+(\w+(?:<[^>]+>)?))?\s*(?:implements\s+([^{]+))?\s*\{/gm,
  
  // Match interface declarations
  interfaceDecl: /^(\s*)(export\s+)?interface\s+(\w+)\s*(<[^>]+>)?(?:\s+extends\s+([^{]+))?\s*\{/gm,
  
  // Match type alias declarations
  typeDecl: /^(\s*)(export\s+)?type\s+(\w+)\s*(<[^>]+>)?\s*=\s*([^;]+);/gm,
  
  // Match method declarations inside classes
  methodDecl: /^(\s*)(public\s+|private\s+|protected\s+)?(static\s+)?(async\s+)?(\w+)\s*(<[^>]+>)?\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\s*\{/gm,
  
  // Match property declarations
  propertyDecl: /^(\s*)(public\s+|private\s+|protected\s+)?(readonly\s+)?(static\s+)?(\w+)(\?)?\s*(?::\s*([^;=]+))?\s*(?:=\s*([^;]+))?;/gm,
  
  // Match constructor
  constructorDecl: /^(\s*)(public\s+|private\s+|protected\s+)?constructor\s*\(([^)]*)\)\s*\{/gm,
  
  // Match JSDoc comment
  jsdocComment: /\/\*\*[\s\S]*?\*\//g,
  
  // Parameter parsing
  paramPattern: /(\w+)(\?)?(?:\s*:\s*([^,=]+))?(?:\s*=\s*([^,)]+))?/g
};

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Extract all documentable items from source code
 */
export function extractItems(source: string, filePath?: string): ExtractedItems {
  const logger = getLogger();
  
  const result: ExtractedItems = {
    functions: [],
    classes: [],
    interfaces: [],
    types: []
  };
  
  const lines = source.split('\n');
  
  // Track existing documentation
  const docComments = findDocComments(source);
  
  // Extract standalone functions
  result.functions.push(...extractFunctions(source, lines, docComments));
  
  // Extract arrow functions
  result.functions.push(...extractArrowFunctions(source, lines, docComments));
  
  // Extract classes
  result.classes.push(...extractClasses(source, lines, docComments));
  
  // Extract interfaces
  result.interfaces.push(...extractInterfaces(source, lines, docComments));
  
  // Extract type aliases
  result.types.push(...extractTypes(source, lines, docComments));
  
  logger.debug('Extracted items', {
    functions: result.functions.length,
    classes: result.classes.length,
    interfaces: result.interfaces.length,
    types: result.types.length,
    file: filePath
  });
  
  return result;
}

/**
 * Find all JSDoc comments and their end line numbers
 */
function findDocComments(source: string): Map<number, string> {
  const comments = new Map<number, string>();
  const lines = source.split('\n');
  
  let inComment = false;
  let commentStart = -1;
  let commentLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Single-line JSDoc
    if (line.startsWith('/**') && line.endsWith('*/')) {
      comments.set(i + 1, line); // Maps to next line
      continue;
    }
    
    // Start of multi-line
    if (line.startsWith('/**')) {
      inComment = true;
      commentStart = i;
      commentLines = [line];
      continue;
    }
    
    if (inComment) {
      commentLines.push(line);
      
      if (line.endsWith('*/')) {
        inComment = false;
        comments.set(i + 1, commentLines.join('\n'));
        commentLines = [];
      }
    }
  }
  
  return comments;
}

/**
 * Get line number from character index
 */
function getLineNumber(source: string, index: number): number {
  return source.substring(0, index).split('\n').length;
}

/**
 * Extract function declarations
 */
function extractFunctions(
  source: string, 
  lines: string[], 
  docComments: Map<number, string>
): ExtractedFunction[] {
  const functions: ExtractedFunction[] = [];
  
  PATTERNS.functionDecl.lastIndex = 0;
  let match;
  
  while ((match = PATTERNS.functionDecl.exec(source)) !== null) {
    const [fullMatch, indent, exportKw, asyncKw, generator, name, typeParams, params, returnType] = match;
    const lineNum = getLineNumber(source, match.index);
    
    const fn: ExtractedFunction = {
      name,
      kind: 'function',
      async: !!asyncKw,
      generator: !!generator,
      params: parseParams(params || ''),
      returnType: returnType?.trim() || null,
      typeParams: typeParams ? parseTypeParams(typeParams) : undefined,
      existingDoc: docComments.get(lineNum),
      line: lineNum,
      signature: buildSignature(name, params || '', returnType, !!asyncKw, typeParams),
      body: extractBody(source, match.index + fullMatch.length - 1)
    };
    
    functions.push(fn);
  }
  
  return functions;
}

/**
 * Extract arrow function declarations
 */
function extractArrowFunctions(
  source: string,
  lines: string[],
  docComments: Map<number, string>
): ExtractedFunction[] {
  const functions: ExtractedFunction[] = [];
  
  PATTERNS.arrowFunction.lastIndex = 0;
  let match;
  
  while ((match = PATTERNS.arrowFunction.exec(source)) !== null) {
    const [fullMatch, indent, exportKw, varKw, name, asyncKw, params, returnType] = match;
    const lineNum = getLineNumber(source, match.index);
    
    const fn: ExtractedFunction = {
      name,
      kind: 'arrow',
      async: !!asyncKw,
      generator: false,
      params: parseParams(params || ''),
      returnType: returnType?.trim() || null,
      existingDoc: docComments.get(lineNum),
      line: lineNum,
      signature: buildSignature(name, params || '', returnType, !!asyncKw)
    };
    
    functions.push(fn);
  }
  
  return functions;
}

/**
 * Extract class declarations with methods
 */
function extractClasses(
  source: string,
  lines: string[],
  docComments: Map<number, string>
): ExtractedClass[] {
  const classes: ExtractedClass[] = [];
  
  PATTERNS.classDecl.lastIndex = 0;
  let match;
  
  while ((match = PATTERNS.classDecl.exec(source)) !== null) {
    const [fullMatch, indent, exportKw, abstractKw, name, typeParams, extendsClause, implementsClause] = match;
    const lineNum = getLineNumber(source, match.index);
    const classBody = extractBody(source, match.index + fullMatch.length - 1);
    
    const cls: ExtractedClass = {
      name,
      extends: extendsClause?.trim(),
      implements: implementsClause?.split(',').map(s => s.trim()),
      typeParams: typeParams ? parseTypeParams(typeParams) : undefined,
      methods: extractMethods(classBody, name, lineNum),
      properties: extractProperties(classBody, lineNum),
      existingDoc: docComments.get(lineNum),
      line: lineNum
    };
    
    // Find constructor
    const ctorMethod = cls.methods.find(m => m.kind === 'constructor');
    if (ctorMethod) {
      cls.ctor = ctorMethod;
      cls.methods = cls.methods.filter(m => m.kind !== 'constructor');
    }
    
    classes.push(cls);
  }
  
  return classes;
}

/**
 * Extract methods from class body
 */
function extractMethods(classBody: string, className: string, classStartLine: number): ExtractedFunction[] {
  const methods: ExtractedFunction[] = [];
  const docComments = findDocComments(classBody);
  
  // Extract constructor
  PATTERNS.constructorDecl.lastIndex = 0;
  let match = PATTERNS.constructorDecl.exec(classBody);
  if (match) {
    const [fullMatch, indent, access, params] = match;
    const lineNum = classStartLine + getLineNumber(classBody, match.index);
    
    methods.push({
      name: 'constructor',
      kind: 'constructor',
      async: false,
      generator: false,
      params: parseParams(params || ''),
      returnType: null,
      parent: className,
      existingDoc: docComments.get(getLineNumber(classBody, match.index)),
      line: lineNum,
      signature: `constructor(${params || ''})`
    });
  }
  
  // Extract methods
  PATTERNS.methodDecl.lastIndex = 0;
  while ((match = PATTERNS.methodDecl.exec(classBody)) !== null) {
    const [fullMatch, indent, access, staticKw, asyncKw, name, typeParams, params, returnType] = match;
    
    // Skip constructor (already handled)
    if (name === 'constructor') continue;
    
    const relativeLineNum = getLineNumber(classBody, match.index);
    const lineNum = classStartLine + relativeLineNum;
    
    methods.push({
      name,
      kind: 'method',
      async: !!asyncKw,
      generator: false,
      params: parseParams(params || ''),
      returnType: returnType?.trim() || null,
      typeParams: typeParams ? parseTypeParams(typeParams) : undefined,
      parent: className,
      existingDoc: docComments.get(relativeLineNum),
      line: lineNum,
      signature: buildSignature(name, params || '', returnType, !!asyncKw, typeParams)
    });
  }
  
  return methods;
}

/**
 * Extract properties from class body
 */
function extractProperties(classBody: string, classStartLine: number): ExtractedProperty[] {
  const properties: ExtractedProperty[] = [];
  const docComments = findDocComments(classBody);
  
  PATTERNS.propertyDecl.lastIndex = 0;
  let match;
  
  while ((match = PATTERNS.propertyDecl.exec(classBody)) !== null) {
    const [fullMatch, indent, access, readonly, staticKw, name, optional, type, defaultValue] = match;
    const relativeLineNum = getLineNumber(classBody, match.index);
    
    properties.push({
      name,
      type: type?.trim() || null,
      readonly: !!readonly,
      static: !!staticKw,
      optional: !!optional,
      defaultValue: defaultValue?.trim(),
      existingDoc: docComments.get(relativeLineNum),
      line: classStartLine + relativeLineNum
    });
  }
  
  return properties;
}

/**
 * Extract interfaces
 */
function extractInterfaces(
  source: string,
  lines: string[],
  docComments: Map<number, string>
): ExtractedInterface[] {
  const interfaces: ExtractedInterface[] = [];
  
  PATTERNS.interfaceDecl.lastIndex = 0;
  let match;
  
  while ((match = PATTERNS.interfaceDecl.exec(source)) !== null) {
    const [fullMatch, indent, exportKw, name, typeParams, extendsClause] = match;
    const lineNum = getLineNumber(source, match.index);
    const body = extractBody(source, match.index + fullMatch.length - 1);
    
    interfaces.push({
      name,
      extends: extendsClause?.split(',').map(s => s.trim()),
      typeParams: typeParams ? parseTypeParams(typeParams) : undefined,
      properties: extractInterfaceProperties(body, lineNum),
      methods: extractInterfaceMethods(body, lineNum),
      existingDoc: docComments.get(lineNum),
      line: lineNum
    });
  }
  
  return interfaces;
}

/**
 * Extract properties from interface body
 */
function extractInterfaceProperties(body: string, startLine: number): ExtractedProperty[] {
  const properties: ExtractedProperty[] = [];
  const lines = body.split('\n');
  
  // Simple property pattern: name?: type;
  const propPattern = /^\s*(\w+)(\?)?\s*:\s*([^;]+);?\s*$/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = propPattern.exec(line);
    
    if (match) {
      const [, name, optional, type] = match;
      
      // Skip if it looks like a method
      if (type.includes('=>') || type.includes('(')) continue;
      
      properties.push({
        name,
        type: type.trim(),
        readonly: line.includes('readonly'),
        static: false,
        optional: !!optional,
        line: startLine + i
      });
    }
  }
  
  return properties;
}

/**
 * Extract method signatures from interface body
 */
function extractInterfaceMethods(body: string, startLine: number): ExtractedFunction[] {
  const methods: ExtractedFunction[] = [];
  const lines = body.split('\n');
  
  // Method pattern: name(params): returnType; or name: (params) => returnType;
  const methodPattern = /^\s*(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)\s*:\s*([^;]+);?\s*$/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = methodPattern.exec(line);
    
    if (match) {
      const [, name, params, returnType] = match;
      
      methods.push({
        name,
        kind: 'method',
        async: false,
        generator: false,
        params: parseParams(params),
        returnType: returnType.trim(),
        line: startLine + i,
        signature: `${name}(${params}): ${returnType.trim()}`
      });
    }
  }
  
  return methods;
}

/**
 * Extract type aliases
 */
function extractTypes(
  source: string,
  lines: string[],
  docComments: Map<number, string>
): ExtractedType[] {
  const types: ExtractedType[] = [];
  
  PATTERNS.typeDecl.lastIndex = 0;
  let match;
  
  while ((match = PATTERNS.typeDecl.exec(source)) !== null) {
    const [fullMatch, indent, exportKw, name, typeParams, definition] = match;
    const lineNum = getLineNumber(source, match.index);
    
    types.push({
      name,
      typeParams: typeParams ? parseTypeParams(typeParams) : undefined,
      definition: definition.trim(),
      existingDoc: docComments.get(lineNum),
      line: lineNum
    });
  }
  
  return types;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse function parameters
 */
function parseParams(paramsStr: string): ExtractedParam[] {
  if (!paramsStr.trim()) return [];
  
  const params: ExtractedParam[] = [];
  
  // Split by comma, but respect nested brackets
  const paramParts = splitParams(paramsStr);
  
  for (const part of paramParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Handle destructuring - simplify to object/array
    if (trimmed.startsWith('{')) {
      params.push({
        name: 'options',
        type: 'object',
        optional: trimmed.includes('?') || trimmed.includes('='),
        defaultValue: null,
        inferredDescription: 'Configuration options'
      });
      continue;
    }
    
    if (trimmed.startsWith('[')) {
      params.push({
        name: 'items',
        type: 'array',
        optional: trimmed.includes('='),
        defaultValue: null,
        inferredDescription: 'Array of items'
      });
      continue;
    }
    
    // Parse normal parameter
    const paramMatch = /^(\w+)(\?)?\s*(?::\s*([^=]+))?\s*(?:=\s*(.+))?$/.exec(trimmed);
    
    if (paramMatch) {
      const [, name, optional, type, defaultValue] = paramMatch;
      params.push({
        name,
        type: type?.trim() || null,
        optional: !!optional || !!defaultValue,
        defaultValue: defaultValue?.trim() || null,
        inferredDescription: inferParamDescription(name)
      });
    }
  }
  
  return params;
}

/**
 * Split parameters respecting nested brackets
 */
function splitParams(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  
  for (const char of str) {
    if (char === '(' || char === '[' || char === '{' || char === '<') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}' || char === '>') {
      depth--;
    }
    
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    parts.push(current);
  }
  
  return parts;
}

/**
 * Parse type parameters like <T, U extends V>
 */
function parseTypeParams(typeParamsStr: string): string[] {
  // Remove < > brackets
  const inner = typeParamsStr.slice(1, -1);
  return splitParams(inner).map(s => s.trim());
}

/**
 * Build a readable signature
 */
function buildSignature(
  name: string,
  params: string,
  returnType: string | null | undefined,
  isAsync: boolean,
  typeParams?: string
): string {
  let sig = '';
  if (isAsync) sig += 'async ';
  sig += name;
  if (typeParams) sig += typeParams;
  sig += `(${params})`;
  if (returnType) sig += `: ${returnType.trim()}`;
  return sig;
}

/**
 * Extract body between braces
 */
function extractBody(source: string, startIndex: number): string {
  let depth = 1;
  let i = startIndex + 1;
  
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  
  return source.substring(startIndex + 1, i - 1);
}

/**
 * Infer parameter description from name
 */
function inferParamDescription(name: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/^id$/i, 'Unique identifier'],
    [/^ids$/i, 'Array of unique identifiers'],
    [/^name$/i, 'Name'],
    [/^path$/i, 'File or directory path'],
    [/^url$/i, 'URL'],
    [/^uri$/i, 'URI'],
    [/^config$/i, 'Configuration options'],
    [/^options$/i, 'Options'],
    [/^callback$/i, 'Callback function'],
    [/^cb$/i, 'Callback function'],
    [/^fn$/i, 'Function'],
    [/^handler$/i, 'Handler function'],
    [/^listener$/i, 'Event listener'],
    [/^data$/i, 'Data'],
    [/^value$/i, 'Value'],
    [/^values$/i, 'Array of values'],
    [/^input$/i, 'Input value'],
    [/^output$/i, 'Output value'],
    [/^result$/i, 'Result'],
    [/^results$/i, 'Array of results'],
    [/^error$/i, 'Error'],
    [/^err$/i, 'Error'],
    [/^message$/i, 'Message'],
    [/^msg$/i, 'Message'],
    [/^text$/i, 'Text content'],
    [/^content$/i, 'Content'],
    [/^items$/i, 'Array of items'],
    [/^list$/i, 'List of items'],
    [/^array$/i, 'Array'],
    [/^index$/i, 'Index'],
    [/^key$/i, 'Key'],
    [/^keys$/i, 'Array of keys'],
    [/^count$/i, 'Count'],
    [/^size$/i, 'Size'],
    [/^length$/i, 'Length'],
    [/^limit$/i, 'Maximum limit'],
    [/^offset$/i, 'Offset'],
    [/^page$/i, 'Page number'],
    [/^timeout$/i, 'Timeout in milliseconds'],
    [/^delay$/i, 'Delay in milliseconds'],
    [/^interval$/i, 'Interval'],
    [/^enabled$/i, 'Whether enabled'],
    [/^disabled$/i, 'Whether disabled'],
    [/^visible$/i, 'Whether visible'],
    [/^hidden$/i, 'Whether hidden'],
    [/^active$/i, 'Whether active'],
    [/^valid$/i, 'Whether valid'],
    [/^required$/i, 'Whether required'],
    [/^optional$/i, 'Whether optional'],
    [/^async$/i, 'Whether asynchronous'],
    [/^sync$/i, 'Whether synchronous'],
    [/^source$/i, 'Source'],
    [/^target$/i, 'Target'],
    [/^destination$/i, 'Destination'],
    [/^from$/i, 'Starting point'],
    [/^to$/i, 'Ending point'],
    [/^start$/i, 'Start position or value'],
    [/^end$/i, 'End position or value'],
    [/^min$/i, 'Minimum value'],
    [/^max$/i, 'Maximum value'],
    [/^user$/i, 'User'],
    [/^userId$/i, 'User ID'],
    [/^username$/i, 'Username'],
    [/^email$/i, 'Email address'],
    [/^password$/i, 'Password'],
    [/^token$/i, 'Token'],
    [/^file$/i, 'File'],
    [/^files$/i, 'Array of files'],
    [/^filename$/i, 'File name'],
    [/^filePath$/i, 'File path'],
    [/^dir$/i, 'Directory'],
    [/^directory$/i, 'Directory'],
    [/^folder$/i, 'Folder'],
    [/^pattern$/i, 'Pattern'],
    [/^regex$/i, 'Regular expression'],
    [/^format$/i, 'Format'],
    [/^type$/i, 'Type'],
    [/^kind$/i, 'Kind'],
    [/^mode$/i, 'Mode'],
    [/^status$/i, 'Status'],
    [/^state$/i, 'State'],
    [/^context$/i, 'Context'],
    [/^env$/i, 'Environment'],
    [/^environment$/i, 'Environment'],
    [/^request$/i, 'Request'],
    [/^req$/i, 'Request'],
    [/^response$/i, 'Response'],
    [/^res$/i, 'Response'],
    [/^query$/i, 'Query'],
    [/^params$/i, 'Parameters'],
    [/^args$/i, 'Arguments'],
    [/^argv$/i, 'Command-line arguments'],
    [/^props$/i, 'Properties'],
    [/^attrs$/i, 'Attributes'],
    [/^metadata$/i, 'Metadata'],
    [/^headers$/i, 'Headers'],
    [/^body$/i, 'Body'],
    [/^payload$/i, 'Payload'],
    [/^event$/i, 'Event'],
    [/^events$/i, 'Array of events'],
  ];
  
  for (const [pattern, description] of patterns) {
    if (pattern.test(name)) {
      return description;
    }
  }
  
  // Convert camelCase to words
  const words = name.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
