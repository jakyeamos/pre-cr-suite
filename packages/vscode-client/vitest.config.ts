import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'src/__tests__/vscode.mock.ts',
        '**/*.d.ts'
      ]
    },
    // Mock vscode module globally
    alias: {
      'vscode': new URL('./src/__tests__/vscode.mock.ts', import.meta.url).pathname
    }
  }
});
