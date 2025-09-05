import { Component } from './logger';

export enum LogLevel {
  Error = 'Error',
  Warn = 'Warn',
  Info = 'Info',
  Debug = 'Debug',
  Trace = 'Trace',
  Off = 'Off',
}

export type ComponentKey =
  | 'Node'
  | 'Registry'
  | 'Service'
  | 'Database'
  | 'Network'
  | 'System'
  | { Custom: string };

export class LoggingConfig {
  defaultLevel: LogLevel;
  componentLevels: Map<ComponentKey, LogLevel>;

  constructor() {
    this.defaultLevel = LogLevel.Error;
    this.componentLevels = new Map<ComponentKey, LogLevel>();
  }

  static new(): LoggingConfig {
    return new LoggingConfig();
  }

  static default(): LoggingConfig {
    return LoggingConfig.new();
  }

  static defaultInfo(): LoggingConfig {
    const cfg = LoggingConfig.new();
    cfg.defaultLevel = LogLevel.Info;
    return cfg;
  }

  withDefaultLevel(level: LogLevel): LoggingConfig {
    this.defaultLevel = level;
    return this;
  }

  withComponentLevel(component: Component, level: LogLevel): LoggingConfig {
    const key = componentToKey(component);
    this.componentLevels.set(key, level);
    return this;
  }
}

export type LogSink = (level: LogLevel, formatted: string) => void;

let globalConfig: LoggingConfig = LoggingConfig.default();
let globalSink: LogSink = (level, formatted) => {
  switch (level) {
    case LogLevel.Error:
      process.stderr.write(formatted + '\n');
      break;
    case LogLevel.Warn:
      process.stderr.write(formatted + '\n');
      break;
    case LogLevel.Info:
      process.stdout.write(formatted + '\n');
      break;
    default:
      // Debug/Trace → log
      process.stdout.write(formatted + '\n');
      break;
  }
};

export function applyLoggingConfig(cfg: LoggingConfig): void {
  globalConfig = cfg;
}

export function setLogSink(sink: LogSink): void {
  globalSink = sink;
}

export function getLogSink(): LogSink {
  return globalSink;
}

export function getLoggingConfig(): LoggingConfig {
  return globalConfig;
}

export function componentToKey(component: Component): ComponentKey {
  switch (component) {
    case Component.Node:
      return 'Node';
    case Component.Registry:
      return 'Registry';
    case Component.Service:
      return 'Service';
    case Component.Database:
      return 'Database';
    case Component.Transporter:
      return 'Network';
    case Component.NetworkDiscovery:
      return 'Network';
    case Component.System:
      return 'System';
    case Component.CLI:
      return { Custom: 'CLI' };
    case Component.Keys:
      return { Custom: 'Keys' };
    default:
      // Custom(string)
      if (typeof (component as any) === 'string') {
        return { Custom: component as any };
      }
      return { Custom: 'Custom' };
  }
}

function levelRank(level: LogLevel): number {
  switch (level) {
    case LogLevel.Trace:
      return 0;
    case LogLevel.Debug:
      return 1;
    case LogLevel.Info:
      return 2;
    case LogLevel.Warn:
      return 3;
    case LogLevel.Error:
      return 4;
    case LogLevel.Off:
      return Number.POSITIVE_INFINITY;
  }
}

export function isLevelEnabled(level: LogLevel, component: Component): boolean {
  const componentLevel = getComponentLevel(component);
  return levelRank(level) >= levelRank(componentLevel) && componentLevel !== LogLevel.Off;
}

function getComponentLevel(component: Component): LogLevel {
  const key = componentToKey(component);
  for (const [k, v] of globalConfig.componentLevels) {
    if (isSameComponentKey(k, key)) return v;
  }
  return globalConfig.defaultLevel;
}

function isSameComponentKey(a: ComponentKey, b: ComponentKey): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'object' && typeof b === 'object')
    return (a as any).Custom === (b as any).Custom;
  return false;
}
