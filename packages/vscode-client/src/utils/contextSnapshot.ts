import type { FilePosition, OpenFileState } from '@pre-cr/core';

export interface OpenTextTabCandidate {
  path: string;
  cursor?: FilePosition;
  scrollTop?: number;
  isDirty?: boolean;
  isActive?: boolean;
  viewColumn?: number;
  languageId?: string;
}

/**
 * Convert VS Code tab observations into the stable snapshot shape.
 *
 * A tab is identified by its workspace-relative path and editor group. This
 * preserves every open file in a normal single-pane workspace while avoiding
 * duplicate entries from multiple observations of the same tab.
 */
export function buildOpenFileStates(candidates: readonly OpenTextTabCandidate[]): OpenFileState[] {
  const seen = new Set<string>();

  return candidates.flatMap((candidate) => {
    const filePath = candidate.path.trim();
    if (!filePath) {
      return [];
    }

    const key = `${filePath}\u0000${candidate.viewColumn ?? ''}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);

    return [{
      path: filePath,
      cursor: {
        line: nonNegativeInteger(candidate.cursor?.line),
        character: nonNegativeInteger(candidate.cursor?.character)
      },
      scrollTop: nonNegativeInteger(candidate.scrollTop),
      isDirty: candidate.isDirty === true,
      isActive: candidate.isActive === true,
      ...(candidate.viewColumn === undefined ? {} : { viewColumn: candidate.viewColumn }),
      ...(candidate.languageId ? { languageId: candidate.languageId } : {})
    }];
  });
}

/** Clamp a stored cursor to a document that may have changed since capture. */
export function clampPosition(
  position: FilePosition,
  lineCount: number,
  lineLength: (line: number) => number
): FilePosition {
  const lastLine = Math.max(0, Math.floor(lineCount) - 1);
  const line = Math.min(lastLine, nonNegativeInteger(position.line));
  const character = Math.min(
    Math.max(0, Math.floor(lineLength(line))),
    nonNegativeInteger(position.character)
  );

  return { line, character };
}

function nonNegativeInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
