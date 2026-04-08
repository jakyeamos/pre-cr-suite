/**
 * Documentation Generator Module
 * 
 * AI-powered documentation generation for TypeScript/JavaScript.
 */

// Types
export * from './types';

// Extractors
export { extractItems } from './extractor';
export { extractItemsAST, ExtractorConfig } from './extractorAST';

// Formatter
export {
  generateDocs,
  generateFunctionDoc,
  generateClassDoc,
  generateInterfaceDoc,
  generateTypeDoc,
  generateAIPrompt
} from './formatter';
