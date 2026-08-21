/**
 * Stable LSP methods shared by the server and supported clients.
 *
 * Keeping these identifiers in one value-level registry prevents clients from
 * silently drifting from the server's documented beta contract.
 */
export const PRE_CR_METHODS = {
  getProjectHealth: '$/preCr/getProjectHealth',
  runPreCrCheck: '$/preCr/runPreCrCheck',
  refreshCoverage: '$/preCr/refreshCoverage',
  getCoverageSummary: '$/preCr/getCoverageSummary',
  getCoverage: '$/preCr/getCoverage',
  getCoverageDecorations: '$/preCr/getCoverageDecorations'
} as const;

export type PreCrStableMethod = typeof PRE_CR_METHODS[keyof typeof PRE_CR_METHODS];

export const PRE_CR_NOTIFICATIONS = {
  coverageChanged: '$/preCr/coverageChanged'
} as const;

export type PreCrStableNotification = typeof PRE_CR_NOTIFICATIONS[keyof typeof PRE_CR_NOTIFICATIONS];
