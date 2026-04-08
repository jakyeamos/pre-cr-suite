// Standard parsers (load entire file into memory)
export { parseLcovFile, parseLcovContent } from './lcov';
export { parseIstanbulFile, parseIstanbulContent } from './istanbul';

// Streaming parser (memory efficient for large files)
export { 
  parseLcovFileStreaming, 
  parseLcovContentStreaming,
  type StreamingParseOptions,
  type StreamingParseResult 
} from './lcovStreaming';
