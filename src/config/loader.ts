import { Context } from "probot";
import { AppConfig } from "../channels/types.js";

export class ConfigLoader {
  private context: Context<"workflow_run.completed">;

  constructor(context: Context<"workflow_run.completed">) {
    this.context = context;
  }

  async loadConfig(): Promise<AppConfig> {
    const repo = this.context.repo();
    
    try {
      // Load all configuration variables in parallel
      const [
        apiKeyData,
        uncensoredData,
        githubEnabledData,
        slackEnabledData,
        slackTokenData,
        slackChannelIdData,
      ] = await Promise.all([
        this.getVariable("OPENAI_API_KEY"),
        this.getVariable("ROASTER_UNCENSORED", "false"),
        this.getVariable("GITHUB_CHANNEL_ENABLED", "true"),
        this.getVariable("SLACK_CHANNEL_ENABLED", "false"),
        this.getVariable("SLACK_TOKEN", ""),
        this.getVariable("SLACK_CHANNEL_ID", ""),
      ]);

      const config: AppConfig = {
        openai: {
          apiKey: apiKeyData.value,
        },
        roaster: {
          uncensored: uncensoredData.value.toLowerCase() === "true",
          maximumRoastLength: 200,
          maximumRoasts: 1,
        },
        channels: {
          github: {
            enabled: githubEnabledData.value.toLowerCase() === "true",
          },
          slack: {
            enabled: slackEnabledData.value.toLowerCase() === "true",
            token: slackTokenData.value,
            channelId: slackChannelIdData.value,
          },
        },
      };

      this.validateConfig(config);
      return config;
    } catch (error) {
      this.context.log.error(`[${repo.repo}]: Failed to load configuration:`, error);
      throw error;
    }
  }

  private async getVariable(name: string, defaultValue?: string): Promise<{ value: string }> {
    const repo = this.context.repo();
    
    try {
      const response = await this.context.octokit.actions.getRepoVariable({
        owner: repo.owner,
        repo: repo.repo,
        name,
      });
      return { value: response.data.value };
    } catch (error) {
      if (defaultValue !== undefined) {
        return { value: defaultValue };
      }
      throw new Error(`Required configuration variable ${name} not found`);
    }
  }

  private validateConfig(config: AppConfig): void {
    // Validate OpenAI API key
    if (!config.openai.apiKey) {
      throw new Error("OPENAI_API_KEY is required");
    }

    // Validate at least one channel is enabled
    const enabledChannels = [
      config.channels.github.enabled,
      config.channels.slack.enabled,
    ];
    
    if (!enabledChannels.some(enabled => enabled)) {
      throw new Error("At least one channel must be enabled");
    }

    // Validate Slack configuration if enabled
    if (config.channels.slack.enabled) {
      if (!config.channels.slack.token) {
        throw new Error("SLACK_TOKEN is required when Slack channel is enabled");
      }
      if (!config.channels.slack.channelId) {
        throw new Error("SLACK_CHANNEL_ID is required when Slack channel is enabled");
      }
    }
  }
} 