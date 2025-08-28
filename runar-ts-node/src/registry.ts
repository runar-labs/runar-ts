import { v4 as uuidv4 } from 'uuid';
import { AnyValue } from 'runar-ts-serializer';
import { PathTrie, TopicPath } from 'runar-ts-common';
import { ActionHandler } from './service';
import { EventSubscriber } from './events';
import { ServiceEntry, ServiceState } from './service';
import { SubscriptionMetadata } from 'runar-ts-schemas';

// Subscriber kinds for event subscriptions
type SubscriberKind = 'Local' | 'Remote';

// Full subscription entry with metadata
type FullSubscriptionEntry = {
  id: string;
  kind: SubscriberKind;
  metadata: SubscriptionMetadata;
  serviceTopic: TopicPath;
  subscriber: EventSubscriber;
};

// Publish options for event publishing
export interface PublishOptions {
  broadcast?: boolean;
  guaranteed_delivery?: boolean;
  retain_for?: Duration;
  target?: string;
}

// Event registration options
export interface EventRegistrationOptions {
  includePast?: boolean;
}

// Type alias for duration (to be implemented based on Rust Duration)
export type Duration = {
  as_millis(): number;
};

// ServiceRegistry class (extracted from index.ts)
export class ServiceRegistry {
  private actionHandlers = new PathTrie<ActionHandler>();
  private eventSubscriptions = new PathTrie<FullSubscriptionEntry[]>();
  private subscriptionIdToTopic = new Map<string, TopicPath>();
  private subscriptionIdToServiceTopic = new Map<string, TopicPath>();
  private localServices = new Map<string, ServiceEntry>();
  private localServiceStates = new Map<string, ServiceState>();

  addLocalActionHandler(topic: TopicPath, handler: ActionHandler): void {
    this.actionHandlers.setValue(topic, handler);
  }

  getActionHandlerRegistrationPath(topic: TopicPath): string | null {
    // This is a simplified approach - in a real implementation,
    // we would store the registration path with the handler
    // For now, we'll extract it from the topic path
    const actionPath = topic.actionPath();
    if (actionPath.includes('/')) {
      // Convert concrete path back to template
      const parts = actionPath.split('/');
      const templateParts = parts.map(part => {
        // Simple heuristic: if it doesn't contain special chars, it's a parameter
        if (!part.includes('.') && !part.includes('-') && part.length > 0) {
          return '{service_path}';
        }
        return part;
      });
      return templateParts.join('/');
    }
    return null;
  }

  findLocalActionHandlers(topic: TopicPath): ActionHandler[] {
    return this.actionHandlers.findMatches(topic).map(m => m.content);
  }

  subscribe(
    topic: TopicPath,
    serviceTopic: TopicPath,
    subscriber: EventSubscriber,
    metadata: SubscriptionMetadata,
    kind: SubscriberKind = 'Local'
  ): string {
    const id = uuidv4();
    const existingMatches = this.eventSubscriptions.findMatches(topic);
    const existing = existingMatches.length > 0 ? existingMatches[0]!.content : [];
    const entry: FullSubscriptionEntry = { id, kind, metadata, serviceTopic, subscriber };
    this.eventSubscriptions.setValue(topic, [...existing, entry]);
    this.subscriptionIdToTopic.set(id, topic);
    this.subscriptionIdToServiceTopic.set(id, serviceTopic);
    return id;
  }

  unsubscribe(subscriptionId: string): boolean {
    const topic = this.subscriptionIdToTopic.get(subscriptionId);
    if (!topic) return false;
    const existingMatches = this.eventSubscriptions.findMatches(topic);
    const existing = existingMatches.length > 0 ? existingMatches[0]!.content : [];
    const filtered = existing.filter(e => e.id !== subscriptionId);
    this.eventSubscriptions.setValue(topic, filtered);
    this.subscriptionIdToTopic.delete(subscriptionId);
    this.subscriptionIdToServiceTopic.delete(subscriptionId);
    return true;
  }

  getSubscribers(topic: TopicPath): FullSubscriptionEntry[] {
    const exact = this.eventSubscriptions.getExactValues(topic);
    return exact.flatMap(list => list);
  }

  addLocalService(entry: ServiceEntry): void {
    this.localServices.set(
      entry.serviceTopic.asString?.() ??
        `${entry.serviceTopic.networkId()}:${entry.serviceTopic.servicePath()}`,
      entry
    );
    this.localServiceStates.set(entry.service.path(), entry.serviceState);
  }

  getLocalServices(): ServiceEntry[] {
    return Array.from(this.localServices.values());
  }

  updateServiceState(servicePath: string, state: ServiceState): void {
    for (const [k, v] of this.localServices.entries()) {
      if (v.service.path() === servicePath) {
        v.serviceState = state;
        if (state === ServiceState.Running) v.lastStartTime = Date.now();
        this.localServices.set(k, v);
        this.localServiceStates.set(servicePath, state);
        break;
      }
    }
  }

  getLocalServiceState(serviceTopic: TopicPath): ServiceState | undefined {
    return this.localServiceStates.get(serviceTopic.servicePath());
  }

  validatePauseTransition(serviceTopic: TopicPath): void {
    const curr = this.getLocalServiceState(serviceTopic);
    if (curr !== ServiceState.Running) {
      throw new Error('Service must be Running to pause');
    }
  }

  validateResumeTransition(serviceTopic: TopicPath): void {
    const curr = this.getLocalServiceState(serviceTopic);
    if (curr !== ServiceState.Paused) {
      throw new Error('Service must be Paused to resume');
    }
  }
}
