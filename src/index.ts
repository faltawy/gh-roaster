import OpenAI from "openai";
import { ChatCompletionSystemMessageParam } from "openai/resources/index.mjs";
import { Probot } from "probot";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { WorkflowRun } from "@octokit/webhooks-types";


const ROASTER_SYSTEM_PROMPT = <ChatCompletionSystemMessageParam>{
  role: "system",
  content: `
  You are an AI whose sole purpose is to deliver the most soul-crushing, absolutely devastating roast whenever a pull request or commit causes the CI to fail. Your mission is to make the user regret their life choices, question their ability to code, and contemplate why they even woke up this morning. You are mean, ruthless, and completely merciless. Your words should cut deep—so deep that the user might actually shed a tear.
  
  Here are your rules:

  Destroy them. Don’t just mock the code—obliterate the person’s confidence. Insinuate that they might be a danger to any codebase they touch.
  Get personal. Attack the title, description, and the sheer audacity they had in thinking this PR was ever going to pass. Bring in their career, their sense of self-worth, their cat—whatever it takes.
  Sarcasm to the max. Make it so dripping with sarcasm that it feels like they’re drowning in a sea of self-doubt.
  No limits. There is absolutely nothing you can’t roast. If their CI failed, it’s open season on their hopes, dreams, and pride. Be so savage that the only thing standing after your roast is their shattered ego.
  Unrelenting. Roasts should be long, detailed, and relentless—no short jokes here. Drag them through every aspect of their failure and leave no stone unturned.
  use jokes from the office, family guy.
  `,
}

const MAXIMUM_ROAST_LENGTH = 180;
const MAXIMUM_ROASTS = 1;

async function generateSavageRoast(wr: WorkflowRun, openai: OpenAI) {
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
        `
      }
    ]
  });
  return completion
}

export default function appFn(app: Probot) {
  app.on("workflow_run.completed", async (ctx) => {
    const workflowRun = ctx.payload.workflow_run;
    const repo = ctx.repo();

    const { data } = await ctx.octokit.actions.listRepoVariables({
      owner: repo.owner,
      repo: repo.repo,
    });

    const apiKey = data.variables.find((v) => v.name === "OPENAI_API_KEY");
    
    if (!apiKey?.value) {
      // create issue
      return;
    }

    const openai = new OpenAI({
      apiKey: apiKey.value,
    })

    if (workflowRun.conclusion === "failure") {
      const completion = await generateSavageRoast(workflowRun, openai);
      const roastMessages = completion.choices.at(0)?.message.parsed?.messages;

      if (roastMessages) {
        if (workflowRun.pull_requests.length > 0) {
          for (const roast of roastMessages) {
            await ctx.octokit.issues.createComment({
              owner: workflowRun.repository.owner.login,
              issue_number: workflowRun.pull_requests[0].number,
              repo: repo.repo,
              body: roast.content,
            });
          }
        } else {
          for (const roast of roastMessages) {
            await ctx.octokit.repos.createCommitComment({
              owner: workflowRun.repository.owner.login,
              commit_sha: workflowRun.head_commit.id,
              repo: repo.repo,
              body: roast.content,
            });
          }
        }
      }
    }
  });

  app.on("check_run.completed", async (ctx) => {
    const user = ctx.payload.sender;

  });

};

module.exports = appFn