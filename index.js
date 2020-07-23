const { WebClient } = require('@slack/web-api')

if (!process.env.SLACK_TOKENS) {
  console.log('Missing SLACK_TOKENS environment variable!')
  process.exit(1);
}

if (!process.env.PR_LABEL) {
  console.log('Missing PR_LABEL environment variable!')
  process.exit(1)
}

const PR_LABEL = process.env.PR_LABEL.toLowerCase();

const slackClients = (JSON.parse(process.env.SLACK_TOKENS)).map(token => {
  return new WebClient(token);
});

// Get a list of slack channels that the bot has been added to
async function getChannels(client) {
  try {
    const response = await client.users.conversations();
    if (!response.ok) {
      throw new Error(`${response.error}`);
    }
    return response.channels;
  } catch (err) {
    throw new Error(`Could not retrieve list of channels: ${err}`);
  }
}

async function sendSlackMessage(msg) {
  const errors = [];

  // Send the message to each Slack workspace
  slackClients.forEach(async client => {
    try {
      const channels = await getChannels(client);
      // Send the message to each channel in the workspace that the the bot is a member of
      channels.forEach(async channel => {
        try {
          const message = { ...msg, channel: channel.id };
          const response = await client.chat.postMessage(message);
          if (!response.ok) {
            throw new Error(response.error);
          }
        } catch (err) {
          errors.push(`Unable to send message to slack channel ${channel.name_normalized}: ${err}`)
        }
      })
    } catch (err) {
      // Error from getChannels
      errors.push(err);
    }
  })
  // If any errors were encountered, don't crash, just print them
  if (errors.length > 0) {
    errors.forEach(err => console.log(err));
  }
}

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  app.on('pull_request.labeled', async context => {
    const { payload } = context;
    const labelName = payload.label.name;

    // Was the "tuvix" label added?
    if (labelName.toLowerCase() !== PR_LABEL) {
      return;
    }

    const repo = payload.repository.full_name;
    const repoURL = payload.repository.html_url;
    const { pull_request, sender } = payload;
    const { 
      html_url: prURL, title: prTitle, created_at: prCreatedAt, number: prNumber, user,
    } = pull_request;

    sendSlackMessage({
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `${sender.login} is requesting a review in <${repoURL}|${repo}>`
          }
        }
      ],
      attachments: [
        {
          color: '#FFC107',
          author_name: user.login,
          author_icon: user.avatar_url,
          author_link: user.html_url,
          title: `#${prNumber} - ${prTitle}`,
          title_link: prURL,
          footer: `${repo}`,
          footer_icon: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
          ts: new Date(prCreatedAt) / 1000,
        }
      ]
    });
  })

  app.on('pull_request.closed', async context => {
    const { payload } = context;

    // Is the PR labeled with the "tuvix" label?
    if (payload.pull_request.labels.findIndex(label => label.name === PR_LABEL) < 0) {
      return;
    }

    // Was the PR merged?
    if (payload.pull_request.merged) {
      const repo = payload.repository.full_name;
      const { pull_request } = payload;
      const { 
        html_url: prURL, number: prNumber, merged_at: mergedAt, merged_by, base: { ref: baseRef }
      } = pull_request;
      

      sendSlackMessage({
        text: "",
        attachments: [
          {
            color: '#607D8B',
            author_name: merged_by.login,
            author_icon: merged_by.avatar_url,
            author_link: merged_by.html_url,
            title: `Merged #${prNumber} into ${baseRef}`,
            title_link: prURL,
            footer: `${repo}`,
            footer_icon: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            ts: new Date(mergedAt) / 1000,
          }
        ]
      });
    }
  });

  app.on('pull_request_review.submitted', async context => {
    const { payload } = context;

    // Is the PR labeled with the "tuvix" label?
    if (payload.pull_request.labels.findIndex(label => label.name === PR_LABEL) < 0) {
      return;
    }
    
    const { review } = payload;
    
    if (review.state === 'approved') {
      const repo = payload.repository.full_name;
      const { pull_request } = payload;
      const { 
        html_url: prURL, title: prTitle, number: prNumber,
      } = pull_request;

      const { user, submitted_at: reviewSubmittedAt } = review;

      sendSlackMessage({
        text: "",
        attachments: [
          {
            color: '#388E3C',
            author_name: user.login,
            author_icon: user.avatar_url,
            author_link: user.html_url,
            title: `Approved #${prNumber} - ${prTitle}`,
            title_link: prURL,
            footer: `${repo}`,
            footer_icon: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            ts: new Date(reviewSubmittedAt) / 1000,
          }
        ]
      });
    }
  })
}
