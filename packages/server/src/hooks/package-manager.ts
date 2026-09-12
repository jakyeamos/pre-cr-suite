import { runProcess } from '@pre-cr/core';

export type RepositoryPackageManager = 'pnpm' | 'npm';

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

async function gitOutput(root: string, args: string[]): Promise<string> {
  const result = await runProcess({
    command: 'git', args, cwd: root,
    env: {
      ...process.env,
      GIT_PAGER: 'cat',
      PAGER: 'cat'
    },
    maxStdoutBytes: 20 * 1024 * 1024, maxStderrBytes: 1024 * 1024
  });
  if (!result.success || result.stdout.truncated || result.stderr.truncated) {
    throw new Error('Package contract Git read failed');
  }
  return result.stdout.text;
}

// Only a previously committed explicit specialization may relax the pnpm default.
// Read the index, never an unstaged manifest or an ancestor directory's package.
export async function repositoryPackageManager(root: string): Promise<RepositoryPackageManager> {
  try {
    const indexed = (await gitOutput(root, ['ls-files', '--stage', '-z', '--',
      'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])).split('\0').filter(Boolean);
    if (indexed.length !== 2 || !indexed.every((entry) => /^100644 [a-f0-9]+ 0\t(package.json|package-lock.json)$/.test(entry))) return 'pnpm';
    const [current, previous, lockText] = await Promise.all([
      gitOutput(root, ['show', ':package.json']), gitOutput(root, ['show', 'HEAD:package.json']),
      gitOutput(root, ['show', ':package-lock.json'])
    ]);
    const pkg = object(JSON.parse(current));
    const old = object(JSON.parse(previous));
    const lock = object(JSON.parse(lockText));
    const rootPackage = object(object(lock?.packages)?.['']);
    if (!pkg || !old || !lock || !rootPackage) return 'pnpm';
    if (typeof pkg.packageManager !== 'string' || !/^npm@\d+\.\d+\.\d+$/.test(pkg.packageManager)) return 'pnpm';
    if (pkg.packageManager !== old.packageManager) return 'pnpm';
    if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) return 'pnpm';
    if (typeof pkg.name !== 'string' || !pkg.name || typeof pkg.version !== 'string' || !pkg.version) return 'pnpm';
    if (lock.name !== pkg.name || lock.version !== pkg.version
      || rootPackage.name !== pkg.name || rootPackage.version !== pkg.version) return 'pnpm';
    return 'npm';
  } catch {
    return 'pnpm';
  }
}
