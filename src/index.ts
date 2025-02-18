import OpenAI from "openai";
import { ChatCompletionSystemMessageParam, ChatCompletionTool } from "openai/resources/index";
import { Probot } from "probot";
import { z } from "zod";
import { zodResponseFormat, zodFunction } from "openai/helpers/zod";
import type { WorkflowRun } from "@octokit/webhooks-types";
import memesJson from "./memes.json" with { type: "json" };
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"
import { ChatCompletionMessageParam } from "openai/src/resources/index.js";

type CommitComments = RestEndpointMethodTypes['repos']['listCommentsForCommit']['response']['data'];

function sumCommitComments(comments: CommitComments) {
  const summed = [];
  for (const comment of comments) {
    summed.push(`[${comment?.user?.type}][${comment?.user?.login}](${comment?.author_association}):says ${comment.body}`);
  }
  return summed.join("\n");
}

const ROASTER_CONFIG = {
  MAXIMUM_ROAST_LENGTH: 200,
  MAXIMUM_ROASTS: 1,
  uncensored: false,
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

const ROASTER_SYSTEM_PROMPT = <ChatCompletionSystemMessageParam>{
  role: "system",
  content: ROASTER_CONFIG.uncensored ? ROASTER_SYSTEM_PROMPTS.uncensored : ROASTER_SYSTEM_PROMPTS.censored,
}

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

async function generateSavageRoast(wr: WorkflowRun, openai: OpenAI,
  _extra: {
    summedComments?: string
  }) {

  const contextMessage: ChatCompletionMessageParam = {
    role: "user",
    content: `
Generate a savage roast for this CI failure:

🔥 Core Details:
- Workflow: ${wr.display_title}
- Failed by: @${wr.actor.login}
- Commit: "${wr.head_commit.message}"
- Branch: ${wr.head_branch}
- Failure URL: ${wr.html_url}

💀 The Perpetrator:
- Author: ${wr.head_commit.author.name}
- Timestamp: ${wr.head_commit.timestamp}
- Attempt #${wr.run_attempt}

${wr.pull_requests.length > 0 ? `
📌 Pull Request Context:
- PR #${wr.pull_requests[0].number}
- URL: ${wr.pull_requests[0].url}
` : '📌 Note: Direct commit to branch (no PR)'}

Guidelines:
- Maximum length: ${ROASTER_CONFIG.MAXIMUM_ROAST_LENGTH} chars
- Roasts to generate: ${ROASTER_CONFIG.MAXIMUM_ROASTS}
- Format: GitHub-flavored markdown
- Tag the culprit: @${wr.actor.login}
- Include the failure URL in your roast
    `
  }

  const completion = await openai.beta.chat.completions.parse({
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
      ROASTER_SYSTEM_PROMPT,
      {
        role: "system",
        content: `
        Here's some extra context the commit / pr comments try to mention the other users to roast them as well as needed 
        ${_extra?.summedComments}
        `
      },
      contextMessage
    ]
  });
  return completion
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

const OPENAI_API_KEY = "OPENAI_API_KEY"
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
          
1. \`OPENAI_API_KEY\` - Your OpenAI API key
2. \`ROASTER_UNCENSORED\` - Set to "true" to enable uncensored mode (optional, defaults to false)

Note: Uncensored mode removes professional language filters. Use with caution!`,
          labels: APP_ISSUE_LABELS,
        });
      })
    }
  })

  app.on("workflow_run.completed", async (ctx) => {
    const workflowRun = ctx.payload.workflow_run;
    const repo = ctx.repo();

    const [apiKeyData, uncensoredData] = await Promise.all([
      ctx.octokit.actions.getRepoVariable({
        owner: repo.owner,
        repo: repo.repo,
        name: OPENAI_API_KEY
      }),
      ctx.octokit.actions.getRepoVariable({
        owner: repo.owner,
        repo: repo.repo,
        name: 'ROASTER_UNCENSORED'
      }).catch(() => ({ data: { value: 'false' } }))
    ]);

    const apiKey = apiKeyData.data.value;
    ROASTER_CONFIG.uncensored = uncensoredData.data.value.toLowerCase() === 'true';

    if (!apiKey) {
      ctx.log.info(`[${repo.repo}]: No OpenAI API Key found. Please create a new repository variable with the name`)
      return;
    }

    const openai = new OpenAI({
      apiKey: apiKey,
    })

    if (workflowRun.conclusion === "failure") {
      app.log.info(`[${repo.repo}]: Workflow run failed. Generating a roast for the user.`);
      const completion = await generateSavageRoast(workflowRun, openai, {});
      app.log.info(JSON.stringify(completion, null, 2))
      const roastMessages = completion.choices.at(0)?.message.parsed?.messages;
      if (!roastMessages) return;
      app.log.info(`[${repo.repo}]: Roast generated: `, roastMessages?.map(f => f.content).join("\n"));
      if (workflowRun.pull_requests.length > 0) {
        for (const roast of roastMessages) {
          await ctx.octokit.issues.createComment({
            owner: repo.owner,
            issue_number: workflowRun.pull_requests[0].number,
            repo: repo.repo,
            body: roast.content,
          });
        }
      } else {
        const comments = await ctx.octokit.repos.listCommentsForCommit({
          commit_sha: workflowRun.head_commit.id,
          owner: repo.owner,
          repo: repo.repo,
        });
        for (const roast of roastMessages) {
          await ctx.octokit.repos.createCommitComment({
            owner: repo.owner,
            commit_sha: workflowRun.head_commit.id,
            repo: repo.repo,
            body: roast.content,
          });
        }
      }
    }
  });
};

module.exports = appFn