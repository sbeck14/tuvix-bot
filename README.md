# tuvix-bot

> A GitHub App built with [Probot](https://github.com/probot/probot)

## Environment Variables

- `APP_ID`: Obtained from Github during app setup
- `WEBHOOK_SECRET`: Obtained from Github during app setup
- `SLACK_TOKENS`: JSON array of Slack OAuth bot tokens
- `PR_LABEL`: Label to listen for


## Notes

To convert a `.pem` to one line format (for a `.env`):

`awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' [filename]`