import type { WorkflowRun } from "@octokit/webhooks-types";

export interface RoastMessage {
  content: string;
}

export interface ChannelConfig {
  enabled: boolean;
  [key: string]: any;
}

export interface ChannelHandler {
  name: string;
  isEnabled(config: ChannelConfig): boolean;
  sendRoast(roastMessages: RoastMessage[], workflowRun: WorkflowRun, config: ChannelConfig): Promise<void>;
}

export interface ChannelManager {
  registerChannel(channel: ChannelHandler): void;
  sendRoasts(roastMessages: RoastMessage[], workflowRun: WorkflowRun): Promise<void>;
  getEnabledChannels(): ChannelHandler[];
}

export interface AppConfig {
  openai: {
    apiKey: string;
  };
  roaster: {
    uncensored: boolean;
    maximumRoastLength: number;
    maximumRoasts: number;
  };
  channels: {
    github: ChannelConfig;
    slack: ChannelConfig & {
      token?: string;
      channelId?: string;
    };
  };
} 