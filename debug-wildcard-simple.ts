import { TopicPath } from './runar-ts-common/src/routing/TopicPath';
import { PathSegmentType } from './runar-ts-common/src/routing/TopicPath';

// Debug multi-segment wildcard pattern matching
const patternResult = TopicPath.new('main:services/>', 'default');
if (!patternResult.ok) {
  console.error('Failed to create pattern:', patternResult.error);
  process.exit(1);
}

const pattern = patternResult.value;
console.log('Pattern:', pattern.asString());
console.log('Pattern isPattern:', pattern.isPattern());
console.log('Pattern hasMultiWildcard:', pattern.hasMultiWildcard());
const patternPathSegments = (pattern as any).segments;
console.log(
  'Pattern PathSegments:',
  patternPathSegments.map((s: any) => ({ kind: s.kind, value: s.value }))
);
console.log('Pattern segments (string):', pattern.getSegments());

const testPathResult = TopicPath.new('main:services/auth/login', 'default');
if (!testPathResult.ok) {
  console.error('Failed to create test path:', testPathResult.error);
  process.exit(1);
}

const testPath = testPathResult.value;
console.log('Test path:', testPath.asString());
console.log('Test path isPattern:', testPath.isPattern());
const testPathPathSegments = (testPath as any).segments;
console.log(
  'Test path PathSegments:',
  testPathPathSegments.map((s: any) => ({ kind: s.kind, value: s.value }))
);
console.log('Test path segments (string):', testPath.getSegments());

console.log('Pattern matches test path:', pattern.matches(testPath));
console.log('Test path matches pattern:', testPath.matches(pattern));

// Let's also test what happens with the segmentsMatch directly
const patternSegs = (pattern as any).segments;
const testPathSegs = (testPath as any).segments;
console.log(
  'Direct segmentsMatch (pattern, concrete):',
  (pattern as any).segmentsMatch(patternSegs, testPathSegs)
);
console.log(
  'Direct segmentsMatch (concrete, pattern):',
  (pattern as any).segmentsMatch(testPathSegs, patternSegs)
);

// Debug the multi-wildcard logic
console.log('Pattern segments length:', patternSegs.length);
console.log('Last pattern segment kind:', patternSegs[patternSegs.length - 1]?.kind);
console.log('Expected MultiWildcard kind:', 2);
console.log('Topic segments length:', testPathSegs.length);
console.log('Pattern segments - 1:', patternSegs.length - 1);
console.log('Topic length >= pattern-1:', testPathSegs.length >= patternSegs.length - 1);

// Debug pattern detection
console.log('Pattern isPattern:', pattern.isPattern());
console.log('Pattern hasTemplatesValue:', (pattern as any).hasTemplatesValue);
console.log('Test path isPattern:', testPath.isPattern());
console.log('Test path hasTemplatesValue:', (testPath as any).hasTemplatesValue);

// Debug the matches method logic
const thisIsPattern = pattern.isPattern() || (pattern as any).hasTemplatesValue;
const topicIsPattern = testPath.isPattern() || (testPath as any).hasTemplatesValue;
console.log('thisIsPattern (pattern):', thisIsPattern);
console.log('topicIsPattern (testPath):', topicIsPattern);

// Debug what happens in testPath.matches(pattern)
const testPathThisIsPattern = testPath.isPattern() || (testPath as any).hasTemplatesValue;
const testPathTopicIsPattern = pattern.isPattern() || (pattern as any).hasTemplatesValue;
console.log('testPath.matches(pattern) logic:');
console.log('testPath thisIsPattern:', testPathThisIsPattern);
console.log('testPath topicIsPattern:', testPathTopicIsPattern);
if (testPathThisIsPattern && !testPathTopicIsPattern) {
  console.log('Would call: testPath.segmentsMatch(pattern.segments, testPath.segments)');
} else if (!testPathThisIsPattern && testPathTopicIsPattern) {
  console.log('Would call: testPath.segmentsMatch(pattern.segments, testPath.segments)');
} else {
  console.log('Would call: testPath.segmentsMatch(testPath.segments, pattern.segments)');
}
