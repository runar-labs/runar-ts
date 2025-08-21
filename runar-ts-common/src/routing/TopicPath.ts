import { Result, ok, err } from './Result';

export enum PathSegmentType {
  Literal = 0,
  Template = 3,
  SingleWildcard = 1,
  MultiWildcard = 2,
}

export type PathSegment =
  | { kind: PathSegmentType.Literal; value: string }
  | { kind: PathSegmentType.Template; value: string }
  | { kind: PathSegmentType.SingleWildcard }
  | { kind: PathSegmentType.MultiWildcard };

export class TopicPath {
  private readonly path: string;
  private readonly networkIdValue: string;
  private readonly segments: PathSegment[];
  private readonly pattern: boolean;
  private readonly hasTemplatesValue: boolean;
  private readonly servicePathValue: string;
  private readonly cachedActionPath: string;
  private readonly segmentCount: number;
  private readonly segmentTypeBitmap: number;

  private constructor(
    path: string,
    networkId: string,
    segments: PathSegment[],
    pattern: boolean,
    hasTemplates: boolean,
    servicePath: string,
    cachedActionPath: string,
    segmentCount: number,
    segmentTypeBitmap: number
  ) {
    this.path = path;
    this.networkIdValue = networkId;
    this.segments = segments;
    this.pattern = pattern;
    this.hasTemplatesValue = hasTemplates;
    this.servicePathValue = servicePath;
    this.cachedActionPath = cachedActionPath;
    this.segmentCount = segmentCount;
    this.segmentTypeBitmap = segmentTypeBitmap;
  }

  static fromFullPath(path: string): TopicPath {
    const idx = path.indexOf(':');
    if (idx < 0) throw new Error(`Invalid path format - missing network_id received: ${path}`);
    const networkId = path.slice(0, idx);
    if (!networkId)
      throw new Error(`Invalid path format - network ID cannot be empty received: ${path}`);
    const rest = path.slice(idx + 1);
    return TopicPath.new(rest, networkId);
  }

  static new(path: string, defaultNetwork: string): TopicPath {
    let networkId: string;
    let withoutNetwork: string;
    if (path.includes(':')) {
      const parts = path.split(':');
      if (parts.length !== 2)
        throw new Error(
          `Invalid path format - should be 'network_id:service_path' or 'service_path': ${path}`
        );
      if (!parts[0]) throw new Error(`Network ID cannot be empty: ${path}`);
      networkId = parts[0]!;
      withoutNetwork = parts[1]!;
    } else {
      networkId = defaultNetwork;
      withoutNetwork = path;
    }

    const rawSegments = withoutNetwork.split('/').filter(s => s.length > 0);
    if (rawSegments.length === 0) {
      throw new Error(`Invalid path - must have at least one segment: ${path}`);
    }

    const segments: PathSegment[] = [];
    let isPattern = false;
    let hasTemplates = false;
    let bitmap = 0;
    for (let i = 0; i < rawSegments.length; i++) {
      const s = rawSegments[i]!;
      const seg = TopicPath.segmentFromString(s);
      switch (seg.kind) {
        case PathSegmentType.SingleWildcard:
          isPattern = true;
          bitmap = TopicPath.setSegmentType(bitmap, i, PathSegmentType.SingleWildcard);
          break;
        case PathSegmentType.MultiWildcard:
          if (i < rawSegments.length - 1) {
            throw new Error('Multi-segment wildcard (>) must be the last segment in a path');
          }
          isPattern = true;
          bitmap = TopicPath.setSegmentType(bitmap, i, PathSegmentType.MultiWildcard);
          break;
        case PathSegmentType.Template:
          hasTemplates = true;
          bitmap = TopicPath.setSegmentType(bitmap, i, PathSegmentType.Template);
          break;
        case PathSegmentType.Literal:
          bitmap = TopicPath.setSegmentType(bitmap, i, PathSegmentType.Literal);
          break;
      }
      segments.push(seg);
    }

    const servicePath = TopicPath.segmentToString(segments[0]!);
    const fullPath = `${networkId}:${withoutNetwork}`;
    const actionPath =
      segments.length <= 1 ? '' : segments.map(TopicPath.segmentToString).join('/');

    return new TopicPath(
      fullPath,
      networkId,
      segments,
      isPattern,
      hasTemplates,
      servicePath,
      actionPath,
      segments.length,
      bitmap
    );
  }

  static newService(networkId: string, serviceName: string): TopicPath {
    const path = `${networkId}:${serviceName}`;
    return new TopicPath(
      path,
      networkId,
      [{ kind: PathSegmentType.Literal, value: serviceName }],
      false,
      false,
      serviceName,
      '',
      1,
      0
    );
  }

  newActionTopic(actionName: string): Result<TopicPath, string> {
    if (this.segments.length > 1) {
      return err(
        'Invalid action path - cannot create an action path on top of another action path'
      );
    }

    // Check if action name contains invalid characters
    if (actionName.includes('/') || actionName.includes(':')) {
      return err('Invalid action name - cannot contain slashes or colons');
    }

    const full = `${this.networkIdValue}:${this.servicePathValue}/${actionName}`;
    return ok(TopicPath.new(full, this.networkIdValue));
  }

  newEventTopic(eventName: string): Result<TopicPath, string> {
    return this.newActionTopic(eventName);
  }

  isPattern(): boolean {
    return this.pattern;
  }

  hasMultiWildcard(): boolean {
    for (let i = 0; i < this.segmentCount; i++) {
      if (TopicPath.getSegmentType(this.segmentTypeBitmap, i) === PathSegmentType.MultiWildcard)
        return true;
    }
    return false;
  }

  actionPath(): string {
    return this.cachedActionPath;
  }

  asString(): string {
    return this.path;
  }

  network_id(): string {
    return this.networkIdValue;
  }

  networkId(): string {
    return this.networkIdValue;
  }

  service_path(): string {
    return this.servicePathValue;
  }
  servicePath(): string {
    return this.servicePathValue;
  }

  get_segments(): string[] {
    return this.segments.map(TopicPath.segmentToString);
  }

  getSegments(): string[] {
    return this.get_segments();
  }

  starts_with(other: TopicPath): boolean {
    return (
      this.networkIdValue === other.networkIdValue &&
      this.servicePathValue.startsWith(other.servicePathValue)
    );
  }

  // Alias for starts_with to match test expectations
  startsWith(other: TopicPath): boolean {
    return this.starts_with(other);
  }

  child(segment: string): TopicPath {
    if (segment.includes('/')) throw new Error(`Child segment cannot contain slashes: ${segment}`);
    const newPath =
      this.cachedActionPath === ''
        ? `${this.servicePathValue}/${segment}`
        : `${this.cachedActionPath}/${segment}`;
    const full = `${this.networkIdValue}:${newPath}`;

    const newSegment = TopicPath.segmentFromString(segment);
    const isPattern =
      this.pattern ||
      newSegment.kind === PathSegmentType.SingleWildcard ||
      newSegment.kind === PathSegmentType.MultiWildcard;
    const hasTemplates = this.hasTemplatesValue || newSegment.kind === PathSegmentType.Template;
    let bitmap = this.segmentTypeBitmap;
    bitmap = TopicPath.setSegmentType(bitmap, this.segmentCount, newSegment.kind);
    const segments = [...this.segments, newSegment];

    return new TopicPath(
      full,
      this.networkIdValue,
      segments,
      isPattern,
      hasTemplates,
      this.servicePathValue,
      newPath,
      this.segmentCount + 1,
      bitmap
    );
  }

  parent(): TopicPath {
    if (this.segments.length <= 1)
      throw new Error('Cannot get parent of root or service-only path');
    const parentSegments = this.segments.slice(0, this.segments.length - 1);
    const pathStr = parentSegments.map(TopicPath.segmentToString).join('/');
    const full = `${this.networkIdValue}:${pathStr}`;

    let bitmap = this.segmentTypeBitmap;
    bitmap &= ~(0b11 << ((this.segmentCount - 1) * 2));
    let isPattern = false;
    let hasTemplates = false;
    for (let i = 0; i < parentSegments.length; i++) {
      const t = TopicPath.getSegmentType(bitmap, i);
      if (t === PathSegmentType.SingleWildcard || t === PathSegmentType.MultiWildcard)
        isPattern = true;
      if (t === PathSegmentType.Template) hasTemplates = true;
    }

    return new TopicPath(
      full,
      this.networkIdValue,
      parentSegments,
      isPattern,
      hasTemplates,
      this.servicePathValue,
      pathStr,
      this.segmentCount - 1,
      bitmap
    );
  }

  extract_params(template: string): Map<string, string> {
    const params = new Map<string, string>();
    const pathSegments = this.get_segments();
    const templateSegments = template.split('/').filter(s => s.length > 0);
    if (pathSegments.length !== templateSegments.length) {
      throw new Error(
        `Path segment count (${pathSegments.length}) doesn't match template segment count (${templateSegments.length})`
      );
    }
    for (let i = 0; i < templateSegments.length; i++) {
      const t = templateSegments[i]!;
      if (t.startsWith('{') && t.endsWith('}')) {
        const name = t.slice(1, -1);
        params.set(name, pathSegments[i]!);
      } else if (t !== pathSegments[i]) {
        throw new Error(`Path segment '${pathSegments[i]}' doesn't match template segment '${t}'`);
      }
    }
    return params;
  }

  // Alias for extract_params to match test expectations
  extractParams(template: string): Map<string, string> {
    return this.extract_params(template);
  }

  matches_template(template: string): boolean {
    try {
      this.extract_params(template);
      return true;
    } catch {
      return false;
    }
  }

  // Alias for matches_template to match test expectations
  matchesTemplate(template: string): boolean {
    return this.matches_template(template);
  }

  // Check if this path contains template parameters
  hasTemplates(): boolean {
    return this.hasTemplatesValue;
  }

  // Static method to create a TopicPath from a template and parameter values
  static fromTemplate(
    templateString: string,
    params: Map<string, string>,
    networkIdString: string
  ): TopicPath {
    // Get segments from the template
    const templateSegments = templateString.split('/').filter(s => s.length > 0);
    const pathSegments: string[] = [];

    // Process each template segment
    for (const templateSegment of templateSegments) {
      if (templateSegment.startsWith('{') && templateSegment.endsWith('}')) {
        // This is a parameter segment - extract the parameter name
        const paramName = templateSegment.slice(1, -1);

        // Look up the parameter value
        const value = params.get(paramName);
        if (value === undefined) {
          throw new Error(`Missing parameter value for '${paramName}'`);
        }
        pathSegments.push(value);
      } else {
        // This is a literal segment
        pathSegments.push(templateSegment);
      }
    }

    // Construct the final path
    const pathStr = pathSegments.join('/');
    return TopicPath.new(pathStr, networkIdString);
  }

  // Implement pattern matching against another path
  matches(topic: TopicPath): boolean {
    // Network ID must match
    if (this.networkIdValue !== topic.networkIdValue) {
      return false;
    }

    // Fast path 1: if paths are identical strings, they're equal
    if (this.path === topic.path) {
      return true;
    }

    // Fast path 2: if segment counts don't match and there's no multi-wildcard,
    // the paths can't match
    if (this.segmentCount !== topic.segmentCount && !this.hasMultiWildcard()) {
      return false;
    }

    // Fast path 3: If neither path is a pattern, and they're not identical strings,
    // they can't match
    if (!this.pattern && !topic.pattern && !this.hasTemplatesValue && !topic.hasTemplatesValue) {
      return false;
    }

    // Check for template path matching concrete path special case
    if (this.hasTemplatesValue && !topic.hasTemplatesValue) {
      // A template path doesn't match a concrete path in this direction
      // For example: "services/{service_path}" doesn't match "services/math"
      // But "services/math" does match "services/{service_path}"
      return false;
    }

    // Check for reverse template matching - concrete path matching template path
    if (!this.hasTemplatesValue && topic.hasTemplatesValue) {
      // A concrete path can match a template path
      // For example: "services/math" matches "services/{service_path}"
      // Verify by checking if the concrete path would extract valid parameters from the template
      return topic.matches_template(this.actionPath());
    }

    // Otherwise, perform segment-by-segment matching
    return this.segmentsMatch(this.segments, topic.segments);
  }

  // Optimized segment matching with improved template handling
  private segmentsMatch(patternSegments: PathSegment[], topicSegments: PathSegment[]): boolean {
    // Special case: multi-wildcard at the end
    if (
      patternSegments.length > 0 &&
      patternSegments[patternSegments.length - 1]?.kind === PathSegmentType.MultiWildcard
    ) {
      // If pattern ends with >, topic must have at least as many segments as pattern minus 1
      if (topicSegments.length < patternSegments.length - 1) {
        return false;
      }

      // Check all segments before the multi-wildcard
      for (let i = 0; i < patternSegments.length - 1; i++) {
        const patternSeg = patternSegments[i]!;
        const topicSeg = topicSegments[i]!;

        switch (patternSeg.kind) {
          case PathSegmentType.Literal:
            // For literals, the segments must match exactly
            if (topicSeg.kind === PathSegmentType.Literal && patternSeg.value === topicSeg.value) {
              continue;
            }
            return false;
          case PathSegmentType.Template:
            // Template parameters match any literal segment
            if (topicSeg.kind === PathSegmentType.Literal) {
              continue;
            }
            return false;
          case PathSegmentType.SingleWildcard:
            // For single wildcards, any segment matches
            continue;
          case PathSegmentType.MultiWildcard:
            // Should not happen, as we're iterating up to len-1
            return false;
        }
      }

      // If we get here, all segments matched
      return true;
    }

    // If pattern doesn't end with multi-wildcard, segment counts must match
    if (patternSegments.length !== topicSegments.length) {
      return false;
    }

    // Check each segment - fast path for literal matches
    for (let i = 0; i < patternSegments.length; i++) {
      const patternSeg = patternSegments[i]!;
      const topicSeg = topicSegments[i]!;

      // Fast path for identical segments
      if (patternSeg.kind === topicSeg.kind) {
        if (
          patternSeg.kind === PathSegmentType.Literal &&
          topicSeg.kind === PathSegmentType.Literal
        ) {
          if (patternSeg.value === topicSeg.value) {
            continue;
          }
        } else if (
          patternSeg.kind === PathSegmentType.Template &&
          topicSeg.kind === PathSegmentType.Template
        ) {
          if (patternSeg.value === topicSeg.value) {
            continue;
          }
        } else if (
          patternSeg.kind === PathSegmentType.SingleWildcard &&
          topicSeg.kind === PathSegmentType.SingleWildcard
        ) {
          continue;
        } else if (
          patternSeg.kind === PathSegmentType.MultiWildcard &&
          topicSeg.kind === PathSegmentType.MultiWildcard
        ) {
          continue;
        }
      }

      switch (patternSeg.kind) {
        case PathSegmentType.Literal:
          // Literals must match exactly
          if (topicSeg.kind === PathSegmentType.Literal && patternSeg.value === topicSeg.value) {
            continue;
          }
          return false;
        case PathSegmentType.Template:
          // Template parameters match any literal segment
          if (topicSeg.kind === PathSegmentType.Literal) {
            continue;
          }
          return false;
        case PathSegmentType.SingleWildcard:
          // Single wildcards match any segment
          continue;
        case PathSegmentType.MultiWildcard:
          // Multi-wildcards should only appear at the end
          // This is a defensive check - should never happen due to parsing
          return false;
      }
    }

    // If we get here, all segments matched
    return true;
  }

  static test_default(path: string): TopicPath {
    return TopicPath.new(path, 'default');
  }

  private static segmentFromString(segment: string): PathSegment {
    if (segment === '*') return { kind: PathSegmentType.SingleWildcard };
    if (segment === '>') return { kind: PathSegmentType.MultiWildcard };
    if (segment.startsWith('{') && segment.endsWith('}'))
      return { kind: PathSegmentType.Template, value: segment.slice(1, -1) };
    return { kind: PathSegmentType.Literal, value: segment };
  }

  private static segmentToString(seg: PathSegment): string {
    switch (seg.kind) {
      case PathSegmentType.Literal:
        return seg.value;
      case PathSegmentType.Template:
        return `{${seg.value}}`;
      case PathSegmentType.SingleWildcard:
        return '*';
      case PathSegmentType.MultiWildcard:
        return '>';
    }
  }

  static setSegmentType(bitmap: number, index: number, t: PathSegmentType): number {
    const cleared = bitmap & ~(0b11 << (index * 2));
    return cleared | ((t & 0b11) << (index * 2));
  }

  static getSegmentType(bitmap: number, index: number): PathSegmentType {
    return ((bitmap >> (index * 2)) & 0b11) as number as PathSegmentType;
  }
}
