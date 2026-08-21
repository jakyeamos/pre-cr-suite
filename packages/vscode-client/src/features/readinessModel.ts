import type { PreCrReadinessState } from '../utils/state';

export function formatReadinessLabel(readiness: PreCrReadinessState): string {
  switch (readiness.state) {
    case 'ready':
      return '$(check) Ready';
    case 'warning':
      return '$(warning) Warning';
    case 'blocked':
      return '$(error) Blocked';
    case 'setup-needed':
      return '$(tools) Setup needed';
    default:
      return '$(circle-outline) Not run';
  }
}
