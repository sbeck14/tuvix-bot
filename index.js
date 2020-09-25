const { WebClient } = require('@slack/web-api');

if (!process.env.SLACK_TOKENS) {
  console.log('Missing SLACK_TOKENS environment variable!');
  process.exit(1);
}

if (!process.env.PR_LABEL) {
  console.log('Missing PR_LABEL environment variable!');
  process.exit(1);
}

const PR_LABEL = process.env.PR_LABEL.toLowerCase();

const slackClients = (JSON.parse(process.env.SLACK_TOKENS)).map((token) => new WebClient(token));

/**
 * Is the webhook for a PR that is targeted by this app? (i.e. includes PR_LABEL)
 * @param {import('probot').Context} context
 */
function isTargeted(context) {
  // Is the PR labeled with the "tuvix" label?
  if (context.payload.pull_request.labels.findIndex((label) => label.name === PR_LABEL) < 0) {
    return false;
  }
  return true;
}

/**
 * Shorten string to the specified length
 * @param {string} str String to shorten
 * @param {number} len Maximum length of string
 */
function trunc(str, len) {
  return str.length > len ? `${str.substring(0, len)}...` : str;
}

/**
 * Cut string at the first instance of a newline
 * @param {string} str String to cut
 */
function cutAtFirstNewline(str) {
  return str.indexOf('\n') >= 0 ? `${str.substring(0, str.indexOf('\n'))}...` : str;
}

/**
 * Get a list of slack channels that the bot has been added to
 * @param {object} client
 */
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

/**
 * Send a message to each Slack workspace specified in the app config
 * @param {object} msg
 */
async function sendSlackMessage(msg) {
  const errors = [];

  // Send the message to each Slack workspace
  slackClients.forEach(async (client) => {
    try {
      const channels = await getChannels(client);
      // Send the message to each channel in the workspace that the the bot is a member of
      channels.forEach(async (channel) => {
        try {
          const message = { ...msg, channel: channel.id };
          const response = await client.chat.postMessage(message);
          if (!response.ok) {
            throw new Error(response.error);
          }
        } catch (err) {
          errors.push(`Unable to send message to slack channel ${channel.name_normalized}: ${err}`);
        }
      });
    } catch (err) {
      // Error from getChannels
      errors.push(err);
    }
  });
  // If any errors were encountered, don't crash, just print them
  if (errors.length > 0) {
    errors.forEach((err) => console.log(err));
  }
}

/**
 * Notify Slack when a PR is labeled with the PR_LABEL
 * @param {import('probot').Application} app
 * @param {import('probot').Context} context
 */
async function handleLabeled(app, context) {
  const { payload } = context;
  const labelName = payload.label.name;

  // Was a label added that matches PR_LABEL?
  if (labelName.toLowerCase() !== PR_LABEL) {
    return;
  }

  app.log(`New "${PR_LABEL}" labeled PR detected!`);

  const {
    repository: {
      full_name: repo,
      html_url: repoURL,
    },
    pull_request: {
      html_url: prURL,
      title: prTitle,
      created_at: prCreatedAt,
      number: prNumber,
      user,
    },
    sender,
  } = payload;

  sendSlackMessage({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${sender.login} is requesting a review in <${repoURL}|${repo}>`,
        },
      },
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
        footer_icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
        ts: new Date(prCreatedAt) / 1000,
      },
    ],
  });
}

/**
 * Notify Slack when a targeted PR has been closed
 * @param {import('probot').Application} app
 * @param {import('probot').Context} context
 */
async function handleClosed(app, context) {
  if (!isTargeted(context)) {
    return;
  }

  const {
    payload: {
      pull_request: {
        html_url: prURL,
        number: prNumber,
        merged_at: mergedAt,
        merged_by: mergedBy,
        merged: wasMerged,
        closed_at: closedAt,
        base: { ref: baseRef },
      },
      repository: { full_name: repo },
      sender,
    },
  } = context;

  const attachment = {
    color: '#607D8B',
    title_link: prURL,
    footer: `${repo}`,
    footer_icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
  };

  // Was the PR merged?
  if (wasMerged) {
    app.log(`"${PR_LABEL}" labeled PR #${prNumber} in ${repo} was merged by ${mergedBy.login}!`);
    attachment.author_name = mergedBy.login;
    attachment.author_icon = mergedBy.avatar_url;
    attachment.author_link = mergedBy.html_url;
    attachment.title = `Merged #${prNumber} into ${baseRef}`;
    attachment.ts = new Date(mergedAt) / 1000;
  } else {
    app.log(`"${PR_LABEL}" labeled PR #${prNumber} in ${repo} was closed by ${sender.login}.`);
    attachment.author_name = sender.login;
    attachment.author_icon = sender.avatar_url;
    attachment.author_link = sender.html_url;
    attachment.title = `Closed #${prNumber}`;
    attachment.ts = new Date(closedAt) / 1000;
  }
  sendSlackMessage({ text: '', attachments: [attachment] });
}

/**
 * Notify Slack when a targeted PR has been re-opened
 * @param {import('probot').Application} app
 * @param {import('probot').Context} context
 */
async function handleReopened(app, context) {
  if (!isTargeted(context)) {
    return;
  }

  const {
    payload: {
      repository: {
        full_name: repo,
      },
      pull_request: {
        html_url: prURL,
        title: prTitle,
        created_at: prCreatedAt,
        number: prNumber,
      },
      sender,
    },
  } = context;

  sendSlackMessage({
    text: '',
    attachments: [
      {
        color: '#FFC107',
        author_name: sender.login,
        author_icon: sender.avatar_url,
        author_link: sender.html_url,
        title: `Reopened #${prNumber} - ${prTitle}`,
        title_link: prURL,
        footer: `${repo}`,
        footer_icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
        ts: new Date(prCreatedAt) / 1000,
      },
    ],
  });
}

/**
 * Notify Slack when a targeted PR has a new review
 * @param {import('probot').Application} app
 * @param {import('probot').Context} context
 */
async function handleReviewSubmitted(app, context) {
  if (!isTargeted(context)) {
    return;
  }

  const { payload } = context;

  if (payload.review.state !== 'approved' && payload.review.state !== 'changes_requested') {
    return;
  }

  const {
    review: {
      state: reviewState, body: reviewBody, user: reviewUser, submitted_at: reviewSubmittedAt,
    },
    repository: { full_name: repo },
    pull_request: { html_url: prURL, title: prTitle, number: prNumber },
  } = payload;

  const attachment = {
    author_name: reviewUser.login,
    author_icon: reviewUser.avatar_url,
    author_link: reviewUser.html_url,
    title_link: prURL,
    footer: `${repo}`,
    footer_icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    ts: new Date(reviewSubmittedAt) / 1000,
    text: trunc(cutAtFirstNewline(reviewBody), 60),
  };

  if (reviewState === 'approved') {
    app.log(`"${PR_LABEL}" labeled PR #${prNumber} in ${repo} was approved by ${reviewUser.login}!`);
    attachment.color = '#388E3C';
    attachment.title = `Approved #${prNumber} - ${prTitle}`;
  } else if (reviewState === 'changes_requested') {
    app.log(`Changes were requested on "${PR_LABEL}" labeled PR #${prNumber} in ${repo} by ${reviewUser.login}`);
    attachment.color = '#D33A49';
    attachment.title = `Changes requested on #${prNumber} - ${prTitle}`;
  }
  sendSlackMessage({ text: '', attachments: [attachment] });
}

/**
 * Probot app Entrypoint
 * @param {import('probot').Application} app
 */
module.exports = (app) => {
  // Your code here
  app.log('Yay, the app was loaded!');

  app.on('pull_request.labeled', handleLabeled.bind(null, app));
  app.on('pull_request.closed', handleClosed.bind(null, app));
  app.on('pull_request.reopened', handleReopened.bind(null, app));
  app.on('pull_request_review.submitted', handleReviewSubmitted.bind(null, app));
};
