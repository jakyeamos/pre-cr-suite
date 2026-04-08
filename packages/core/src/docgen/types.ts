/**
 * Documentation Generator Types
 * 
 * Types for AI-powered documentation generation.
 */

/**
 * Style of documentation to generate
 */
export type DocStyle = 'jsdoc' | 'tsdoc' | 'google' | 'numpy';

/**
 * Configuration for documentation generation
 */
export interface DocGenConfig {
  /** Documentation style */
  style: DocStyle;
  /** Include @example tags */
  includeExamples: boolean;
  /** Include @throws/@exception tags */
  includeThrows: boolean;
  /** Include @see references */
  includeSeeAlso: boolean;
  /** Maximum line width for wrapping */
  maxLineWidth: number;
  /** Include type information in JSDoc (for JS files) */
  includeTypes: boolean;
}

export const DEFAULT_DOC_GEN_CONFIG: DocGenConfig = {
  style: 'jsdoc',
  includeExamples: false,
  includeThrows: true,
  includeSeeAlso: false,
  maxLineWidth: 80,
  includeTypes: true
};

/**
 * A parameter extracted from a function signature
 */
export interface ExtractedParam {
  name: string;
  type: string | null;
  optional: boolean;
  defaultValue: string | null;
  /** Inferred description based on name */
  inferredDescription?: string;
}

/**
 * A function/method extracted for documentation
 */
export interface ExtractedFunction {
  name: string;
  kind: 'function' | 'method' | 'arrow' | 'constructor' | 'getter' | 'setter';
  async: boolean;
  generator: boolean;
  params: ExtractedParam[];
  returnType: string | null;
  /** The class/object this method belongs to */
  parent?: string;
  /** Generic type parameters */
  typeParams?: string[];
  /** Existing documentation if any */
  existingDoc?: string;
  /** Line number in source */
  line: number;
  /** The full signature text */
  signature: string;
  /** Body of the function for context */
  body?: string;
  /** Cyclomatic complexity */
  complexity?: number;
  /** Number of statements in body */
  statementCount?: number;
  /** Whether this is a React component */
  isReactComponent?: boolean;
  /** Visibility modifier */
  visibility?: 'public' | 'private' | 'protected';
  /** Whether it's a static method */
  isStatic?: boolean;
}

/**
 * A class extracted for documentation
 */
export interface ExtractedClass {
  name: string;
  extends?: string;
  implements?: string[];
  typeParams?: string[];
  /** The class constructor - renamed to avoid collision with Function.constructor */
  ctor?: ExtractedFunction;
  methods: ExtractedFunction[];
  properties: ExtractedProperty[];
  existingDoc?: string;
  line: number;
  /** Whether this is a React component class */
  isReactComponent?: boolean;
}

/**
 * A property extracted for documentation
 */
export interface ExtractedProperty {
  name: string;
  type: string | null;
  readonly: boolean;
  static: boolean;
  optional: boolean;
  defaultValue?: string | null;
  existingDoc?: string;
  line: number;
}

/**
 * An interface extracted for documentation
 */
export interface ExtractedInterface {
  name: string;
  extends?: string[];
  typeParams?: string[];
  properties: ExtractedProperty[];
  methods?: ExtractedFunction[];
  existingDoc?: string;
  line: number;
}

/**
 * A type alias extracted for documentation
 */
export interface ExtractedType {
  name: string;
  typeParams?: string[];
  definition: string;
  existingDoc?: string;
  line: number;
}

/**
 * All extractable items from a source file
 */
export interface ExtractedItems {
  functions: ExtractedFunction[];
  classes: ExtractedClass[];
  interfaces: ExtractedInterface[];
  types: ExtractedType[];
}

/**
 * Generated documentation for a single item
 */
export interface GeneratedDoc {
  /** The documentation comment text */
  text: string;
  /** Line to insert before */
  insertLine: number;
  /** Name of the item being documented */
  itemName: string;
  /** Kind of item */
  itemKind: 'function' | 'class' | 'interface' | 'type' | 'property' | 'method';
}

/**
 * Result of documentation generation
 */
export interface DocGenResult {
  /** Generated documentation blocks */
  docs: GeneratedDoc[];
  /** Items that were skipped (already documented) */
  skipped: string[];
  /** Items that couldn't be processed */
  errors: Array<{ item: string; error: string }>;
}

/**
 * Context for AI-assisted generation
 */
export interface DocGenContext {
  /** The extracted function/class/etc */
  item: ExtractedFunction | ExtractedClass | ExtractedInterface | ExtractedType;
  /** Surrounding code for context */
  surroundingCode?: string;
  /** Related items (e.g., interface a function implements) */
  relatedItems?: string[];
  /** Project description if available */
  projectDescription?: string;
}

/**
 * Prompt template for AI generation
 */
export interface DocGenPrompt {
  /** System prompt */
  system: string;
  /** User prompt with item details */
  user: string;
  /** Expected format */
  format: DocStyle;
}
