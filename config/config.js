module.exports = {
  // LinkedIn credentials
  linkedinCookies: {
    li_at: 'AQEDAS_wraEBi2xOAAABlYd2OwQAAAGVq4K_BFYAaWDasItlJo5HDqScGC0G3FWALdgBFGrmop_oB4evK7HnrVVHehQZNmpwBcUG9eQltr-EWrB4CWogKEjR9Rtn7ns5N_S_XxI6AUn1_pZR8_1U6_3N', // Add your LinkedIn session cookie here
  },
  // Messaging configuration
  messaging: {
    maxMessages: 20, // Maximum number of messages to send before stopping
    delayMin: 2000, // Minimum delay between actions (in ms)
    delayMax: 7000, // Maximum delay between actions (in ms)
    messageTemplate: "Hi {{firstName}},\n\nMy name's Adam, and I'm currently studying at BYU. A friend and I are working on a project where we explore how startups and smaller businesses like yours can use AI and automation to cut costs and drive growth.\n\nWould you be open to a 15-20 minute chat? If so, let me know when works best.\n\nThanks for your time, and I look forward to hearing from you!\n\nBest,\n\nAdam Rencher",
  },
  // File paths
  files: {
    profilesCsv: './data/profiles.csv',
    logsCsv: './logs/sent_messages.csv',
  },
  // Browser configuration
  browser: {
    headless: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  }
};