import { describe, expect, it } from 'vitest';

import {
  appendInstrumentCoverageFlag,
  buildProfilePattern,
  extractCoverageObjects,
  mergeLcovReports,
  parseCliArgs
} from './index';

describe('Rust coverage adapter', () => {
  it('parses adapter options and preserves the command after the separator', () => {
    expect(parseCliArgs([
      '--output', 'build/rust.lcov',
      '--toolchain=nightly',
      '--object', 'target/debug/deps/example-test',
      '--', 'cargo', 'test', '--workspace', '--', '--nocapture'
    ])).toEqual({
      outputPath: 'build/rust.lcov',
      toolchain: 'nightly',
      objectPaths: ['target/debug/deps/example-test'],
      keepProfiles: false,
      command: 'cargo',
      commandArgs: ['test', '--workspace', '--', '--nocapture']
    });
  });

  it('requires an explicit instrumented command', () => {
    expect(() => parseCliArgs(['--output', 'coverage/lcov.info'])).toThrow(
      'A command is required after "--".'
    );
  });

  it('adds coverage instrumentation without duplicating an existing flag', () => {
    expect(appendInstrumentCoverageFlag(undefined)).toBe('-Cinstrument-coverage');
    expect(appendInstrumentCoverageFlag('-C opt-level=2')).toBe('-C opt-level=2 -Cinstrument-coverage');
    expect(appendInstrumentCoverageFlag('-Cinstrument-coverage')).toBe('-Cinstrument-coverage');
    expect(appendInstrumentCoverageFlag('-C instrument-coverage')).toBe('-C instrument-coverage');
  });

  it('uses unique process and binary placeholders for raw profiles', () => {
    expect(buildProfilePattern('/tmp/pre-cr/run-1')).toBe('/tmp/pre-cr/run-1/%p-%m.profraw');
  });

  it('extracts Cargo test objects when Cargo uses a wrapped target directory', () => {
    expect(extractCoverageObjects(
      'Running unittests src/lib.rs (/Users/example/.cache/cargo/debug/deps/demo-abc123)\n'
    )).toEqual(['/Users/example/.cache/cargo/debug/deps/demo-abc123']);
  });

  it('merges line coverage from multiple llvm-cov reports', () => {
    expect(mergeLcovReports([
      'TN:\nSF:src/lib.rs\nDA:1,0\nDA:2,1\nend_of_record\n',
      'TN:\nSF:src/lib.rs\nDA:1,3\nSF:src/main.rs\nDA:4,1\nend_of_record\n'
    ])).toBe([
      'TN:',
      'SF:src/lib.rs',
      'DA:1,3',
      'DA:2,1',
      'LF:2',
      'LH:2',
      'end_of_record',
      'SF:src/main.rs',
      'DA:4,1',
      'LF:1',
      'LH:1',
      'end_of_record',
      ''
    ].join('\n'));
  });
});
