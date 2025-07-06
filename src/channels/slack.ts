import { WebClient, RichTextBlock, KnownBlock } from "@slack/web-api";
import { Context } from "probot";
import type { WorkflowRun } from "@octokit/webhooks-types";
import { ChannelHandler, ChannelConfig, RoastMessage } from "./types.js";

interface SlackConfig extends ChannelConfig {
  token: string;
  channelId: string;
}

export class SlackChannelHandler implements ChannelHandler {
  name = "slack";
  
  private context: Context<"workflow_run.completed">;
  private slackClient: WebClient | null = null;

  constructor(context: Context<"workflow_run.completed">) {
    this.context = context;
  }

  isEnabled(config: ChannelConfig): boolean {
    const slackConfig = config as SlackConfig;
    return config.enabled && !!slackConfig.token && !!slackConfig.channelId;
  }

  private initializeSlackClient(token: string): WebClient {
    if (!this.slackClient) {
      this.slackClient = new WebClient(token);
    }
    return this.slackClient;
  }

  async sendRoast(roastMessages: RoastMessage[], workflowRun: WorkflowRun, config: ChannelConfig): Promise<void> {
    const slackConfig = config as SlackConfig;
    const repo = this.context.repo();
    
    if (!slackConfig.token || !slackConfig.channelId) {
      throw new Error("Slack configuration is missing token or channelId");
    }

    try {
      const slack = this.initializeSlackClient(slackConfig.token);

      // Create a rich message format for Slack
      const blocks = this.createSlackBlocks(roastMessages, workflowRun, repo);

      await slack.chat.postMessage({
        channel: slackConfig.channelId,
        blocks,
        text: `🔥 CI Roast Alert for ${repo.repo}`, // Fallback text for notifications
      });

      this.context.log.info(`[${repo.repo}]: Sent ${roastMessages.length} roast(s) to Slack channel ${slackConfig.channelId}`);
    } catch (error) {
      this.context.log.error(`[${repo.repo}]: Failed to send roast via Slack:`, error);
      throw error;
    }
  }

  private createSlackBlocks(roastMessages: RoastMessage[], workflowRun: WorkflowRun, repo: { owner: string; repo: string }) {
    const blocks: KnownBlock[] = [
      {
        type: "section",
        text: {
            type: 'mrkdwn',
            text: `🔥 CI Roast Alert for ${repo.repo}`,
        }
      },
      {
        type: "section",
        text: {
          type: 'mrkdwn',
          text: `*Failed by:* @${workflowRun.actor.login} | *Workflow:* ${workflowRun.display_title} | *Branch:* ${workflowRun.head_branch}`
        }
      },
      {
        type: "section",
        text: {
          type: 'mrkdwn',
          text: `*Commit:* "${workflowRun.head_commit.message}"`
        }
      },
      {
        type: 'divider'
      }
    ];

    // Add each roast as a separate block
    for (const roast of roastMessages) {
      blocks.push({
        type: "section",
        text: {
          type: 'mrkdwn',
          text: roast.content
        }
      });
    }

    // Add PR context if available
    if (workflowRun.pull_requests.length > 0) {
      blocks.push({
          type: "section",
        text: {
          type: 'mrkdwn',
          text: `📌 *Pull Request:* <${workflowRun.pull_requests[0].url}|#${workflowRun.pull_requests[0].number}>`
        }
      });
    }

    return blocks;
  }
} 