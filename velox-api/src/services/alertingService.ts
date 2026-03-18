// src/services/alertingService.ts
//
// Alerting service for critical events and errors.
//
// Reference: docs/architecture/07-governance-monitoring.md §7.2
//
// Supports:
//   - Slack webhooks
//   - PagerDuty (via webhook)
//   - Email (placeholder for future)
//
// Alert priorities:
//   P1 - Critical: Service down, data loss risk
//   P2 - High: Degraded performance, failures > threshold
//   P3 - Medium: Elevated error rates, capacity warnings
//   P4 - Low: Informational, trends

import { logger } from '../utils/logger';

export type AlertPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface Alert {
  priority: AlertPriority;
  title: string;
  message: string;
  source: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

interface AlertConfig {
  slackWebhookUrl?: string;
  pagerdutyRoutingKey?: string;
  enableSlack: boolean;
  enablePagerDuty: boolean;
  minPriorityForPagerDuty: AlertPriority;
}

const DEFAULT_CONFIG: AlertConfig = {
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  pagerdutyRoutingKey: process.env.PAGERDUTY_ROUTING_KEY,
  enableSlack: !!process.env.SLACK_WEBHOOK_URL,
  enablePagerDuty: !!process.env.PAGERDUTY_ROUTING_KEY,
  minPriorityForPagerDuty: 'P2', // Only P1 and P2 go to PagerDuty
};

// Priority weights for comparison
const PRIORITY_WEIGHTS: Record<AlertPriority, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

// Slack colors for different priorities
const SLACK_COLORS: Record<AlertPriority, string> = {
  P1: '#FF0000', // Red
  P2: '#FF8C00', // Orange
  P3: '#FFD700', // Yellow
  P4: '#00BFFF', // Light blue
};

export class AlertingService {
  private config: AlertConfig;
  private recentAlerts: Map<string, number> = new Map(); // Deduplication
  private deduplicationWindowMs = 5 * 60 * 1000; // 5 minutes

  constructor(config?: Partial<AlertConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Send an alert to all configured channels.
   */
  async sendAlert(alert: Alert): Promise<void> {
    const alertKey = this.getAlertKey(alert);
    const now = Date.now();

    // Deduplicate alerts within the window
    const lastSent = this.recentAlerts.get(alertKey);
    if (lastSent && now - lastSent < this.deduplicationWindowMs) {
      logger.debug({ alertKey }, 'Alert deduplicated');
      return;
    }

    this.recentAlerts.set(alertKey, now);

    // Add timestamp
    alert.timestamp = alert.timestamp || new Date();

    logger.info(
      { priority: alert.priority, title: alert.title, source: alert.source },
      'Sending alert'
    );

    const promises: Promise<void>[] = [];

    // Send to Slack
    if (this.config.enableSlack && this.config.slackWebhookUrl) {
      promises.push(this.sendToSlack(alert));
    }

    // Send to PagerDuty for high-priority alerts
    if (
      this.config.enablePagerDuty &&
      this.config.pagerdutyRoutingKey &&
      this.isPriorityHigherOrEqual(alert.priority, this.config.minPriorityForPagerDuty)
    ) {
      promises.push(this.sendToPagerDuty(alert));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send alert to Slack via webhook.
   */
  private async sendToSlack(alert: Alert): Promise<void> {
    if (!this.config.slackWebhookUrl) return;

    const payload = {
      attachments: [
        {
          color: SLACK_COLORS[alert.priority],
          title: `[${alert.priority}] ${alert.title}`,
          text: alert.message,
          fields: [
            { title: 'Source', value: alert.source, short: true },
            { title: 'Priority', value: alert.priority, short: true },
            ...Object.entries(alert.metadata || {}).map(([k, v]) => ({
              title: k,
              value: String(v),
              short: true,
            })),
          ],
          footer: 'Velox AI Alerts',
          ts: Math.floor((alert.timestamp?.getTime() || Date.now()) / 1000),
        },
      ],
    };

    try {
      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.error({ status: response.status }, 'Slack alert failed');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to send Slack alert');
    }
  }

  /**
   * Send alert to PagerDuty via Events API v2.
   */
  private async sendToPagerDuty(alert: Alert): Promise<void> {
    if (!this.config.pagerdutyRoutingKey) return;

    const severity = this.mapPriorityToSeverity(alert.priority);

    const payload = {
      routing_key: this.config.pagerdutyRoutingKey,
      event_action: 'trigger',
      dedup_key: this.getAlertKey(alert),
      payload: {
        summary: `[${alert.priority}] ${alert.title}`,
        severity,
        source: alert.source,
        custom_details: {
          message: alert.message,
          ...alert.metadata,
        },
      },
    };

    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.error({ status: response.status }, 'PagerDuty alert failed');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to send PagerDuty alert');
    }
  }

  /**
   * Helper methods
   */
  private getAlertKey(alert: Alert): string {
    return `${alert.priority}:${alert.source}:${alert.title}`;
  }

  private isPriorityHigherOrEqual(a: AlertPriority, b: AlertPriority): boolean {
    return PRIORITY_WEIGHTS[a] <= PRIORITY_WEIGHTS[b];
  }

  private mapPriorityToSeverity(priority: AlertPriority): string {
    const map: Record<AlertPriority, string> = {
      P1: 'critical',
      P2: 'error',
      P3: 'warning',
      P4: 'info',
    };
    return map[priority];
  }

  // ─── Convenience methods for common alerts ─────────────────────────────────

  async alertServiceDown(service: string, error: string): Promise<void> {
    await this.sendAlert({
      priority: 'P1',
      title: `Service Down: ${service}`,
      message: error,
      source: service,
      metadata: { type: 'service_down' },
    });
  }

  async alertHighErrorRate(service: string, errorRate: number, threshold: number): Promise<void> {
    await this.sendAlert({
      priority: 'P2',
      title: `High Error Rate: ${service}`,
      message: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}%`,
      source: service,
      metadata: { errorRate, threshold },
    });
  }

  async alertHighLatency(service: string, latencyMs: number, thresholdMs: number): Promise<void> {
    await this.sendAlert({
      priority: 'P3',
      title: `High Latency: ${service}`,
      message: `Latency ${latencyMs}ms exceeds threshold ${thresholdMs}ms`,
      source: service,
      metadata: { latencyMs, thresholdMs },
    });
  }

  async alertBillingIssue(orgId: string, issue: string): Promise<void> {
    await this.sendAlert({
      priority: 'P3',
      title: 'Billing Issue',
      message: issue,
      source: 'billing-service',
      metadata: { orgId },
    });
  }

  async alertSecurityEvent(event: string, details: Record<string, unknown>): Promise<void> {
    await this.sendAlert({
      priority: 'P2',
      title: 'Security Event',
      message: event,
      source: 'security',
      metadata: details,
    });
  }
}

export const alertingService = new AlertingService();
