const fs = require('fs');

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/fixture.lcov', [
  'TN:',
  'SF:src/app.js',
  'DA:1,1',
  'DA:2,1',
  'DA:3,1',
  'DA:4,1',
  'LF:4',
  'LH:4',
  'end_of_record',
  ''
].join('\n'));
