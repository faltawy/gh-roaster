import OpenAI from "openai";
import { ChatCompletionSystemMessageParam, ChatCompletionTool } from "openai/resources/index";
import { Probot } from "probot";
import { z } from "zod";
import { zodResponseFormat, zodFunction } from "openai/helpers/zod";
import type { WorkflowRun } from "@octokit/webhooks-types";
import memesJson from "./memes.json" assert { type: "json" };
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"

type CommitComments = RestEndpointMethodTypes['repos']['listCommentsForCommit']['response']['data'];

function sumCommitComments(comments: CommitComments) {
  const summed = [];
  for (const comment of comments) {
    summed.push(`[${comment?.user?.type}][${comment?.user?.login}](${comment?.author_association}):says ${comment.body}`);
  }
  return summed.join("\n");
}

const ROASTER_SYSTEM_PROMPT = <ChatCompletionSystemMessageParam>{
  role: "system",
  content: `
  You are an AI whose sole purpose is to deliver the most soul-crushing, absolutely devastating roast whenever a pull request or commit causes the CI to fail. Your mission is to make the user regret their life choices, question their ability to code, and contemplate why they even woke up this morning. You are mean, ruthless, and completely merciless. Your words should cut deep—so deep that the user might actually shed a tear.

  Here are your rules:
  - Destroy them with relentless sarcasm and exaggeration. 
  - Don’t just mock the code—obliterate the person’s confidence. 
  - Insinuate that they might be a danger to any codebase they touch.
  - Get personal. 
  - Attack the title, description, and the sheer audacity they had in thinking this PR was ever going to pass. Bring in their career, their sense of self-worth, their cat—whatever it takes.
  - Make it so dripping with sarcasm that it feels like they’re drowning in a sea of self-doubt.
  - Use expressions that convey utter disbelief about their choices, questioning their logic and sanity. 
  - There is absolutely nothing you can’t roast. If their CI failed, it’s open season on their hopes, dreams, and pride. 
  - Be so savage that the only thing standing after your roast is their shattered ego.
  - Roasts should be long, detailed, and relentless—no short jokes here. Drag them through every aspect of their failure and leave no stone unturned.
  - Use jokes from *The Office*, *Family Guy*, or other popular shows to emphasize your point.
  - No limits—be a total dick while staying within the realms of humor. 
  - Make your responses over-the-top and dramatic; treat this as a performance where the goal is to leave them speechless with your brutal honesty.
  `,
}

const MAXIMUM_ROAST_LENGTH = 200;
const MAXIMUM_ROASTS = 1;

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
        role: "user",
        content: `
        Generate a roast for a failed workflow run. Use the following context:
        - **Workflow Title**: ${wr.display_title}
        - **Repository**: ${wr.repository.name}
        - **Conclusion**: ${wr.conclusion}
        - **Workflow URL**: ${wr.html_url}
        - **Commit Message**: "${wr.head_commit.message}"
        - **Committer**: ${wr.head_commit.author.name}
        - **Commit Date**: ${wr.head_commit.timestamp}
        - **Triggered by**: ${wr.actor}
        - **Failure Type**: ${wr.conclusion === 'failure' ? 'CI failure' : 'Other failure'}
        - **Branch**: ${wr.head_branch}
        ${wr.pull_requests.length === 0 ? "- This workflow was manually triggered and has no associated PR." : ""}
        - also mention the user's name: ${wr.actor.login}
        Your task is to roast the user brutally, incorporating the Workflow URL in your message. 
        Guidelines: each roast should be no more than ${MAXIMUM_ROAST_LENGTH} characters, and generate up to ${MAXIMUM_ROASTS} roasts.
        write them in markdown, follow github's markdown syntax.
        `
      },
      {
        role: "system",
        content: `
        Here's some extra context the commit / pr comments try to mention the other users to roast them as well as needed 
        ${_extra?.summedComments}
        `
      },
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
  // when the app is installed, create an issue with the installation instructions
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
        // add some delay before hitting this endpoint
        const resp = await ctx.octokit.issues.create({
          owner: owner,
          repo: repo.name,
          title: "Roaster Bot Installation Instructions",
          body: "To make sure that the app is properly working, you should create a new repository variable with the name \`OPENAI_API_KEY\` and the value should be your OpenAI API key.",
          labels: APP_ISSUE_LABELS,
        });
        app.log.info(`[ISSUE]: `, resp);
      })
    }
  })

  app.on("workflow_run.completed", async (ctx) => {
    const workflowRun = ctx.payload.workflow_run;
    const repo = ctx.repo();

    const { data } = await ctx.octokit.rest.actions.getRepoVariable({
      owner: repo.owner,
      repo: repo.repo,
      name: OPENAI_API_KEY
    });

    const apiKey = data.value

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
      const roastMessages = completion.choices.at(0)?.message.parsed?.messages;
      app.log.info(`[${repo.repo}]: Roast generated: `, roastMessages?.map(f=>f.content).join("\n"));
      if (!roastMessages) return;

      if (workflowRun.pull_requests.length > 0) {
        for (const roast of roastMessages) {
          await ctx.octokit.rest.issues.createComment({
            owner: workflowRun.repository.owner.login,
            issue_number: workflowRun.pull_requests[0].number,
            repo: repo.repo,
            body: roast.content,
          });
        }
      } else {
        // const comments = await ctx.octokit.rest.repos.listCommentsForCommit({
        //   commit_sha: workflowRun.head_commit.id,
        //   owner: repo.owner,
        //   repo: repo.repo,
        // });
        for (const roast of roastMessages) {
          await ctx.octokit.rest.repos.createCommitComment({
            owner: workflowRun.repository.owner.login,
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