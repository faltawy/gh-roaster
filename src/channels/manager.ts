import { Context } from "probot";
import type { WorkflowRun } from "@octokit/webhooks-types";
import { ChannelHandler, ChannelManager, RoastMessage, AppConfig } from "./types.js";

export class ChannelManagerImpl implements ChannelManager {
  private channels: Map<string, ChannelHandler> = new Map();
  private context: Context<"workflow_run.completed">;
  private config: AppConfig;

  constructor(context: Context<"workflow_run.completed">, config: AppConfig) {
    this.context = context;
    this.config = config;
  }

  registerChannel(channel: ChannelHandler): void {
    this.channels.set(channel.name, channel);
    this.context.log.info(`[ChannelManager]: Registered channel: ${channel.name}`);
  }

  async sendRoasts(roastMessages: RoastMessage[], workflowRun: WorkflowRun): Promise<void> {
    const enabledChannels = this.getEnabledChannels();
    
    if (enabledChannels.length === 0) {
      this.context.log.warn("[ChannelManager]: No channels are enabled");
      return;
    }

    this.context.log.info(`[ChannelManager]: Sending roasts to ${enabledChannels.length} enabled channel(s): ${enabledChannels.map(c => c.name).join(", ")}`);

    // Send roasts to all enabled channels in parallel
    const sendPromises = enabledChannels.map(async (channel) => {
      try {
        const channelConfig = this.getChannelConfig(channel.name);
        await channel.sendRoast(roastMessages, workflowRun, channelConfig);
      } catch (error) {
        this.context.log.error(`[ChannelManager]: Failed to send roast via ${channel.name}:`, error);
        // Continue with other channels even if one fails
      }
    });

    await Promise.allSettled(sendPromises);
  }

  getEnabledChannels(): ChannelHandler[] {
    const enabledChannels: ChannelHandler[] = [];
    
    for (const [name, channel] of this.channels) {
      try {
        const channelConfig = this.getChannelConfig(name);
        if (channel.isEnabled(channelConfig)) {
          enabledChannels.push(channel);
        }
      } catch (error) {
        this.context.log.error(`[ChannelManager]: Error checking if channel ${name} is enabled:`, error);
      }
    }
    
    return enabledChannels;
  }

  private getChannelConfig(channelName: string): any {
    switch (channelName) {
      case "github":
        return this.config.channels.github;
      case "slack":
        return this.config.channels.slack;
      default:
        throw new Error(`Unknown channel: ${channelName}`);
    }
  }
} 