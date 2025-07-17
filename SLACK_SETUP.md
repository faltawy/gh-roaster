# Slack Integration Setup Guide

This guide will help you set up Slack integration for the GitHub Roaster Bot.

## Prerequisites

- Admin access to your Slack workspace
- Admin access to your GitHub repository
- The GitHub Roaster Bot already installed in your repository

## Step 1: Create a Slack App

1. Go to [Slack API](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch"
3. Enter an app name (e.g., "GitHub Roaster Bot")
4. Select your workspace
5. Click "Create App"

## Step 2: Configure Bot Permissions

1. In your app settings, go to "OAuth & Permissions" in the left sidebar
2. Scroll down to "Scopes" section
3. Under "Bot Token Scopes", add the following permissions:
   - `chat:write` - Send messages as the bot
   - `chat:write.public` - Send messages to channels the bot isn't a member of
   - `channels:read` - View basic information about public channels

## Step 3: Install the App to Your Workspace

1. In the "OAuth & Permissions" page, click "Install to Workspace"
2. Review the permissions and click "Allow"
3. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

## Step 4: Get Your Channel ID

### Method 1: Using Slack App
1. Open Slack in your browser or desktop app
2. Navigate to the channel where you want roasts to be posted
3. Look at the URL - the channel ID is the part after `/messages/`
   - Example: `https://yourworkspace.slack.com/messages/C1234567890/`
   - Channel ID: `C1234567890`

### Method 2: Using Slack API
1. Go to [Slack API Tester](https://api.slack.com/methods/conversations.list/test)
2. Use your bot token to list all channels
3. Find your target channel in the response

## Step 5: Configure GitHub Repository Variables

In your GitHub repository, go to **Settings** → **Security** → **Secrets and variables** → **Actions** → **Variables** tab.

Add the following repository variables:

### Required for Slack Integration:
- `ROASTER_SLACK_CHANNEL_ENABLED` = `true`
- `ROASTER_SLACK_TOKEN` = `xoxb-your-bot-token-here`
- `ROASTER_SLACK_CHANNEL_ID` = `C1234567890` (your channel ID)

### Optional GitHub Channel Control:
- `ROASTER_GITHUB_CHANNEL_ENABLED` = `true` (default: true)

-### Other Configuration:
- `ROASTER_OPENAI_API_KEY` = `sk-your-openai-api-key` (required)
- `ROASTER_UNCENSORED` = `false` (default: false)

## Step 6: Test Your Setup

1. Make a commit that breaks your CI/CD pipeline
2. Wait for the workflow to fail
3. Check both GitHub (if enabled) and Slack (if enabled) for roast messages

## Channel Configuration Options

You can configure which channels are enabled:

| Configuration | GitHub | Slack | Result |
|---------------|--------|--------|--------|
| Default | ✅ | ❌ | Roasts posted to GitHub only |
| GitHub Only | ✅ | ❌ | Roasts posted to GitHub only |
| Slack Only | ❌ | ✅ | Roasts posted to Slack only |
| Both Enabled | ✅ | ✅ | Roasts posted to both GitHub and Slack |

## Troubleshooting

### Common Issues:

1. **"Missing ROASTER_SLACK_TOKEN"**
   - Ensure you've set the `ROASTER_SLACK_TOKEN` repository variable
   - Verify the token starts with `xoxb-`

2. **"Missing ROASTER_SLACK_CHANNEL_ID"**
   - Ensure you've set the `ROASTER_SLACK_CHANNEL_ID` repository variable
   - Verify the channel ID format (usually starts with `C`)

3. **"Bot not in channel" error**
   - The bot needs to be added to private channels
   - For public channels, the bot can post with `chat:write.public` permission

4. **"Invalid channel" error**
   - Verify the channel ID is correct
   - Ensure the channel exists and the bot has access

### Adding Bot to a Channel:

1. In Slack, go to the channel
2. Click the channel name at the top
3. Go to "Integrations" tab
4. Click "Add apps"
5. Search for your bot and add it

## Message Format

When posting to Slack, the bot will create rich message blocks including:
- Repository and workflow information
- Failure details with a link to the failed run
- The generated roast content
- Pull request information (if applicable)

## Security Considerations

- Keep your `ROASTER_SLACK_TOKEN` secret and never commit it to your repository
- Use GitHub's encrypted secrets/variables feature
- Consider using a dedicated bot account rather than a personal token
- Regularly rotate your Slack tokens

## Need Help?

If you encounter issues:
1. Check the GitHub Actions logs for error messages
2. Verify all repository variables are set correctly
3. Test your Slack token using the Slack API tester
4. Ensure your bot has the necessary permissions in Slack 