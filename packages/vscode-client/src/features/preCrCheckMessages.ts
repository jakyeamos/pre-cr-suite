import {
  formatUnsupportedSurfaceSetupGuidance,
  type CoverageCheckResult,
  type PreCrCheckExecution,
  type PreCrQualityAdapterResult,
  type ProjectHealth
} from '@pre-cr/core';

type CoverageSurfaceFields = Pick<CoverageCheckResult, 'surfaceSummary' | 'unsupportedFiles'>;

export function formatCoverageSurfaceLines(coverage: CoverageSurfaceFields): string[] {
  const lines = [
    `  Covered Surface Files: ${coverage.surfaceSummary.coveredFiles}`,
    `  Ignored Surface Files: ${coverage.surfaceSummary.ignoredFiles}`,
    `  Unsupported Surface Files: ${coverage.surfaceSummary.unsupportedFiles}`
  ];

  if (coverage.unsupportedFiles.length === 0) {
    return lines;
  }

  lines.push('', 'Unsupported Files');
  for (const file of coverage.unsupportedFiles.slice(0, 10)) {
    lines.push(`  - ${file}`);
  }

  const remaining = coverage.unsupportedFiles.length - 10;
  if (remaining > 0) {
    lines.push(`  ... and ${remaining} more`);
  }

  lines.push('', ...formatUnsupportedSurfaceSetupGuidance(coverage));

  return lines;
}

export function formatCoverageFailureMessage(
  coverage: Pick<CoverageCheckResult, 'coveragePercent' | 'threshold' | 'unsupportedFiles'>
): string {
  if (coverage.unsupportedFiles.length > 0) {
    const suffix = coverage.unsupportedFiles.length === 1 ? 'file needs' : 'files need';
    return `${coverage.unsupportedFiles.length} unsupported surface ${suffix} setup guidance`;
  }

  return `Coverage ${coverage.coveragePercent.toFixed(1)}% is below ${coverage.threshold}%`;
}

type IncompleteCheckDetails = {
  health: Pick<ProjectHealth, 'issues'>;
  testRun: Pick<PreCrCheckExecution, 'success' | 'exitCode'> | null;
  coveragePath: string | null;
  qualityAdapters: Array<Pick<PreCrQualityAdapterResult, 'name' | 'success' | 'skipped'>>;
};

export function formatIncompleteCheckMessage(result: IncompleteCheckDetails): string {
  const noChanges = result.health.issues.find((issue) => issue.code === 'no-changes');
  if (noChanges) {
    return 'No staged changes found. Stage your changes before running the Pre-CR check.';
  }

  if (result.testRun && !result.testRun.success) {
    return `Tests failed (exit code ${result.testRun.exitCode}). Show Details to inspect the test output.`;
  }

  const failedQualityAdapter = result.qualityAdapters.find((adapter) => !adapter.success && !adapter.skipped);
  if (failedQualityAdapter) {
    return `Quality check "${failedQualityAdapter.name}" failed. Show Details to inspect the command output.`;
  }

  if (result.testRun?.success && !result.coveragePath) {
    return 'Tests passed, but no coverage report was produced. Review project health for coverage setup.';
  }

  const blockingIssue = result.health.issues.find((issue) => issue.severity === 'error');
  if (blockingIssue) {
    return blockingIssue.message;
  }

  const warningIssue = result.health.issues.find((issue) => issue.severity === 'warning');
  if (warningIssue) {
    return warningIssue.message;
  }

  return 'Pre-CR check could not complete. Review project health for setup issues.';
}
