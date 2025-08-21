import { getLogSink, isLevelEnabled, LogLevel } from './config';

export enum Component {
  Node = 'Node',
  Registry = 'Registry',
  Service = 'Service',
  Database = 'DB',
  Transporter = 'Network',
  NetworkDiscovery = 'NetworkDiscovery',
  System = 'System',
  CLI = 'CLI',
  Keys = 'Keys',
  Custom = 'Custom',
}

export class Logger {
  private readonly component: Component;
  private nodeId: string | undefined;
  private parentComponent: Component | undefined;
  private actionPath: string | undefined;
  private eventPath: string | undefined;

  static newRoot(component: Component): Logger {
    return new Logger(component);
  }

  constructor(component: Component) {
    this.component = component;
  }

  setNodeId(nodeId: string): void {
    if (this.nodeId !== undefined) throw new Error('Node ID already set for this logger');
    this.nodeId = nodeId;
  }

  withComponent(component: Component): Logger {
    const l = new Logger(component);
    l.nodeId = this.nodeId;
    l.parentComponent = this.component;
    l.actionPath = this.actionPath;
    l.eventPath = this.eventPath;
    return l;
  }

  withActionPath(path: string): Logger {
    const l = this.cloneLogger();
    l.actionPath = path;
    return l;
  }

  withEventPath(path: string): Logger {
    const l = this.cloneLogger();
    l.eventPath = path;
    return l;
  }

  cloneLogger(): Logger {
    const l = new Logger(this.component);
    l.nodeId = this.nodeId;
    l.parentComponent = this.parentComponent;
    l.actionPath = this.actionPath;
    l.eventPath = this.eventPath;
    return l;
  }

  node_id(): string {
    return this.nodeId
      ? this.nodeId.length > 8
        ? this.nodeId.slice(0, 8)
        : this.nodeId
      : 'unknown';
  }
  action_path(): string | undefined {
    return this.actionPath;
  }
  event_path(): string | undefined {
    return this.eventPath;
  }

  private componentPrefix(): string {
    if (this.parentComponent && this.parentComponent !== Component.Node) {
      return `${this.parentComponent}.${this.component}`;
    }
    return `${this.component}`;
  }

  private fullPrefix(): string {
    const parts: string[] = [];
    parts.push(this.componentPrefix());
    if (this.actionPath) parts.push(`action=${this.actionPath}`);
    if (this.eventPath) parts.push(`event=${this.eventPath}`);
    return parts.join('|');
  }

  private format(line: string): string {
    if (this.component === Component.Node && !this.parentComponent) {
      return `[${this.node_id()}] ${line}`;
    }
    return `[${this.node_id()}][${this.fullPrefix()}] ${line}`;
  }

  debug(message: string): void {
    if (!isLevelEnabled(LogLevel.Debug, this.component)) return;
    getLogSink()(LogLevel.Debug, this.format(message));
  }

  info(message: string): void {
    if (!isLevelEnabled(LogLevel.Info, this.component)) return;
    getLogSink()(LogLevel.Info, this.format(message));
  }

  warn(message: string): void {
    if (!isLevelEnabled(LogLevel.Warn, this.component)) return;
    getLogSink()(LogLevel.Warn, this.format(message));
  }

  error(message: string): void {
    if (!isLevelEnabled(LogLevel.Error, this.component)) return;
    getLogSink()(LogLevel.Error, this.format(message));
  }
}

export interface LoggingContext {
  component(): Component;
  service_path(): string | undefined;
  action_path?(): string | undefined;
  event_path?(): string | undefined;
  logger(): Logger;

  log_debug(message: string): void;
  log_info(message: string): void;
  log_warn(message: string): void;
  log_error(message: string): void;
}
