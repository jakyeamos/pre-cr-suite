/**
 * AST-Based Signature Extractor
 * 
 * Uses TypeScript compiler API for accurate parsing of:
 * - Functions, arrow functions, methods
 * - Classes, interfaces, type aliases
 * - React components (function and class-based)
 * - Getters, setters, object methods
 * 
 * Includes smart filtering to skip trivial items.
 */

import * as ts from 'typescript';
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
// Configuration
// ============================================================================

export interface ExtractorConfig {
  /** Skip trivial getters/setters (single return/assignment) */
  skipTrivialAccessors: boolean;
  /** Skip functions with less than N statements */
  minStatements: number;
  /** Skip functions with less than N parameters */
  minParams: number;
  /** Skip private members */
  skipPrivate: boolean;
  /** Skip items that already have JSDoc */
  skipDocumented: boolean;
  /** Include React components */
  includeReactComponents: boolean;
}

const DEFAULT_CONFIG: ExtractorConfig = {
  skipTrivialAccessors: true,
  minStatements: 0,
  minParams: 0,
  skipPrivate: false,
  skipDocumented: true,
  includeReactComponents: true
};

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract all documentable items from source code using TypeScript AST
 */
export function extractItemsAST(
  source: string, 
  filePath: string = 'file.ts',
  config: Partial<ExtractorConfig> = {}
): ExtractedItems {
  const logger = getLogger();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const result: ExtractedItems = {
    functions: [],
    classes: [],
    interfaces: [],
    types: []
  };

  // Create source file
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  // Visit all nodes
  const visit = (node: ts.Node) => {
    // Function declaration
    if (ts.isFunctionDeclaration(node) && node.name) {
      const fn = extractFunction(node, sourceFile, cfg);
      if (fn && shouldIncludeFunction(fn, cfg)) {
        result.functions.push(fn);
      }
    }
    
    // Arrow function / function expression assigned to variable
    else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && ts.isIdentifier(decl.name)) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            const fn = extractArrowOrExpression(decl, sourceFile, cfg);
            if (fn && shouldIncludeFunction(fn, cfg)) {
              result.functions.push(fn);
            }
          }
        }
      }
    }
    
    // Class declaration
    else if (ts.isClassDeclaration(node) && node.name) {
      const cls = extractClass(node, sourceFile, cfg);
      if (cls) {
        result.classes.push(cls);
      }
    }
    
    // Interface declaration
    else if (ts.isInterfaceDeclaration(node)) {
      const iface = extractInterface(node, sourceFile, cfg);
      if (iface) {
        result.interfaces.push(iface);
      }
    }
    
    // Type alias declaration
    else if (ts.isTypeAliasDeclaration(node)) {
      const type = extractTypeAlias(node, sourceFile, cfg);
      if (type) {
        result.types.push(type);
      }
    }

    // Continue visiting children
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  logger.debug('AST extracted items', {
    functions: result.functions.length,
    classes: result.classes.length,
    interfaces: result.interfaces.length,
    types: result.types.length,
    file: filePath
  });

  return result;
}

// ============================================================================
// Function Extraction
// ============================================================================

function extractFunction(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedFunction | null {
  if (!node.name) return null;

  const name = node.name.text;
  const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const existingDoc = getJSDocComment(node, sourceFile);

  if (config.skipDocumented && existingDoc) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = node.type ? node.type.getText(sourceFile) : inferReturnType(node);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
  const isGenerator = !!node.asteriskToken;
  const complexity = calculateComplexity(node);
  const statementCount = countStatements(node.body);

  return {
    name,
    kind: 'function',
    async: isAsync,
    generator: isGenerator,
    params,
    returnType,
    typeParams: extractTypeParams(node.typeParameters, sourceFile),
    existingDoc,
    line: lineNum,
    signature: buildSignatureFromNode(node, sourceFile),
    body: node.body?.getText(sourceFile),
    complexity,
    statementCount,
    isReactComponent: isReactComponent(node, sourceFile)
  };
}

function extractArrowOrExpression(
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedFunction | null {
  if (!ts.isIdentifier(decl.name)) return null;
  if (!decl.initializer) return null;

  const func = decl.initializer as ts.ArrowFunction | ts.FunctionExpression;
  const name = decl.name.text;
  const lineNum = sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;
  
  // Get JSDoc from variable statement parent
  const varStatement = decl.parent?.parent;
  const existingDoc = varStatement ? getJSDocComment(varStatement as ts.Node, sourceFile) : undefined;

  if (config.skipDocumented && existingDoc) return null;

  const params = extractParams(func.parameters, sourceFile);
  const returnType = func.type?.getText(sourceFile) || inferReturnType(func);
  const isAsync = hasModifier(func, ts.SyntaxKind.AsyncKeyword);
  const complexity = calculateComplexity(func);
  const statementCount = countStatements(ts.isArrowFunction(func) ? func.body : (func as ts.FunctionExpression).body);

  return {
    name,
    kind: ts.isArrowFunction(func) ? 'arrow' : 'function',
    async: isAsync,
    generator: false,
    params,
    returnType,
    typeParams: extractTypeParams(func.typeParameters, sourceFile),
    existingDoc,
    line: lineNum,
    signature: `${isAsync ? 'async ' : ''}${name}(${params.map(p => p.name).join(', ')})`,
    complexity,
    statementCount,
    isReactComponent: isReactComponent(func, sourceFile, name)
  };
}

// ============================================================================
// Class Extraction
// ============================================================================

function extractClass(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedClass | null {
  if (!node.name) return null;

  const name = node.name.text;
  const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const existingDoc = getJSDocComment(node, sourceFile);

  if (config.skipDocumented && existingDoc) return null;

  const methods: ExtractedFunction[] = [];
  const properties: ExtractedProperty[] = [];
  let ctor: ExtractedFunction | undefined;

  for (const member of node.members) {
    // Constructor
    if (ts.isConstructorDeclaration(member)) {
      ctor = extractConstructor(member, sourceFile, config);
    }
    // Method
    else if (ts.isMethodDeclaration(member) && member.name) {
      const method = extractMethod(member, sourceFile, config);
      if (method && shouldIncludeMethod(method, member, config)) {
        methods.push(method);
      }
    }
    // Getter
    else if (ts.isGetAccessorDeclaration(member) && member.name) {
      const getter = extractAccessor(member, 'getter', sourceFile, config);
      if (getter && shouldIncludeAccessor(member, config)) {
        methods.push(getter);
      }
    }
    // Setter
    else if (ts.isSetAccessorDeclaration(member) && member.name) {
      const setter = extractAccessor(member, 'setter', sourceFile, config);
      if (setter && shouldIncludeAccessor(member, config)) {
        methods.push(setter);
      }
    }
    // Property
    else if (ts.isPropertyDeclaration(member) && member.name) {
      const prop = extractProperty(member, sourceFile, config);
      if (prop) {
        properties.push(prop);
      }
    }
  }

  // Get extends/implements
  let extendsClause: string | undefined;
  let implementsClause: string[] | undefined;

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        extendsClause = clause.types[0]?.getText(sourceFile);
      } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
        implementsClause = clause.types.map(t => t.getText(sourceFile));
      }
    }
  }

  return {
    name,
    extends: extendsClause,
    implements: implementsClause,
    typeParams: extractTypeParams(node.typeParameters, sourceFile),
    methods,
    properties,
    ctor,
    existingDoc,
    line: lineNum,
    isReactComponent: isReactClassComponent(node)
  };
}

function extractConstructor(
  node: ts.ConstructorDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedFunction {
  const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const existingDoc = getJSDocComment(node, sourceFile);
  const params = extractParams(node.parameters, sourceFile);

  return {
    name: 'constructor',
    kind: 'constructor',
    async: false,
    generator: false,
    params,
    returnType: null,
    existingDoc,
    line: lineNum,
    signature: `constructor(${params.map(p => p.name).join(', ')})`,
    statementCount: countStatements(node.body)
  };
}

function extractMethod(
  node: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedFunction | null {
  if (!node.name) return null;

  const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
  const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const existingDoc = getJSDocComment(node, sourceFile);

  if (config.skipDocumented && existingDoc) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = node.type?.getText(sourceFile) || inferReturnType(node);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
  const isStatic = hasModifier(node, ts.SyntaxKind.StaticKeyword);
  const visibility = getVisibility(node);

  if (config.skipPrivate && visibility === 'private') return null;

  return {
    name,
    kind: 'method',
    async: isAsync,
    generator: !!node.asteriskToken,
    params,
    returnType,
    typeParams: extractTypeParams(node.typeParameters, sourceFile),
    existingDoc,
    line: lineNum,
    signature: `${visibility} ${isStatic ? 'static ' : ''}${isAsync ? 'async ' : ''}${name}(${params.map(p => p.name).join(', ')})`,
    complexity: calculateComplexity(node),
    statementCount: countStatements(node.body),
    visibility,
    isStatic
  };
}

function extractAccessor(
  node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  kind: 'getter' | 'setter',
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedFunction | null {
  if (!node.name) return null;

  const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
  const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const existingDoc = getJSDocComment(node, sourceFile);

  if (config.skipDocumented && existingDoc) return null;

  const visibility = getVisibility(node);
  if (config.skipPrivate && visibility === 'private') return null;

  return {
    name,
    kind,
    async: false,
    generator: false,
    params: ts.isSetAccessorDeclaration(node) ? extractParams(node.parameters, sourceFile) : [],
    returnType: ts.isGetAccessorDeclaration(node) ? node.type?.getText(sourceFile) || null : null,
    existingDoc,
    line: lineNum,
    signature: `${kind} ${name}`,
    visibility
  };
}

function extractProperty(
  node: ts.PropertyDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedProperty | null {
  if (!node.name) return null;

  const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
  const visibility = getVisibility(node);

  if (config.skipPrivate && visibility === 'private') return null;

  const existingDoc = getJSDocComment(node, sourceFile);
  if (config.skipDocumented && existingDoc) return null;

  return {
    name,
    type: node.type?.getText(sourceFile) || null,
    optional: !!node.questionToken,
    readonly: hasModifier(node, ts.SyntaxKind.ReadonlyKeyword),
    static: hasModifier(node, ts.SyntaxKind.StaticKeyword),
    defaultValue: node.initializer?.getText(sourceFile) || null,
    existingDoc,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
  };
}

// ============================================================================
// Interface & Type Extraction
// ============================================================================

function extractInterface(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedInterface | null {
  const name = node.name.text;
  const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const existingDoc = getJSDocComment(node, sourceFile);

  if (config.skipDocumented && existingDoc) return null;

  const properties: ExtractedProperty[] = [];

  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const propName = ts.isIdentifier(member.name) ? member.name.text : member.name.getText(sourceFile);
      properties.push({
        name: propName,
        type: member.type?.getText(sourceFile) || null,
        optional: !!member.questionToken,
        readonly: hasModifier(member, ts.SyntaxKind.ReadonlyKeyword),
        static: false,
        defaultValue: null,
        line: sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
      });
    }
  }

  let extendsClause: string[] | undefined;
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        extendsClause = clause.types.map(t => t.getText(sourceFile));
      }
    }
  }

  return {
    name,
    extends: extendsClause,
    typeParams: extractTypeParams(node.typeParameters, sourceFile),
    properties,
    existingDoc,
    line: lineNum
  };
}

function extractTypeAlias(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  config: ExtractorConfig
): ExtractedType | null {
  const name = node.name.text;
  const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const existingDoc = getJSDocComment(node, sourceFile);

  if (config.skipDocumented && existingDoc) return null;

  return {
    name,
    typeParams: extractTypeParams(node.typeParameters, sourceFile),
    definition: node.type.getText(sourceFile),
    existingDoc,
    line: lineNum
  };
}

// ============================================================================
// Parameter Extraction
// ============================================================================

function extractParams(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile
): ExtractedParam[] {
  return parameters.map(param => {
    let name: string;
    
    if (ts.isIdentifier(param.name)) {
      name = param.name.text;
    } else if (ts.isObjectBindingPattern(param.name)) {
      name = 'options';
    } else if (ts.isArrayBindingPattern(param.name)) {
      name = 'items';
    } else {
      // Fallback for any other binding pattern
      name = 'param';
    }

    return {
      name,
      type: param.type?.getText(sourceFile) || null,
      optional: !!param.questionToken || !!param.initializer,
      defaultValue: param.initializer?.getText(sourceFile) || null,
      inferredDescription: inferParamDescription(name)
    };
  });
}

function extractTypeParams(
  typeParams: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
  sourceFile: ts.SourceFile
): string[] | undefined {
  if (!typeParams || typeParams.length === 0) return undefined;
  return typeParams.map(tp => tp.getText(sourceFile));
}

// ============================================================================
// Smart Filtering
// ============================================================================

function shouldIncludeFunction(fn: ExtractedFunction, config: ExtractorConfig): boolean {
  // Always include React components
  if (fn.isReactComponent && config.includeReactComponents) return true;

  // Skip if already documented
  if (config.skipDocumented && fn.existingDoc) return false;

  // Check minimum statements
  if (fn.statementCount !== undefined && fn.statementCount < config.minStatements) return false;

  // Check minimum params
  if (fn.params.length < config.minParams) return false;

  // Skip trivial functions
  if (isTrivialFunction(fn)) return false;

  return true;
}

function shouldIncludeMethod(
  method: ExtractedFunction,
  node: ts.MethodDeclaration,
  config: ExtractorConfig
): boolean {
  // Skip trivial getters like getName() { return this.name; }
  if (isTrivialGetter(node)) return false;

  // Skip trivial setters like setName(name) { this.name = name; }
  if (isTrivialSetter(node)) return false;

  return shouldIncludeFunction(method, config);
}

function shouldIncludeAccessor(
  node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  config: ExtractorConfig
): boolean {
  if (!config.skipTrivialAccessors) return true;

  // Check if accessor is trivial (single return/assignment)
  if (node.body) {
    const statements = node.body.statements;
    if (statements.length === 1) {
      const stmt = statements[0];
      // get x() { return this._x; }
      if (ts.isReturnStatement(stmt)) return false;
      // set x(v) { this._x = v; }
      if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression)) {
        if (stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) return false;
      }
    }
  }

  return true;
}

function isTrivialFunction(fn: ExtractedFunction): boolean {
  // Skip very short functions with no params
  if (fn.params.length === 0 && (fn.statementCount || 0) <= 1) {
    // Unless it's a factory or has a complex name
    if (!fn.name.match(/^(create|build|make|get|init|setup)/i)) {
      return true;
    }
  }

  // Skip obvious ID getters
  if (fn.name.match(/^(get|is|has)[A-Z]/) && fn.params.length === 0 && (fn.statementCount || 0) <= 1) {
    return true;
  }

  return false;
}

function isTrivialGetter(node: ts.MethodDeclaration): boolean {
  const name = ts.isIdentifier(node.name) ? node.name.text : '';
  
  // Check if it's a getX() pattern
  if (!name.match(/^get[A-Z]/)) return false;

  // Check if body is just `return this.x`
  if (node.body && node.body.statements.length === 1) {
    const stmt = node.body.statements[0];
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      if (ts.isPropertyAccessExpression(stmt.expression)) {
        if (stmt.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
          return true;
        }
      }
    }
  }

  return false;
}

function isTrivialSetter(node: ts.MethodDeclaration): boolean {
  const name = ts.isIdentifier(node.name) ? node.name.text : '';
  
  // Check if it's a setX() pattern
  if (!name.match(/^set[A-Z]/)) return false;

  // Check if body is just `this.x = value`
  if (node.body && node.body.statements.length === 1) {
    const stmt = node.body.statements[0];
    if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression)) {
      const expr = stmt.expression;
      if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isPropertyAccessExpression(expr.left)) {
          if (expr.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// ============================================================================
// React Component Detection
// ============================================================================

function isReactComponent(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  name?: string
): boolean {
  const funcName = name || (ts.isFunctionDeclaration(node) && node.name ? node.name.text : '');
  
  // Check if name starts with uppercase (React convention)
  if (!funcName || !funcName.match(/^[A-Z]/)) return false;

  // Check if return type mentions JSX or React
  if (node.type) {
    const returnType = node.type.getText(sourceFile);
    if (returnType.match(/JSX\.Element|React\.|ReactNode|ReactElement/)) return true;
  }

  // Check if body returns JSX
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    if (node.body && ts.isBlock(node.body)) {
      return containsJSXReturn(node.body);
    }
  } else if (ts.isArrowFunction(node)) {
    // Arrow function with direct JSX return
    if (ts.isJsxElement(node.body) || ts.isJsxFragment(node.body) || ts.isJsxSelfClosingElement(node.body)) {
      return true;
    }
    if (ts.isBlock(node.body)) {
      return containsJSXReturn(node.body);
    }
    if (ts.isParenthesizedExpression(node.body)) {
      const inner = node.body.expression;
      return ts.isJsxElement(inner) || ts.isJsxFragment(inner) || ts.isJsxSelfClosingElement(inner);
    }
  }

  return false;
}

function containsJSXReturn(block: ts.Block): boolean {
  for (const stmt of block.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      if (ts.isJsxElement(stmt.expression) || 
          ts.isJsxFragment(stmt.expression) || 
          ts.isJsxSelfClosingElement(stmt.expression) ||
          ts.isParenthesizedExpression(stmt.expression)) {
        return true;
      }
    }
  }
  return false;
}

function isReactClassComponent(node: ts.ClassDeclaration): boolean {
  if (!node.heritageClauses) return false;

  for (const clause of node.heritageClauses) {
    if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
      for (const type of clause.types) {
        const text = type.getText();
        if (text.match(/^(React\.)?Component|^(React\.)?PureComponent/)) {
          return true;
        }
      }
    }
  }

  return false;
}

// ============================================================================
// Complexity Analysis
// ============================================================================

function calculateComplexity(node: ts.Node): number {
  let complexity = 1;

  const visit = (n: ts.Node) => {
    switch (n.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.CaseClause:
        complexity++;
        break;
      case ts.SyntaxKind.BinaryExpression:
        const binExpr = n as ts.BinaryExpression;
        if (binExpr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            binExpr.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            binExpr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
          complexity++;
        }
        break;
    }
    ts.forEachChild(n, visit);
  };

  visit(node);
  return complexity;
}

function countStatements(body: ts.Block | ts.ConciseBody | undefined): number {
  if (!body) return 0;
  if (ts.isBlock(body)) {
    return body.statements.length;
  }
  return 1; // Arrow function with expression body
}

// ============================================================================
// Helpers
// ============================================================================

function getJSDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const nodeStart = node.getFullStart();
  const leadingComments = ts.getLeadingCommentRanges(fullText, nodeStart);

  if (leadingComments) {
    for (const comment of leadingComments) {
      const commentText = fullText.slice(comment.pos, comment.end);
      if (commentText.startsWith('/**')) {
        return commentText;
      }
    }
  }

  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return modifiers?.some(m => m.kind === kind) || false;
}

function getVisibility(node: ts.Node): 'public' | 'private' | 'protected' {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) return 'private';
  if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) return 'protected';
  return 'public';
}

function inferReturnType(node: ts.FunctionLikeDeclaration): string | null {
  // Could implement type inference here
  return null;
}

function buildSignatureFromNode(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): string {
  const name = node.name?.text || 'anonymous';
  const params = node.parameters.map(p => p.getText(sourceFile)).join(', ');
  const returnType = node.type?.getText(sourceFile);
  const asyncKw = hasModifier(node, ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';
  
  let sig = `${asyncKw}${name}(${params})`;
  if (returnType) sig += `: ${returnType}`;
  return sig;
}

function inferParamDescription(name: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/^id$/i, 'Unique identifier'],
    [/^name$/i, 'Name'],
    [/^path$/i, 'File or directory path'],
    [/^url$/i, 'URL'],
    [/^config$/i, 'Configuration options'],
    [/^options$/i, 'Options'],
    [/^callback$/i, 'Callback function'],
    [/^data$/i, 'Data'],
    [/^value$/i, 'Value'],
    [/^error$/i, 'Error'],
    [/^message$/i, 'Message'],
    [/^index$/i, 'Index'],
    [/^key$/i, 'Key'],
    [/^count$/i, 'Count'],
    [/^timeout$/i, 'Timeout in milliseconds'],
    [/^enabled$/i, 'Whether enabled'],
    [/^source$/i, 'Source'],
    [/^target$/i, 'Target'],
    [/^event$/i, 'Event'],
    [/^props$/i, 'Properties'],
    [/^children$/i, 'Child elements'],
    [/^className$/i, 'CSS class name'],
    [/^style$/i, 'Style object'],
    [/^ref$/i, 'Reference'],
    [/^state$/i, 'State'],
    [/^dispatch$/i, 'Dispatch function'],
  ];

  for (const [pattern, description] of patterns) {
    if (pattern.test(name)) return description;
  }

  // Convert camelCase to words
  const words = name.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
