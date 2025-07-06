import { Context } from "probot";
import type { WorkflowRun } from "@octokit/webhooks-types";
import { ChannelHandler, ChannelConfig, RoastMessage } from "./types.js";

export class GitHubChannelHandler implements ChannelHandler {
  name = "github";
  
  private context: Context<"workflow_run.completed">;

  constructor(context: Context<"workflow_run.completed">) {
    this.context = context;
  }

  isEnabled(config: ChannelConfig): boolean {
    return config.enabled;
  }

  async sendRoast(roastMessages: RoastMessage[], workflowRun: WorkflowRun, config: ChannelConfig): Promise<void> {
    const repo = this.context.repo();
    
    try {
      if (workflowRun.pull_requests.length > 0) {
        // Send roasts as PR comments
        for (const roast of roastMessages) {
          await this.context.octokit.issues.createComment({
            owner: repo.owner,
            issue_number: workflowRun.pull_requests[0].number,
            repo: repo.repo,
            body: roast.content,
          });
        }
        this.context.log.info(`[${repo.repo}]: Sent ${roastMessages.length} roast(s) to PR #${workflowRun.pull_requests[0].number}`);
      } else {
        // Send roasts as commit comments
        for (const roast of roastMessages) {
          await this.context.octokit.repos.createCommitComment({
            owner: repo.owner,
            commit_sha: workflowRun.head_commit.id,
            repo: repo.repo,
            body: roast.content,
          });
        }
        this.context.log.info(`[${repo.repo}]: Sent ${roastMessages.length} roast(s) to commit ${workflowRun.head_commit.id}`);
      }
    } catch (error) {
      this.context.log.error(`[${repo.repo}]: Failed to send roast via GitHub:`, error);
      throw error;
    }
  }
} 