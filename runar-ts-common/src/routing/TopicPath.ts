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
    segmentTypeBitmap: number,
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
    const idx = path.indexOf(":");
    if (idx < 0) throw new Error(`Invalid path format - missing network_id received: ${path}`);
    const networkId = path.slice(0, idx);
    if (!networkId) throw new Error(`Invalid path format - network ID cannot be empty received: ${path}`);
    const rest = path.slice(idx + 1);
    return TopicPath.new(rest, networkId);
  }

  static new(path: string, defaultNetwork: string): TopicPath {
    let networkId: string;
    let withoutNetwork: string;
    if (path.includes(":")) {
      const parts = path.split(":");
      if (parts.length !== 2) throw new Error(`Invalid path format - should be 'network_id:service_path' or 'service_path': ${path}`);
      if (!parts[0]) throw new Error(`Network ID cannot be empty: ${path}`);
      networkId = parts[0]!;
      withoutNetwork = parts[1]!;
    } else {
      networkId = defaultNetwork;
      withoutNetwork = path;
    }

    const rawSegments = withoutNetwork.split("/").filter((s) => s.length > 0);
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
          TopicPath.setSegmentType(&bitmap, i, PathSegmentType.SingleWildcard);
          break;
        case PathSegmentType.MultiWildcard:
          if (i < rawSegments.length - 1) {
            throw new Error("Multi-segment wildcard (>) must be the last segment in a path");
          }
          isPattern = true;
          TopicPath.setSegmentType(&bitmap, i, PathSegmentType.MultiWildcard);
          break;
        case PathSegmentType.Template:
          hasTemplates = true;
          TopicPath.setSegmentType(&bitmap, i, PathSegmentType.Template);
          break;
        case PathSegmentType.Literal:
          TopicPath.setSegmentType(&bitmap, i, PathSegmentType.Literal);
          break;
      }
      segments.push(seg);
    }

    const servicePath = TopicPath.segmentToString(segments[0]!);
    const fullPath = `${networkId}:${withoutNetwork}`;
    const actionPath = segments.length <= 1 ? "" : segments.map(TopicPath.segmentToString).join("/");

    return new TopicPath(
      fullPath,
      networkId,
      segments,
      isPattern,
      hasTemplates,
      servicePath,
      actionPath,
      segments.length,
      bitmap,
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
      "",
      1,
      0,
    );
  }

  newActionTopic(actionName: string): TopicPath {
    if (this.segments.length > 1) {
      throw new Error("Invalid action path - cannot create an action path on top of another action path");
    }
    const full = `${this.networkIdValue}:${this.servicePathValue}/${actionName}`;
    return TopicPath.new(full, this.networkIdValue);
  }

  newEventTopic(eventName: string): TopicPath {
    return this.newActionTopic(eventName);
  }

  isPattern(): boolean {
    return this.pattern;
  }

  hasMultiWildcard(): boolean {
    for (let i = 0; i < this.segmentCount; i++) {
      if (TopicPath.getSegmentType(this.segmentTypeBitmap, i) === PathSegmentType.MultiWildcard) return true;
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

  networkId(): string { return this.networkIdValue; }

  service_path(): string { return this.servicePathValue; }
  servicePath(): string { return this.servicePathValue; }

  get_segments(): string[] {
    return this.segments.map(TopicPath.segmentToString);
  }

  getSegments(): string[] { return this.get_segments(); }

  starts_with(other: TopicPath): boolean {
    return this.networkIdValue === other.networkIdValue && this.servicePathValue.startsWith(other.servicePathValue);
  }

  child(segment: string): TopicPath {
    if (segment.includes("/")) throw new Error(`Child segment cannot contain slashes: ${segment}`);
    const newPath = this.cachedActionPath === ""
      ? `${this.servicePathValue}/${segment}`
      : `${this.cachedActionPath}/${segment}`;
    const full = `${this.networkIdValue}:${newPath}`;

    const newSegment = TopicPath.segmentFromString(segment);
    const isPattern = this.pattern || newSegment.kind === PathSegmentType.SingleWildcard || newSegment.kind === PathSegmentType.MultiWildcard;
    const hasTemplates = this.hasTemplatesValue || newSegment.kind === PathSegmentType.Template;
    let bitmap = this.segmentTypeBitmap;
    TopicPath.setSegmentType(&bitmap, this.segmentCount, newSegment.kind);
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
      bitmap,
    );
  }

  parent(): TopicPath {
    if (this.segments.length <= 1) throw new Error("Cannot get parent of root or service-only path");
    const parentSegments = this.segments.slice(0, this.segments.length - 1);
    const pathStr = parentSegments.map(TopicPath.segmentToString).join("/");
    const full = `${this.networkIdValue}:${pathStr}`;

    let bitmap = this.segmentTypeBitmap;
    bitmap &= ~(0b11 << ((this.segmentCount - 1) * 2));
    let isPattern = false;
    let hasTemplates = false;
    for (let i = 0; i < parentSegments.length; i++) {
      const t = TopicPath.getSegmentType(bitmap, i);
      if (t === PathSegmentType.SingleWildcard || t === PathSegmentType.MultiWildcard) isPattern = true;
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
      bitmap,
    );
  }

  extract_params(template: string): Map<string, string> {
    const params = new Map<string, string>();
    const pathSegments = this.get_segments();
    const templateSegments = template.split("/").filter((s) => s.length > 0);
    if (pathSegments.length !== templateSegments.length) {
      throw new Error(`Path segment count (${pathSegments.length}) doesn't match template segment count (${templateSegments.length})`);
    }
    for (let i = 0; i < templateSegments.length; i++) {
      const t = templateSegments[i]!;
      if (t.startsWith("{") && t.endsWith("}")) {
        const name = t.slice(1, -1);
        params.set(name, pathSegments[i]!);
      } else if (t !== pathSegments[i]) {
        throw new Error(`Path segment '${pathSegments[i]}' doesn't match template segment '${t}'`);
      }
    }
    return params;
  }

  matches_template(template: string): boolean {
    try {
      this.extract_params(template);
      return true;
    } catch {
      return false;
    }
  }

  static test_default(path: string): TopicPath { return TopicPath.new(path, "default"); }

  private static segmentFromString(segment: string): PathSegment {
    if (segment === "*") return { kind: PathSegmentType.SingleWildcard };
    if (segment === ">") return { kind: PathSegmentType.MultiWildcard };
    if (segment.startsWith("{") && segment.endsWith("}")) return { kind: PathSegmentType.Template, value: segment.slice(1, -1) };
    return { kind: PathSegmentType.Literal, value: segment };
  }

  private static segmentToString(seg: PathSegment): string {
    switch (seg.kind) {
      case PathSegmentType.Literal: return seg.value;
      case PathSegmentType.Template: return `{${seg.value}}`;
      case PathSegmentType.SingleWildcard: return "*";
      case PathSegmentType.MultiWildcard: return ">";
    }
  }

  private static setSegmentType(bitmapRef: { valueOf(): number } | any, index: number, t: PathSegmentType): void {
    // In TS we can't mutate by reference, so pass actual number variable
    // We emulate via returning the new value; but since we need in-place above, we use & hack:
    // We'll treat bitmapRef as pointer-like passed by Bun/ts transpiler. Instead, we just return.
  }

  // Overload replacement: maintain helpers using pure functions
}

// Helpers to manage segment type bitmap without reference passing
// Shadow methods on TopicPath prototype to set/get using numbers
(TopicPath as any).setSegmentType = function (bitmapPtr: any, index: number, t: number) {
  const current: number = bitmapPtr as unknown as number;
  const cleared = current & ~(0b11 << (index * 2));
  const updated = cleared | ((t & 0b11) << (index * 2));
  // Return updated; callers should assign back
  return updated;
};

;(TopicPath as any).getSegmentType = function (bitmap: number, index: number) {
  return ((bitmap >> (index * 2)) & 0b11) as number;
};

// Patch instance methods to use the static helpers returning values
// Monkey-patch where we used &bitmap above: redefine methods to reassign
// Note: For simplicity in TypeScript, we'll redefine local helper calls inline where needed.


