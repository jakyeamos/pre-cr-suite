import { checkFileHealth, checkReadmeHealth, checkWorkspaceHealth, extractItems, generateAIPrompt, generateClassDoc, generateDocs, generateFunctionDoc, generateInterfaceDoc, generateTypeDoc, DEFAULT_DOC_GEN_CONFIG, DEFAULT_HEALTH_CONFIG } from '@pre-cr/core/experimental';
import type { DocGenConfig, DocGenResult, ExtractedItems, FileHealthReport, GeneratedDoc, HealthMonitorConfig, SourceFile, WorkspaceHealthReport } from '@pre-cr/core/experimental';
import type { Connection, TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

export function registerDocgenRequests(connection: Connection, documents: TextDocuments<TextDocument>): void {
  interface GenerateDocsParams {
    /** URI of the file to generate docs for */
    textDocument: { uri: string };
    /** Optional configuration */
    config?: Partial<DocGenConfig>;
  }

  connection.onRequest(
    '$/preCr/generateDocs',
    async (params: GenerateDocsParams): Promise<{
      result: DocGenResult | null;
      error?: string;
    }> => {
      try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
          return { result: null, error: 'Document not found' };
        }

        const content = document.getText();
        const config = params.config || DEFAULT_DOC_GEN_CONFIG;

        const result = generateDocs(content, config);

        return { result };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { result: null, error: errorMessage };
      }
    }
  );

  // Generate documentation for a specific function/class at cursor
  interface GenerateDocAtCursorParams {
    textDocument: { uri: string };
    position: { line: number; character: number };
    config?: Partial<DocGenConfig>;
  }

  connection.onRequest(
    '$/preCr/generateDocAtCursor',
    async (params: GenerateDocAtCursorParams): Promise<{
      doc: GeneratedDoc | null;
      error?: string;
    }> => {
      try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
          return { doc: null, error: 'Document not found' };
        }

        const content = document.getText();
        const items = extractItems(content);
        const targetLine = params.position.line + 1; // Convert 0-based to 1-based

        // Find the item at or after cursor position
        const allItems = [
          ...items.functions.map(f => ({ type: 'function' as const, item: f, line: f.line })),
          ...items.classes.map(c => ({ type: 'class' as const, item: c, line: c.line })),
          ...items.interfaces.map(i => ({ type: 'interface' as const, item: i, line: i.line })),
          ...items.types.map(t => ({ type: 'type' as const, item: t, line: t.line }))
        ].sort((a, b) => a.line - b.line);

        // Find nearest item at or after cursor
        const nearest = allItems.find(item => item.line >= targetLine);

        if (!nearest) {
          return { doc: null, error: 'No documentable item found at cursor' };
        }

        const config: DocGenConfig = { ...DEFAULT_DOC_GEN_CONFIG, ...params.config };
        let doc: GeneratedDoc;

        switch (nearest.type) {
          case 'function':
            doc = generateFunctionDoc(nearest.item, config);
            break;
          case 'class':
            doc = generateClassDoc(nearest.item, config);
            break;
          case 'interface':
            doc = generateInterfaceDoc(nearest.item, config);
            break;
          case 'type':
            doc = generateTypeDoc(nearest.item, config);
            break;
        }

        return { doc };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { doc: null, error: errorMessage };
      }
    }
  );

  // Get AI prompt for documentation generation
  interface GetAIPromptParams {
    textDocument: { uri: string };
    position: { line: number; character: number };
  }

  connection.onRequest(
    '$/preCr/getAIDocPrompt',
    async (params: GetAIPromptParams): Promise<{
      prompt: { system: string; user: string } | null;
      error?: string;
    }> => {
      try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
          return { prompt: null, error: 'Document not found' };
        }

        const content = document.getText();
        const items = extractItems(content);
        const targetLine = params.position.line + 1;

        // Find function at cursor
        const fn = items.functions.find(f =>
          f.line === targetLine || f.line === targetLine + 1
        );

        if (!fn) {
          return { prompt: null, error: 'No function found at cursor' };
        }

        const prompt = generateAIPrompt(fn);

        return {
          prompt: {
            system: prompt.system,
            user: prompt.user
          }
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { prompt: null, error: errorMessage };
      }
    }
  );

  // Extract documentable items from a file
  connection.onRequest(
    '$/preCr/extractItems',
    async (params: { textDocument: { uri: string } }): Promise<{
      items: ExtractedItems | null;
      error?: string;
    }> => {
      try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
          return { items: null, error: 'Document not found' };
        }

        const content = document.getText();
        const items = extractItems(content);

        return { items };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { items: null, error: errorMessage };
      }
    }
  );

  // ============================================================================
  // Documentation Health Monitor Methods
  // ============================================================================

  // Check documentation health for a single file
  connection.onRequest(
    '$/preCr/checkFileHealth',
    async (params: {
      textDocument: { uri: string };
      config?: Partial<HealthMonitorConfig>;
    }): Promise<{
      report: FileHealthReport | null;
      error?: string;
    }> => {
      try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
          return { report: null, error: 'Document not found' };
        }

        const filePath = URI.parse(params.textDocument.uri).fsPath;
        const content = document.getText();

        const config = { ...DEFAULT_HEALTH_CONFIG, ...params.config };
        const report = checkFileHealth({ path: filePath, content }, config);

        return { report };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { report: null, error: errorMessage };
      }
    }
  );

  // Check documentation health for workspace
  interface CheckWorkspaceHealthParams {
    /** File URIs to check */
    files: Array<{ uri: string }>;
    config?: Partial<HealthMonitorConfig>;
  }

  connection.onRequest(
    '$/preCr/checkWorkspaceHealth',
    async (params: CheckWorkspaceHealthParams): Promise<{
      report: WorkspaceHealthReport | null;
      error?: string;
    }> => {
      try {
        const sourceFiles: SourceFile[] = [];

        for (const fileRef of params.files) {
          const document = documents.get(fileRef.uri);
          if (document) {
            const filePath = URI.parse(fileRef.uri).fsPath;
            sourceFiles.push({
              path: filePath,
              content: document.getText()
            });
          }
        }

        if (sourceFiles.length === 0) {
          return { report: null, error: 'No files found' };
        }

        const config = { ...DEFAULT_HEALTH_CONFIG, ...params.config };
        const report = checkWorkspaceHealth(sourceFiles, config);

        return { report };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { report: null, error: errorMessage };
      }
    }
  );

  // Check README health
  interface CheckReadmeHealthParams {
    /** README file URI */
    readmeUri: string;
    /** List of existing file paths */
    existingFiles: string[];
    /** Package.json content if available */
    packageJson?: {
      scripts?: Record<string, string>;
      version?: string;
    };
  }

  connection.onRequest(
    '$/preCr/checkReadmeHealth',
    async (params: CheckReadmeHealthParams): Promise<{
      issues: Array<{
        type: string;
        line: number;
        message: string;
        suggestion?: string;
      }>;
      error?: string;
    }> => {
      try {
        const document = documents.get(params.readmeUri);
        if (!document) {
          return { issues: [], error: 'README not found' };
        }

        const content = document.getText();
        const existingFiles = new Set(params.existingFiles);

        const issues = checkReadmeHealth(content, existingFiles, params.packageJson);

        return {
          issues: issues.map(i => ({
            type: i.type,
            line: i.line,
            message: i.message,
            suggestion: i.suggestion
          }))
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { issues: [], error: errorMessage };
      }
    }
  );

  // ============================================================================
  // Review Optimization Methods (Phase 3)
  // ============================================================================

  // Flaky test detective instance (per workspace)
}
