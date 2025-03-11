# LinkedIn Sales Navigator Messaging Script

A Node.js automation script using Puppeteer to send personalized messages to LinkedIn Sales Navigator profiles.

## Features

- Logs in to LinkedIn using stored session cookies
- Navigates to Sales Navigator profiles from a CSV file
- Sends personalized messages to each profile
- Randomizes delays to mimic human behavior
- Stores logs of sent messages in CSV format
- Configurable message limit
- Uses headless browser with stealth mode to minimize detection
- Includes error handling for CAPTCHAs, logouts, and failed sends

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

## Configuration

Edit the `config/config.js` file:

1. Add your LinkedIn session cookie (`li_at`) 
2. Configure message template
3. Set maximum number of messages to send
4. Adjust delay times if needed
5. Configure file paths if needed

### How to Get Your LinkedIn Session Cookie

1. Log in to LinkedIn in your browser
2. Open Developer Tools (F12 or right-click > Inspect)
3. Go to Application > Storage > Cookies
4. Find the `li_at` cookie and copy its value
5. Paste it into the `config.js` file

## CSV Profile Format

Create a CSV file at `./data/profiles.csv` with these headers:

```
url,firstName,lastName,industry,topic
```

Example for direct Sales Navigator URLs:
```
url,firstName,lastName,industry,topic
https://www.linkedin.com/sales/lead/ACwAAAxxxxxx,John,Doe,Software Development,AI
https://www.linkedin.com/sales/lead/ACwAAAyyyyyy,Jane,Smith,Marketing,Social Media
```

Example for regular LinkedIn profile URLs:
```
url,firstName,lastName,industry,topic
https://www.linkedin.com/in/johndoe,John,Doe,Software Development,AI
https://www.linkedin.com/in/janesmith,Jane,Smith,Marketing,Social Media
```

The script will use this data to personalize messages. A sample file will be created automatically on first run.

### Regular Profiles vs. Sales Navigator

The script now supports both direct Sales Navigator links and regular LinkedIn profile URLs:

1. When using regular LinkedIn profile URLs (linkedin.com/in/...), the script will search for the profiles in Sales Navigator and then send messages.
2. When using direct Sales Navigator links (linkedin.com/sales/lead/...), it will navigate directly to those profiles.

## Message Personalization

You can use variables in your message template by using `{{variableName}}` syntax:

- `{{firstName}}` - The person's first name
- `{{industry}}` - Their industry
- `{{topic}}` - A topic of interest (from CSV or detected from their profile)

Example template:
```
Hi {{firstName}}, I noticed you're in {{industry}}. I'd love to connect about {{topic}}.
```

## Usage

Run the script with either of these commands:

```bash
# Standard mode - works with both direct Sales Navigator links and regular profiles
npm start

# Enhanced Sales Navigator mode - always uses Sales Navigator search for all profiles
npm run start:sales
```

The script will:
1. Create a sample profiles.csv file on first run if none exists
2. Initialize the headless browser
3. Log in to LinkedIn using your session cookie
4. Process each profile in the CSV file
5. Find profiles in Sales Navigator if using regular LinkedIn URLs
6. Send personalized messages
7. Log results to `./logs/sent_messages.csv`

## Error Handling

The script handles:
- LinkedIn login failures
- CAPTCHA challenges
- Navigation errors
- Message sending failures

All errors are logged to the console and to the CSV log file.

## Warning

This tool is for educational purposes. LinkedIn's Terms of Service may prohibit automation. Use responsibly and at your own risk. Consider:

- Using long delays between actions (already configured)
- Limiting the number of messages sent per day
- Not running the script continuously
- Using your own real LinkedIn account
- Ensuring message content is personalized and relevant

## License

MIT