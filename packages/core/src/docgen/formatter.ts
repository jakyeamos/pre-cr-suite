/**
 * Documentation Formatter
 * 
 * Generates JSDoc/TSDoc documentation from extracted items.
 * Can generate template documentation or use AI for richer descriptions.
 */

import { getLogger } from '../logger';
import {
  DocGenConfig,
  DocStyle,
  ExtractedFunction,
  ExtractedClass,
  ExtractedInterface,
  ExtractedType,
  ExtractedParam,
  ExtractedProperty,
  GeneratedDoc,
  DocGenResult,
  DocGenPrompt,
  DEFAULT_DOC_GEN_CONFIG
} from './types';
import { extractItems } from './extractor';

// ============================================================================
// Main Generation Functions
// ============================================================================

/**
 * Generate documentation for all undocumented items in source
 */
export function generateDocs(
  source: string,
  config: Partial<DocGenConfig> = {}
): DocGenResult {
  const logger = getLogger();
  const fullConfig: DocGenConfig = { ...DEFAULT_DOC_GEN_CONFIG, ...config };
  
  const items = extractItems(source);
  const docs: GeneratedDoc[] = [];
  const skipped: string[] = [];
  const errors: Array<{ item: string; error: string }> = [];
  
  // Generate for functions
  for (const fn of items.functions) {
    if (fn.existingDoc) {
      skipped.push(fn.name);
      continue;
    }
    
    try {
      const doc = generateFunctionDoc(fn, fullConfig);
      docs.push(doc);
    } catch (err) {
      errors.push({ item: fn.name, error: String(err) });
    }
  }
  
  // Generate for classes
  for (const cls of items.classes) {
    if (cls.existingDoc) {
      skipped.push(cls.name);
    } else {
      try {
        const doc = generateClassDoc(cls, fullConfig);
        docs.push(doc);
      } catch (err) {
        errors.push({ item: cls.name, error: String(err) });
      }
    }
    
    // Generate for undocumented methods
    for (const method of cls.methods) {
      if (method.existingDoc) {
        skipped.push(`${cls.name}.${method.name}`);
        continue;
      }
      
      try {
        const doc = generateFunctionDoc(method, fullConfig);
        docs.push(doc);
      } catch (err) {
        errors.push({ item: `${cls.name}.${method.name}`, error: String(err) });
      }
    }
  }
  
  // Generate for interfaces
  for (const iface of items.interfaces) {
    if (iface.existingDoc) {
      skipped.push(iface.name);
      continue;
    }
    
    try {
      const doc = generateInterfaceDoc(iface, fullConfig);
      docs.push(doc);
    } catch (err) {
      errors.push({ item: iface.name, error: String(err) });
    }
  }
  
  // Generate for types
  for (const type of items.types) {
    if (type.existingDoc) {
      skipped.push(type.name);
      continue;
    }
    
    try {
      const doc = generateTypeDoc(type, fullConfig);
      docs.push(doc);
    } catch (err) {
      errors.push({ item: type.name, error: String(err) });
    }
  }
  
  logger.info('Documentation generation complete', {
    generated: docs.length,
    skipped: skipped.length,
    errors: errors.length
  });
  
  return { docs, skipped, errors };
}

/**
 * Generate documentation for a single function
 */
export function generateFunctionDoc(
  fn: ExtractedFunction,
  config: DocGenConfig = DEFAULT_DOC_GEN_CONFIG
): GeneratedDoc {
  const lines: string[] = ['/**'];
  
  // Description
  const description = inferFunctionDescription(fn);
  lines.push(` * ${description}`);
  
  // Add blank line before tags if we have any
  if (fn.params.length > 0 || fn.returnType || fn.typeParams) {
    lines.push(' *');
  }
  
  // Type parameters
  if (fn.typeParams) {
    for (const tp of fn.typeParams) {
      const name = tp.split(' ')[0]; // Handle "T extends Foo"
      lines.push(` * @template ${tp}`);
    }
  }
  
  // Parameters
  for (const param of fn.params) {
    const paramDoc = formatParam(param, config);
    lines.push(` * ${paramDoc}`);
  }
  
  // Return type
  if (fn.returnType && fn.returnType !== 'void' && fn.kind !== 'constructor') {
    const returnDesc = inferReturnDescription(fn);
    if (config.includeTypes && fn.returnType) {
      lines.push(` * @returns {${fn.returnType}} ${returnDesc}`);
    } else {
      lines.push(` * @returns ${returnDesc}`);
    }
  }
  
  // Throws
  if (config.includeThrows && mightThrow(fn)) {
    lines.push(` * @throws {Error} If operation fails`);
  }
  
  // Example
  if (config.includeExamples) {
    lines.push(' *');
    lines.push(' * @example');
    lines.push(` * ${generateExample(fn)}`);
  }
  
  lines.push(' */');
  
  return {
    text: lines.join('\n'),
    insertLine: fn.line,
    itemName: fn.name,
    itemKind: fn.kind === 'method' ? 'method' : 'function'
  };
}

/**
 * Generate documentation for a class
 */
export function generateClassDoc(
  cls: ExtractedClass,
  config: DocGenConfig = DEFAULT_DOC_GEN_CONFIG
): GeneratedDoc {
  const lines: string[] = ['/**'];
  
  // Description
  const description = inferClassDescription(cls);
  lines.push(` * ${description}`);
  
  // Type parameters
  if (cls.typeParams) {
    lines.push(' *');
    for (const tp of cls.typeParams) {
      lines.push(` * @template ${tp}`);
    }
  }
  
  // Extends
  if (cls.extends) {
    lines.push(' *');
    lines.push(` * @extends ${cls.extends}`);
  }
  
  // Implements
  if (cls.implements && cls.implements.length > 0) {
    for (const impl of cls.implements) {
      lines.push(` * @implements ${impl}`);
    }
  }
  
  // Example
  if (config.includeExamples) {
    lines.push(' *');
    lines.push(' * @example');
    lines.push(` * const instance = new ${cls.name}();`);
  }
  
  lines.push(' */');
  
  return {
    text: lines.join('\n'),
    insertLine: cls.line,
    itemName: cls.name,
    itemKind: 'class'
  };
}

/**
 * Generate documentation for an interface
 */
export function generateInterfaceDoc(
  iface: ExtractedInterface,
  config: DocGenConfig = DEFAULT_DOC_GEN_CONFIG
): GeneratedDoc {
  const lines: string[] = ['/**'];
  
  // Description
  const description = inferInterfaceDescription(iface);
  lines.push(` * ${description}`);
  
  // Type parameters
  if (iface.typeParams) {
    lines.push(' *');
    for (const tp of iface.typeParams) {
      lines.push(` * @template ${tp}`);
    }
  }
  
  // Extends
  if (iface.extends && iface.extends.length > 0) {
    lines.push(' *');
    for (const ext of iface.extends) {
      lines.push(` * @extends ${ext}`);
    }
  }
  
  // Properties
  if (iface.properties.length > 0) {
    lines.push(' *');
    for (const prop of iface.properties) {
      const optional = prop.optional ? ' (optional)' : '';
      const type = prop.type ? ` - ${prop.type}` : '';
      lines.push(` * @property {${prop.type || 'unknown'}} ${prop.name}${optional}${type ? '' : ''}`);
    }
  }
  
  lines.push(' */');
  
  return {
    text: lines.join('\n'),
    insertLine: iface.line,
    itemName: iface.name,
    itemKind: 'interface'
  };
}

/**
 * Generate documentation for a type alias
 */
export function generateTypeDoc(
  type: ExtractedType,
  config: DocGenConfig = DEFAULT_DOC_GEN_CONFIG
): GeneratedDoc {
  const lines: string[] = ['/**'];
  
  // Description
  const description = inferTypeDescription(type);
  lines.push(` * ${description}`);
  
  // Type parameters
  if (type.typeParams) {
    lines.push(' *');
    for (const tp of type.typeParams) {
      lines.push(` * @template ${tp}`);
    }
  }
  
  // Type definition
  if (type.definition.includes('|')) {
    lines.push(' *');
    lines.push(` * @typedef {${type.definition}} ${type.name}`);
  }
  
  lines.push(' */');
  
  return {
    text: lines.join('\n'),
    insertLine: type.line,
    itemName: type.name,
    itemKind: 'type'
  };
}

// ============================================================================
// AI Prompt Generation
// ============================================================================

/**
 * Generate prompt for AI-assisted documentation
 */
export function generateAIPrompt(
  fn: ExtractedFunction,
  config: DocGenConfig = DEFAULT_DOC_GEN_CONFIG
): DocGenPrompt {
  const system = `You are a documentation expert. Generate concise, accurate JSDoc documentation for TypeScript/JavaScript code. 
Follow these rules:
- Be concise but informative
- Use present tense ("Returns" not "Will return")
- Start description with a verb
- Don't repeat type information that's already in the signature
- Focus on WHAT the function does and WHY you'd use it
- For parameters, explain their purpose, not just their type`;

  const paramsDesc = fn.params
    .map(p => `  - ${p.name}: ${p.type || 'unknown'}${p.optional ? ' (optional)' : ''}`)
    .join('\n');

  const user = `Generate JSDoc for this function:

\`\`\`typescript
${fn.signature}
\`\`\`

${fn.body ? `Function body preview:
\`\`\`typescript
${fn.body.slice(0, 500)}${fn.body.length > 500 ? '...' : ''}
\`\`\`` : ''}

Parameters:
${paramsDesc || '  (none)'}

Return type: ${fn.returnType || 'void'}

${fn.parent ? `This is a method of class: ${fn.parent}` : ''}

Generate ONLY the JSDoc comment, no code. Start with /** and end with */`;

  return {
    system,
    user,
    format: config.style
  };
}

// ============================================================================
// Description Inference
// ============================================================================

/**
 * Infer function description from name and context
 */
function inferFunctionDescription(fn: ExtractedFunction): string {
  const name = fn.name;
  
  // Handle common prefixes
  if (name.startsWith('get')) {
    const subject = camelToWords(name.slice(3));
    return `Gets the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('set')) {
    const subject = camelToWords(name.slice(3));
    return `Sets the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('is') || name.startsWith('has') || name.startsWith('can')) {
    const subject = camelToWords(name);
    return `Checks ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('create')) {
    const subject = camelToWords(name.slice(6));
    return `Creates a new ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('delete') || name.startsWith('remove')) {
    const prefix = name.startsWith('delete') ? 6 : 6;
    const subject = camelToWords(name.slice(prefix));
    return `Removes the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('update')) {
    const subject = camelToWords(name.slice(6));
    return `Updates the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('fetch') || name.startsWith('load')) {
    const prefix = name.startsWith('fetch') ? 5 : 4;
    const subject = camelToWords(name.slice(prefix));
    return `Fetches the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('save') || name.startsWith('store')) {
    const prefix = name.startsWith('save') ? 4 : 5;
    const subject = camelToWords(name.slice(prefix));
    return `Saves the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('validate')) {
    const subject = camelToWords(name.slice(8));
    return `Validates the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('parse')) {
    const subject = camelToWords(name.slice(5));
    return `Parses the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('format')) {
    const subject = camelToWords(name.slice(6));
    return `Formats the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('convert')) {
    const subject = camelToWords(name.slice(7));
    return `Converts the ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('handle')) {
    const subject = camelToWords(name.slice(6));
    return `Handles ${subject.toLowerCase()}.`;
  }
  
  if (name.startsWith('on')) {
    const subject = camelToWords(name.slice(2));
    return `Handles the ${subject.toLowerCase()} event.`;
  }
  
  if (name === 'constructor') {
    return `Creates a new ${fn.parent || 'instance'}.`;
  }
  
  // Default
  const words = camelToWords(name);
  return `${words.charAt(0).toUpperCase() + words.slice(1)}.`;
}

/**
 * Infer class description from name
 */
function inferClassDescription(cls: ExtractedClass): string {
  const name = cls.name;
  
  if (name.endsWith('Service')) {
    return `Service for ${camelToWords(name.slice(0, -7)).toLowerCase()} operations.`;
  }
  
  if (name.endsWith('Controller')) {
    return `Controller for ${camelToWords(name.slice(0, -10)).toLowerCase()}.`;
  }
  
  if (name.endsWith('Manager')) {
    return `Manages ${camelToWords(name.slice(0, -7)).toLowerCase()}.`;
  }
  
  if (name.endsWith('Handler')) {
    return `Handles ${camelToWords(name.slice(0, -7)).toLowerCase()}.`;
  }
  
  if (name.endsWith('Factory')) {
    return `Factory for creating ${camelToWords(name.slice(0, -7)).toLowerCase()} instances.`;
  }
  
  if (name.endsWith('Builder')) {
    return `Builder for constructing ${camelToWords(name.slice(0, -7)).toLowerCase()} objects.`;
  }
  
  if (name.endsWith('Repository')) {
    return `Repository for ${camelToWords(name.slice(0, -10)).toLowerCase()} data access.`;
  }
  
  if (name.endsWith('Client')) {
    return `Client for ${camelToWords(name.slice(0, -6)).toLowerCase()} API.`;
  }
  
  if (name.endsWith('Error') || name.endsWith('Exception')) {
    return `Error thrown when ${camelToWords(name.replace(/Error$|Exception$/, '')).toLowerCase()} fails.`;
  }
  
  return `Represents a ${camelToWords(name).toLowerCase()}.`;
}

/**
 * Infer interface description from name
 */
function inferInterfaceDescription(iface: ExtractedInterface): string {
  const name = iface.name;
  
  if (name.endsWith('Options') || name.endsWith('Config')) {
    const subject = name.endsWith('Options') ? name.slice(0, -7) : name.slice(0, -6);
    return `Configuration options for ${camelToWords(subject).toLowerCase()}.`;
  }
  
  if (name.endsWith('Props')) {
    return `Props for the ${camelToWords(name.slice(0, -5))} component.`;
  }
  
  if (name.endsWith('State')) {
    return `State for ${camelToWords(name.slice(0, -5)).toLowerCase()}.`;
  }
  
  if (name.endsWith('Result')) {
    return `Result of ${camelToWords(name.slice(0, -6)).toLowerCase()} operation.`;
  }
  
  if (name.endsWith('Request')) {
    return `Request payload for ${camelToWords(name.slice(0, -7)).toLowerCase()}.`;
  }
  
  if (name.endsWith('Response')) {
    return `Response from ${camelToWords(name.slice(0, -8)).toLowerCase()}.`;
  }
  
  if (name.endsWith('Data')) {
    return `Data structure for ${camelToWords(name.slice(0, -4)).toLowerCase()}.`;
  }
  
  return `Interface for ${camelToWords(name).toLowerCase()}.`;
}

/**
 * Infer type description from name
 */
function inferTypeDescription(type: ExtractedType): string {
  const name = type.name;
  
  if (type.definition.includes('|')) {
    return `Type representing ${camelToWords(name).toLowerCase()} variants.`;
  }
  
  if (type.definition.includes('keyof')) {
    return `Keys of ${camelToWords(name).toLowerCase()}.`;
  }
  
  if (type.definition.includes('Partial<')) {
    return `Partial ${camelToWords(name).toLowerCase()}.`;
  }
  
  if (type.definition.includes('Required<')) {
    return `Required ${camelToWords(name).toLowerCase()}.`;
  }
  
  return `Type alias for ${camelToWords(name).toLowerCase()}.`;
}

/**
 * Infer return description from function
 */
function inferReturnDescription(fn: ExtractedFunction): string {
  const name = fn.name;
  const returnType = fn.returnType || 'unknown';
  
  if (name.startsWith('get') || name.startsWith('fetch') || name.startsWith('load')) {
    const subject = camelToWords(name.replace(/^(get|fetch|load)/, '')).toLowerCase();
    return `The ${subject || 'result'}`;
  }
  
  if (name.startsWith('is') || name.startsWith('has') || name.startsWith('can')) {
    return `True if condition is met, false otherwise`;
  }
  
  if (name.startsWith('create')) {
    const subject = camelToWords(name.slice(6)).toLowerCase();
    return `The created ${subject || 'instance'}`;
  }
  
  if (name.startsWith('find')) {
    const subject = camelToWords(name.slice(4)).toLowerCase();
    return `The found ${subject || 'item'} or null`;
  }
  
  if (name.startsWith('parse')) {
    return `The parsed result`;
  }
  
  if (name.startsWith('validate')) {
    return `Validation result`;
  }
  
  if (returnType === 'boolean') {
    return `True if successful, false otherwise`;
  }
  
  if (returnType === 'number') {
    return `The computed value`;
  }
  
  if (returnType === 'string') {
    return `The resulting string`;
  }
  
  if (returnType.includes('Promise<')) {
    const inner = returnType.match(/Promise<(.+)>/)?.[1] || 'result';
    return `Promise resolving to ${inner.toLowerCase()}`;
  }
  
  if (returnType.includes('[]') || returnType.includes('Array<')) {
    return `Array of results`;
  }
  
  return `The result`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a parameter for documentation
 */
function formatParam(param: ExtractedParam, config: DocGenConfig): string {
  const optional = param.optional ? ' (optional)' : '';
  const defaultVal = param.defaultValue ? ` (default: ${param.defaultValue})` : '';
  const description = param.inferredDescription || 'Parameter';
  
  if (config.includeTypes && param.type) {
    return `@param {${param.type}} ${param.name} - ${description}${optional}${defaultVal}`;
  }
  
  return `@param ${param.name} - ${description}${optional}${defaultVal}`;
}

/**
 * Convert camelCase to words
 */
function camelToWords(str: string): string {
  if (!str) return '';
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

/**
 * Check if function might throw
 */
function mightThrow(fn: ExtractedFunction): boolean {
  if (!fn.body) return false;
  
  return fn.body.includes('throw ') || 
         fn.body.includes('throw(') ||
         fn.body.includes('.reject(');
}

/**
 * Generate a simple example
 */
function generateExample(fn: ExtractedFunction): string {
  const args = fn.params.map(p => {
    if (p.defaultValue) return p.defaultValue;
    if (p.type === 'string') return `'example'`;
    if (p.type === 'number') return '42';
    if (p.type === 'boolean') return 'true';
    if (p.type?.includes('[]')) return '[]';
    return `/* ${p.name} */`;
  });
  
  const call = `${fn.name}(${args.join(', ')})`;
  
  if (fn.async) {
    return `const result = await ${call};`;
  }
  
  if (fn.returnType && fn.returnType !== 'void') {
    return `const result = ${call};`;
  }
  
  return `${call};`;
}
