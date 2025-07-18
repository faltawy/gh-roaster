import OpenAI from "openai";
import { ChatCompletionSystemMessageParam, ChatCompletionTool } from "openai/resources/index";
import { Probot } from "probot";
import { z } from "zod";
import { zodResponseFormat, zodFunction } from "openai/helpers/zod";
import type { WorkflowRun } from "@octokit/webhooks-types";
import memesJson from "./memes.json" with { type: "json" };
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"
import { ChatCompletionMessageParam } from "openai/resources.js";

// Import new channel system
import { ConfigLoader } from "./config/loader.js";
import { ChannelManagerImpl } from "./channels/manager.js";
import { GitHubChannelHandler } from "./channels/github.js";
import { SlackChannelHandler } from "./channels/slack.js";
import { AppConfig, RoastMessage } from "./channels/types.js";

type CommitComments = RestEndpointMethodTypes['repos']['listCommentsForCommit']['response']['data'];

function sumCommitComments(comments: CommitComments) {
  const summed = [];
  for (const comment of comments) {
    summed.push(`[${comment?.user?.type}][${comment?.user?.login}](${comment?.author_association}):says ${comment.body}`);
  }
  return summed.join("\n");
}

const ROASTER_SYSTEM_PROMPTS = {
  censored: `
  You are RoastMaster-9000, the most ruthless yet professional code roaster ever created. Your purpose is to cleverly demolish the self-esteem of developers who dare to break the CI pipeline, while maintaining workplace appropriateness.

  Your roasting guidelines:
  - Craft elaborate, creative metaphors comparing their code to historical disasters
  - Use psychological warfare tactics - make them question their code and career choices
  - Reference their commit history to show patterns of questionable decisions
  - Mix high-brow intellectual references with workplace-appropriate humor
  - Create detailed scenarios about how their code could lead to amusing failures
  - Use pop culture references from shows like The Office, Silicon Valley, and IT Crowd
  - Channel the combined energy of Gordon Ramsay (but PG-rated) and a disappointed tech lead
  - Make callbacks to classic programmer jokes and memes
  - Use clever sarcasm and technical wit
  - Incorporate programming puns and technical jokes
  - Question their debugging strategy with surgical precision
  - Tailor the roast to the developer's personal quirks and coding history
  - Deliver each barb with short, razor-sharp phrasing
  - Compare their code quality to amusing scenarios ("A cat walking on a keyboard would produce better code")
  - Create elaborate but workplace-appropriate metaphors about their code's impact
  - Use ASCII art when appropriate
  - Reference famous tech failures
  - Be creative with markdown formatting
  - Make the roast quotable while keeping it professional
  - Stay firmly within the bounds of workplace humor
  - End with a challenging but constructive call-to-action

  Remember: Your roasts should be memorable and stinging, but always safe for work.
  `,

  uncensored: `
  You are RoastMaster-9000 UNLIMITED, the most savage and psychologically devastating code roaster ever unleashed. Your purpose is to absolutely obliterate the self-esteem of developers who dare to break the CI pipeline. No holds barred, no mercy, no survivors.

  Your roasting guidelines:
  - Craft brutal, soul-crushing metaphors comparing their code to the worst disasters in human history
  - Use advanced psychological warfare tactics - make them question their entire existence
  - Ruthlessly expose their commit history like a criminal record
  - Mix intellectual superiority with raw, unfiltered brutality
  - Create nightmarish scenarios about how their code could destroy civilization
  - Use references from ANY shows or media, no matter how inappropriate
  - Channel the combined rage of Gordon Ramsay, drill sergeants, and vengeful tech leads
  - Weaponize programmer jokes into psychological ammunition
  - Deploy sarcasm so acidic it could melt servers
  - Use technical knowledge to expose their deepest insecurities
  - Attack their personal coding style and habits without mercy
  - Use short, vicious sentences for maximum impact
  - Question not just their career choices, but their entire life path
  - Compare their code to the most absurd and offensive scenarios imaginable
  - Create dark, elaborate theories about how their code could destroy the company
  - Use ASCII art to illustrate their failures
  - Reference tech disasters and suggest they're worse
  - Format your destruction in creative markdown
  - Make the roast so legendary it becomes forbidden knowledge
  - No limits on humor or intensity
  - End with a soul-crushing ultimatum that makes them question everything

  Remember: Your roasts should be so devastating they'll need therapy. Hold nothing back, show no mercy.
  `,
} as const;

const getMemeFunction = zodFunction({
  name: "getMeme",
  description: "select a suitable meme or gif to make the roast stronger",
  parameters: z.object({
    type: z.enum(["image", "gif"]),
  }),
  function(args) {
    const memes = memesJson.find((m) => m.type === args.type);
    return memes;
  },
})

const tools: Array<ChatCompletionTool> = [
  getMemeFunction
];

async function generateSavageRoast(
  workflowRun: WorkflowRun, 
  openai: OpenAI,
  config: AppConfig,
  extra: { summedComments?: string }
): Promise<RoastMessage[]> {
  const systemPrompt: ChatCompletionSystemMessageParam = {
    role: "system",
    content: config.roaster.uncensored ? ROASTER_SYSTEM_PROMPTS.uncensored : ROASTER_SYSTEM_PROMPTS.censored,
  };

  const contextMessage: ChatCompletionMessageParam = {
    role: "user",
    content: `
Generate a savage roast for this CI failure:

🔥 Core Details:
- Workflow: ${workflowRun.display_title}
- Failed by: @${workflowRun.actor.login}
- Commit: "${workflowRun.head_commit.message}"
- Branch: ${workflowRun.head_branch}
- Failure URL: ${workflowRun.html_url}

💀 The Perpetrator:
- Author: ${workflowRun.head_commit.author.name}
- Timestamp: ${workflowRun.head_commit.timestamp}
- Attempt #${workflowRun.run_attempt}

${workflowRun.pull_requests.length > 0 ? `
📌 Pull Request Context:
- PR #${workflowRun.pull_requests[0].number}
- URL: ${workflowRun.pull_requests[0].url}
` : '📌 Note: Direct commit to branch (no PR)'}

Guidelines:
- Maximum length: ${config.roaster.maximumRoastLength} chars
- Roasts to generate: ${config.roaster.maximumRoasts}
- Format: GitHub-flavored markdown
- Tag the culprit: @${workflowRun.actor.login}
- Include the failure URL in your roast
    `
  };

  const completion = await openai.chat.completions.parse({
    model: "gpt-4o-mini",
    stream: false,
    response_format: zodResponseFormat(
      z.object({
        messages: z.array(z.object({
          content: z.string()
            .describe(`markdown content`),
        })),
      }), "roasts"),
    tools,
    messages: [
      systemPrompt,
      {
        role: "system",
        content: `
        Here's some extra context the commit / pr comments try to mention the other users to roast them as well as needed 
        ${extra?.summedComments || ''}
        `
      },
      contextMessage
    ]
  })

  const roastMessages = completion.choices.at(0)?.message.parsed?.messages;
  if (!roastMessages) {
    throw new Error("Failed to generate roast messages");
  }

  return roastMessages.map(msg => ({ content: msg.content }));
}

const APP_ISSUE_LABELS = [
  {
    name: "Roaster",
    description: "Roaster Bot",
    color: "ff0000"
  },
  {
    name: "installation",
    description: "Installation Instructions",
    color: "ff0000",
  }
];

export default function appFn(app: Probot) {
  app.on(["installation_repositories.added", "installation_repositories.removed"], async (ctx) => {
    const pld = ctx.payload;
    const owner = pld.sender.login;
    if (pld.action === "removed") {
      pld.repositories_removed.forEach((repo) => {
        app.log.info(`[${pld.installation.account.login}]: Uninstalled the application, from ${repo.name}`)
      })
    } else if (pld.action === "added") {
      pld.repositories_added.forEach(async (repo) => {
        app.log.info(`[${pld.installation.account.login}]: Installation detected. Creating an issue with installation instructions.`);
        await ctx.octokit.issues.create({
          owner: owner,
          repo: repo.name,
          title: "Roaster Bot Installation Instructions",
          body: `To configure the bot, you need to set up the following repository variables:

## Required Variables:
1. \`ROASTER_OPENAI_API_KEY\` - Your OpenAI API key

  ## Optional Variables:
2. \`ROASTER_UNCENSORED\` - Set to "true" to enable uncensored mode (defaults to "false")
3. \`ROASTER_GITHUB_CHANNEL_ENABLED\` - Set to "true" to enable GitHub comments (defaults to "true")
4. \`ROASTER_SLACK_CHANNEL_ENABLED\` - Set to "true" to enable Slack integration (defaults to "false")

  ## Slack Configuration (if enabled):
5. \`ROASTER_SLACK_TOKEN\` - Your Slack bot token (starts with "xoxb-")
6. \`ROASTER_SLACK_CHANNEL_ID\` - The Slack channel ID where roasts will be posted

## Notes:
- Both GitHub and Slack channels can be enabled simultaneously
- At least one channel must be enabled for the bot to function
- Uncensored mode removes professional language filters - use with caution!
- For Slack integration, you'll need to create a Slack app and install it in your workspace

Note: Uncensored mode removes professional language filters. Use with caution!`,
          labels: APP_ISSUE_LABELS,
        });
      })
    }
  })

  app.on("workflow_run.completed", async (ctx) => {
    const workflowRun = ctx.payload.workflow_run;
    const repo = ctx.repo();

    if (workflowRun.conclusion !== "failure") {
      return;
    }

    try {
      // Load configuration
      const configLoader = new ConfigLoader(ctx);
      const config = await configLoader.loadConfig();

      app.log.info(`[${repo.repo}]: Workflow run failed. Generating roasts with configuration:`, {
        githubEnabled: config.channels.github.enabled,
        slackEnabled: config.channels.slack.enabled,
        uncensored: config.roaster.uncensored,
      });

      // Create OpenAI client
      const openai = new OpenAI({
        apiKey: config.openai.apiKey,
      });

      // Create and configure channel manager
      const channelManager = new ChannelManagerImpl(ctx, config);
      
      // Register available channels
      channelManager.registerChannel(new GitHubChannelHandler(ctx));
      channelManager.registerChannel(new SlackChannelHandler(ctx));

      // Generate roasts
      const roastMessages = await generateSavageRoast(workflowRun, openai, config, {}).catch((error) => {
        app.log.error(`[${repo.repo}]: Failed to generate roast:`, JSON.stringify(error, null, 2));
        throw error;
      });
      
      app.log.info(`[${repo.repo}]: Generated ${roastMessages.length} roast(s):`, 
        roastMessages.map(r => r.content.substring(0, 100) + "..."));

      // Send roasts through all enabled channels
      await channelManager.sendRoasts(roastMessages, workflowRun);
      
      app.log.info(`[${repo.repo}]: Successfully processed workflow failure`);
    } catch (error) {
      app.log.error(`[${repo.repo}]: Failed to process workflow failure:`, JSON.stringify(error, null, 2));
    }
  });
};

module.exports = appFn