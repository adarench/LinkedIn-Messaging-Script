const LinkedInClient = require('./linkedin-client');
const { loadProfiles, formatMessage, logMessage, randomSleep } = require('./utils');
const config = require('../config/config');
const fs = require('fs-extra');

/**
 * Main function to run the LinkedIn messaging script
 */
async function main() {
  console.log('Starting LinkedIn messaging script...');
  
  // Track if we've done an initial Sales Navigator check
  let initialSalesNavCheck = false;
  
  // Check for required directories
  await fs.ensureDir('./data');
  await fs.ensureDir('./logs');
  
  // Create a sample profiles.csv file if it doesn't exist
  if (!await fs.pathExists(config.files.profilesCsv)) {
    console.log('Creating sample profiles.csv file...');
    await fs.writeFile(
      config.files.profilesCsv,
      'url,firstName,lastName,industry,topic\n' +
      'https://www.linkedin.com/sales/lead/ACwAAAxxxxxx,John,Doe,Software Development,AI\n' +
      'https://www.linkedin.com/sales/lead/ACwAAAyyyyyy,Jane,Smith,Marketing,Social Media\n'
    );
    console.log(`Sample file created at ${config.files.profilesCsv}`);
    console.log('Please edit this file with your actual prospect data before running the script again.');
    process.exit(0);
  }
  
  // Initialize the LinkedIn client
  const client = new LinkedInClient();
  let success = await client.initialize();
  
  if (!success) {
    console.error('Failed to initialize browser');
    process.exit(1);
  }
  
  // Login to LinkedIn
  success = await client.login();
  
  if (!success) {
    console.error('Failed to login to LinkedIn');
    await client.close();
    process.exit(1);
  }
  
  // Load profiles from CSV
  const profiles = await loadProfiles();
  
  if (profiles.length === 0) {
    console.error('No profiles found in CSV file');
    await client.close();
    process.exit(1);
  }
  
  console.log(`Found ${profiles.length} profiles to message`);
  console.log(`Will send maximum of ${config.messaging.maxMessages} messages`);
  
  // Send messages
  let messagesSent = 0;
  let messagesFailed = 0;
  
  // SIMPLIFIED VERSION - ONE PROFILE AT A TIME
  // First go to the Sales Navigator home to ensure session is active
  console.log('Going to Sales Navigator home page first...');
  try {
    await client.page.goto('https://www.linkedin.com/sales/home', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await randomSleep(3000, 5000);
    await client.page.screenshot({ path: 'sales-nav-home.png' });
    const url = await client.page.url();
    console.log(`Current URL: ${url}`);
  } catch (error) {
    console.error('Error accessing Sales Navigator:', error);
  }
  
  // Process one profile at a time with manual confirmation
  for (let i = 0; i < profiles.length && messagesSent < config.messaging.maxMessages; i++) {
    const profile = profiles[i];
    
    console.log(`\n\n====== PROCESSING PROFILE ${i+1}/${profiles.length} ======`);
    console.log(`Name: ${profile.firstName} ${profile.lastName || ''}`);
    console.log(`URL: ${profile.url}`);
    
    try {
      // Just navigate directly to the profile
      await client.page.goto(profile.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log('Navigated to profile page');
      await randomSleep(3000, 5000);
      
      // Take a screenshot
      const screenshotPath = `profile-${i+1}-${new Date().getTime()}.png`;
      await client.page.screenshot({ path: screenshotPath });
      console.log(`Screenshot saved to ${screenshotPath}`);
      
      // Format the message
      const message = formatMessage(profile);
      console.log('\nMessage to send:');
      console.log('------------------------');
      console.log(message);
      console.log('------------------------');
      
      // Manually find and click message button
      console.log('\nLooking for message button...');
      const messageButton = await client.page.evaluate(() => {
        // Find any button with message text
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          if (button.textContent.toLowerCase().includes('message')) {
            console.log('Found message button with text:', button.textContent);
            button.click();
            return true;
          }
        }
        return false;
      });
      
      if (messageButton) {
        console.log('Clicked message button');
        await randomSleep(3000, 5000);
        
        // Take another screenshot
        await client.page.screenshot({ path: `message-dialog-${i+1}.png` });
        
        // Find the message input and type
        const foundInput = await client.page.evaluate((msg) => {
          // Look for input elements
          const inputs = [
            ...document.querySelectorAll('div[contenteditable="true"]'),
            ...document.querySelectorAll('textarea'),
            ...document.querySelectorAll('div[role="textbox"]')
          ];
          
          for (const input of inputs) {
            // Make input visible for debugging
            input.style.border = '3px solid red';
            
            // Try to set its value
            if (input.tagName === 'TEXTAREA') {
              input.value = msg;
            } else {
              input.innerHTML = msg;
            }
            
            // Also try to focus and type
            input.focus();
            return true;
          }
          return false;
        }, message);
        
        if (foundInput) {
          console.log('Found and filled message input');
          await randomSleep(2000, 3000);
          
          // Also try direct keyboard typing
          await client.page.keyboard.type(message);
          await randomSleep(1000, 2000);
          
          // Take screenshot after typing
          await client.page.screenshot({ path: `typed-message-${i+1}.png` });
          
          // Find and click send button
          const clickedSend = await client.page.evaluate(() => {
            // Find button with send text
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
              if (button.textContent.toLowerCase().includes('send')) {
                button.click();
                return true;
              }
            }
            return false;
          });
          
          if (clickedSend) {
            console.log('Clicked send button');
            await randomSleep(3000, 5000);
            await client.page.screenshot({ path: `after-send-${i+1}.png` });
            
            console.log('Message sent successfully');
            await logMessage(profile, 'success');
            messagesSent++;
          } else {
            console.log('Could not find send button');
            await logMessage(profile, 'failed', 'Could not find send button');
            messagesFailed++;
          }
        } else {
          console.log('Could not find message input');
          await logMessage(profile, 'failed', 'Could not find message input');
          messagesFailed++;
        }
      } else {
        console.log('Could not find message button');
        await logMessage(profile, 'failed', 'Could not find message button');
        messagesFailed++;
      }
      
      // Add a longer delay between profiles
      console.log('\nWaiting before processing next profile...');
      await randomSleep(8000, 12000);
      
    } catch (error) {
      console.error(`Error processing profile: ${error.message}`);
      await logMessage(profile, 'failed', `Error: ${error.message}`);
      messagesFailed++;
      await randomSleep(5000, 8000);
    }
  }
  
  // Close the browser
  await client.close();
  
  // Print summary
  console.log('\n--- Summary ---');
  console.log(`Messages sent: ${messagesSent}`);
  console.log(`Messages failed: ${messagesFailed}`);
  console.log(`Log file: ${config.files.logsCsv}`);
  
  process.exit(0);
}

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(err => {
  console.error('Error in main function:', err);
  
  // Additional debugging information
  if (err.stack) {
    console.error('Stack trace:', err.stack);
  }
  
  if (err.message && err.message.includes('browser')) {
    console.log('\nTROUBLESHOOTING TIPS:');
    console.log('1. Make sure Google Chrome is installed at the default location');
    console.log('2. Try running with NODE_DEBUG=puppeteer npm start for more details');
    console.log('3. Try running: PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install puppeteer');
    console.log('4. Then update the executablePath in linkedin-client.js with your Chrome path');
  }
  
  process.exit(1);
});