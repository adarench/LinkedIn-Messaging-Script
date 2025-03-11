const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config/config');
const { randomSleep, extractSearchableNameFromUrl } = require('./utils');

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

class LinkedInClient {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  /**
   * Initialize the browser and page
   */
  async initialize() {
    try {
      console.log('Initializing browser...');
      
      // Launch browser with stealth mode
      this.browser = await puppeteer.launch({
        headless: false, // Always use non-headless for debugging
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-dev-shm-usage',
          '--window-size=1280,800'
        ],
        defaultViewport: { width: 1280, height: 800 },
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      });
      
      // Only use one page/tab
      this.page = (await this.browser.pages())[0] || await this.browser.newPage();
      
      // Set user agent
      await this.page.setUserAgent(config.browser.userAgent);
      
      // Set extra HTTP headers
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });

      // Set up error handling
      this.page.on('error', err => {
        console.error('Page error:', err);
      });

      // Handle dialog boxes (alerts, confirms, prompts)
      this.page.on('dialog', async dialog => {
        console.log(`Dialog appeared: ${dialog.message()}`);
        await dialog.dismiss();
      });

      return true;
    } catch (error) {
      console.error('Error initializing browser:', error);
      return false;
    }
  }

  /**
   * Login to LinkedIn using session cookies
   */
  async login() {
    try {
      console.log('Logging in to LinkedIn...');
      
      // Navigate to LinkedIn with longer timeout and better error handling
      try {
        console.log('Navigating to LinkedIn homepage...');
        await this.page.goto('https://www.linkedin.com/', { 
          waitUntil: 'domcontentloaded', // Less strict than networkidle2
          timeout: 60000 // 60 second timeout
        });
        console.log('Successfully loaded LinkedIn homepage');
      } catch (navError) {
        console.error('Navigation error:', navError.message);
        // Try to take a screenshot to see what happened
        try {
          await this.page.screenshot({ path: 'linkedin-error.png' });
          console.log('Screenshot saved to linkedin-error.png');
        } catch (e) {
          console.log('Could not save screenshot:', e.message);
        }
        throw new Error(`Failed to navigate to LinkedIn: ${navError.message}`);
      }
      
      await randomSleep(3000, 5000);
      
      // Check if li_at cookie is provided
      if (!config.linkedinCookies.li_at) {
        throw new Error('LinkedIn session cookie (li_at) not provided in config');
      }
      
      console.log('Setting LinkedIn cookies...');
      
      // Set cookies for both LinkedIn and Sales Navigator
      await this.page.setCookie({
        name: 'li_at',
        value: config.linkedinCookies.li_at,
        domain: '.linkedin.com',
        path: '/',
        httpOnly: true,
        secure: true
      });
      
      // Also set for www.linkedin.com
      await this.page.setCookie({
        name: 'li_at',
        value: config.linkedinCookies.li_at,
        domain: 'www.linkedin.com',
        path: '/',
        httpOnly: true,
        secure: true
      });
      
      console.log('Reloading page to apply cookies...');
      
      // Refresh the page to apply cookies
      await this.page.reload({ 
        waitUntil: 'domcontentloaded', // Less strict than networkidle2
        timeout: 60000 // 60 second timeout
      });
      
      console.log('Page reloaded. Checking login status...');
      
      await randomSleep(3000, 5000);
      
      // Take a screenshot to verify login state
      try {
        await this.page.screenshot({ path: 'linkedin-login.png' });
        console.log('Login screenshot saved to linkedin-login.png');
      } catch (e) {
        console.log('Could not save login screenshot:', e.message);
      }
      
      // Check if we're logged in
      const isLoggedIn = await this.checkLoginStatus();
      
      if (!isLoggedIn) {
        console.error('Login failed. Current URL:', await this.page.url());
        throw new Error('Failed to login with provided cookies - session may have expired');
      }
      
      this.isLoggedIn = true;
      console.log('Successfully logged in to LinkedIn');
      return true;
    } catch (error) {
      console.error('Error logging in to LinkedIn:', error);
      return false;
    }
  }

  /**
   * Check if we're logged in to LinkedIn
   */
  async checkLoginStatus() {
    try {
      // Get the current URL
      const currentUrl = await this.page.url();
      console.log('Current page URL:', currentUrl);
      
      // Check if we're on a login page
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        console.log('On login or checkpoint page - not logged in');
        return false;
      }
      
      // Check for elements that only appear when logged in
      const loggedIn = await this.page.evaluate(() => {
        // Look for common elements that indicate we're logged in
        // These are the most common selectors for LinkedIn's logged-in state
        const selectors = [
          '.global-nav', // Older LinkedIn navigation
          '.global-nav__avatar', // Profile picture in nav
          '.feed-identity-module', // Feed identity module
          '.profile-rail-card', // Profile card
          '.artdeco-button--primary', // Primary buttons (might be too generic)
          '.search-global-typeahead', // Search bar
          '.nav-item--profile', // Profile nav item
          'img[alt*="profile"]', // Profile image
          '[data-control-name="identity_profile_photo"]' // Profile photo control
        ];
        
        // Check each selector
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            console.log(`Found logged-in element: ${selector}`);
            return true;
          }
        }
        
        // Look for any element that contains "Sign Out" text
        const signOutElements = Array.from(document.querySelectorAll('a, button, div'))
          .filter(el => el.textContent && el.textContent.toLowerCase().includes('sign out'));
          
        if (signOutElements.length > 0) {
          console.log('Found Sign Out element');
          return true;
        }
        
        return false;
      });
      
      console.log('Login status check result:', loggedIn);
      return loggedIn;
    } catch (error) {
      console.error('Error checking login status:', error);
      return false;
    }
  }

  /**
   * Navigate to a LinkedIn profile
   * @param {string} profileUrl - The LinkedIn profile URL (regular or Sales Navigator)
   * @param {Object} profileData - Optional profile data with firstName and lastName
   */
  async navigateToProfile(profileUrl, profileData) {
    try {
      console.log(`Navigating to profile: ${profileUrl}`);
      
      if (!this.isLoggedIn) {
        throw new Error('Not logged in to LinkedIn');
      }
      
      const isSalesNav = profileUrl.includes('/sales/');
      
      // Navigate to the profile with increased timeout
      console.log(`Navigating to profile URL: ${profileUrl}`);
      await this.page.goto(profileUrl, { 
        waitUntil: 'domcontentloaded', // Less strict than networkidle2
        timeout: 90000 // 90 second timeout
      });
      console.log('Profile page loaded successfully');
      
      // If Sales Navigator is specified but we're on a regular profile, we'll just use regular messaging
      // We're skipping the "View in Sales Navigator" step since it was causing login issues
      if (!isSalesNav && process.env.USE_SALES_NAV === 'true') {
        console.log("Using regular profile for messaging (skipping 'View in Sales Navigator' button)");
      }
      
      // Take a screenshot of the profile
      try {
        const screenshotPath = `profile-${new Date().getTime()}.png`;
        await this.page.screenshot({ path: screenshotPath });
        console.log(`Profile screenshot saved to ${screenshotPath}`);
      } catch (e) {
        console.log('Could not save profile screenshot:', e.message);
      }
      
      // Wait longer before proceeding
      await randomSleep(5000, 8000);
      
      // Check for CAPTCHA or other login challenges
      const hasCaptcha = await this.checkForCaptcha();
      if (hasCaptcha) {
        throw new Error('CAPTCHA detected');
      }
      
      // Check if we're still logged in
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        throw new Error('No longer logged in');
      }
      
      // Determine if we're on a regular profile or Sales Navigator profile
      const isSalesNavigator = profileUrl.includes('/sales/');
      
      // Extract profile information
      const profileInfo = isSalesNavigator ? 
        await this.extractSalesNavProfileInfo() : 
        await this.extractRegularProfileInfo();
      
      return { 
        success: true, 
        profileInfo 
      };
    } catch (error) {
      console.error(`Error navigating to profile: ${profileUrl}`, error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  /**
   * Navigate to a profile via Sales Navigator search
   * @param {string} profileUrl - The LinkedIn profile URL
   * @param {Object} profileData - Optional profile data with firstName and lastName
   */
  async navigateToProfileViaSalesNav(profileUrl, profileData) {
    try {
      // Determine search term - prefer firstName + lastName if available
      let searchableName;
      if (profileData && profileData.firstName && profileData.lastName) {
        searchableName = `${profileData.firstName} ${profileData.lastName}`;
        console.log(`Using profile name for search: ${searchableName}`);
      } else {
        // Extract a searchable name from the profile URL
        searchableName = extractSearchableNameFromUrl(profileUrl);
        console.log(`Using extracted name for search: ${searchableName}`);
      }
      
      // First, make sure we're logged into Sales Navigator
      console.log('Navigating to Sales Navigator homepage...');
      await this.page.goto('https://www.linkedin.com/sales/home', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000
      });
      await randomSleep(5000, 8000);
      
      // Take a screenshot of the Sales Navigator homepage
      const homeScreenshot = `sales-nav-home-${new Date().getTime()}.png`;
      await this.page.screenshot({ path: homeScreenshot });
      console.log(`Sales Navigator homepage screenshot saved to ${homeScreenshot}`);
      
      // Check if we're redirected to login page
      const currentUrl = await this.page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        console.log('Redirected to login page, need to re-login for Sales Navigator');
        await this.login(); // Re-login if needed
        
        // Navigate back to Sales Navigator homepage
        await this.page.goto('https://www.linkedin.com/sales/home', { 
          waitUntil: 'domcontentloaded', 
          timeout: 60000
        });
        await randomSleep(5000, 8000);
      }
      
      // Now navigate to the search page
      console.log('Navigating to Sales Navigator search page...');
      await this.page.goto('https://www.linkedin.com/sales/search/people', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000
      });
      await randomSleep(5000, 8000);
      
      // Take a screenshot of the search page
      const searchScreenshot = `sales-nav-search-${new Date().getTime()}.png`;
      await this.page.screenshot({ path: searchScreenshot });
      console.log(`Search page screenshot saved to ${searchScreenshot}`);
      
      // Look for the search input with more selectors and better error handling
      console.log('Looking for search input...');
      
      // Try multiple selectors for the search input
      const searchSelectors = [
        'input[placeholder*="Search"][type="text"]',
        'input.search-global-typeahead__input',
        '.global-nav-search input',
        'input[aria-label*="Search"]',
        'input.search-input'
      ];
      
      let searchInput = null;
      for (const selector of searchSelectors) {
        console.log(`Trying search selector: ${selector}`);
        searchInput = await this.page.$(selector);
        if (searchInput) {
          console.log(`Found search input with selector: ${selector}`);
          break;
        }
      }
      
      if (!searchInput) {
        // Fallback: Try to navigate directly to the profile page in Sales Navigator
        console.log('Could not find search input, trying direct navigation...');
        const directUrl = `https://www.linkedin.com/sales/search/people/list?keywords=${encodeURIComponent(searchableName)}`;
        
        await this.page.goto(directUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 60000
        });
        await randomSleep(5000, 8000);
      } else {
        // Clear any existing text and search for the profile
        await this.page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="text"]');
          for (const input of inputs) {
            if (input.placeholder && input.placeholder.toLowerCase().includes('search')) {
              input.value = '';
            }
          }
        });
        
        // Type the search query using the searchable name
        console.log(`Searching for profile in Sales Navigator: ${searchableName}`);
        await searchInput.type(searchableName, { delay: 100 });
        await randomSleep(1000, 2000);
        await this.page.keyboard.press('Enter');
        await randomSleep(5000, 8000);
      }
      
      // Take a screenshot of search results
      const resultsScreenshot = `sales-nav-results-${new Date().getTime()}.png`;
      await this.page.screenshot({ path: resultsScreenshot });
      console.log(`Search results screenshot saved to ${resultsScreenshot}`);
      
      // Look for any profile links in the results
      console.log('Looking for matching profiles in search results...');
      
      // Try multiple approaches to find a matching profile
      const foundProfile = await this.page.evaluate((searchName) => {
        // Normalize the search name for better matching
        const normalizedName = searchName.toLowerCase();
        
        // Try to find links that might be profile links
        const possibleProfileLinks = Array.from(document.querySelectorAll('a'))
          .filter(link => {
            const href = link.href || '';
            const text = link.textContent || '';
            return (href.includes('/sales/lead/') || href.includes('/sales/profile/')) &&
                   (text.trim() !== '');
          });
        
        console.log(`Found ${possibleProfileLinks.length} possible profile links`);
        
        // First try: look for exact matches
        for (const link of possibleProfileLinks) {
          const text = link.textContent.toLowerCase();
          if (text.includes(normalizedName)) {
            console.log(`Found exact match: ${text}`);
            link.click();
            return true;
          }
        }
        
        // Second try: click the first result if available
        if (possibleProfileLinks.length > 0) {
          console.log(`Clicking first result: ${possibleProfileLinks[0].textContent}`);
          possibleProfileLinks[0].click();
          return true;
        }
        
        return false;
      }, searchableName);
      
      if (!foundProfile) {
        throw new Error(`Could not find any profile in Sales Navigator search results`);
      }
      
      // Wait for profile page to load
      console.log('Waiting for profile page to load...');
      await randomSleep(5000, 8000);
      
      // Take screenshot of the profile
      const profileScreenshot = `sales-nav-profile-${new Date().getTime()}.png`;
      await this.page.screenshot({ path: profileScreenshot });
      console.log(`Profile screenshot saved to ${profileScreenshot}`);
      
      // Extract profile information
      const profileInfo = await this.extractSalesNavProfileInfo();
      
      return {
        success: true,
        profileInfo
      };
    } catch (error) {
      console.error(`Error navigating to profile via Sales Navigator: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check for CAPTCHA challenge
   */
  async checkForCaptcha() {
    return await this.page.evaluate(() => {
      // Look for common CAPTCHA elements
      const captchaElements = document.querySelectorAll([
        'iframe[src*="captcha"]',
        '.captcha',
        '#captcha',
        'img[src*="captcha"]',
        '.challenge',
        // Add other CAPTCHA selectors as needed
      ].join(','));
      
      return captchaElements.length > 0;
    });
  }

  /**
   * Extract profile information from Sales Navigator
   */
  async extractSalesNavProfileInfo() {
    return await this.page.evaluate(() => {
      // Extract firstName, industry, and other useful information
      // Note: These selectors may need adjustment based on LinkedIn's current DOM structure
      const firstName = document.querySelector('.profile-topcard-person-entity__name')?.innerText.split(' ')[0] || '';
      
      // Try to find industry information
      const industryElement = Array.from(document.querySelectorAll('dt'))
        .find(el => el.innerText.includes('Industry'));
      const industry = industryElement ? 
        industryElement.nextElementSibling?.innerText || 'your industry' : 
        'your industry';
      
      // For the topic, we could use their current position or company
      const position = document.querySelector('.profile-topcard__current-role')?.innerText || 'your business';
      
      return {
        firstName,
        industry,
        position,
        topic: position
      };
    });
  }

  /**
   * Extract profile information from regular LinkedIn profile
   */
  async extractRegularProfileInfo() {
    return await this.page.evaluate(() => {
      // Try to find the name on regular LinkedIn profiles
      const nameElement = document.querySelector('.text-heading-xlarge') || 
                        document.querySelector('.pv-top-card-section__name') ||
                        document.querySelector('.artdeco-entity-lockup__title');
                        
      const fullName = nameElement ? nameElement.innerText.trim() : '';
      const firstName = fullName.split(' ')[0] || '';
      
      // Try to find industry/position from current role
      const positionElement = document.querySelector('.text-body-medium.break-words') ||
                           document.querySelector('.pv-entity__secondary-title') ||
                           document.querySelector('.pv-top-card-section__headline');
                           
      const position = positionElement ? positionElement.innerText.trim() : 'your business';
      
      // For industry, we could look for it, but it's often not prominently displayed
      // Instead, we'll use a generic value
      const industry = 'your industry';
      
      return {
        firstName,
        industry,
        position,
        topic: position
      };
    });
  }

  /**
   * Send a message to the current profile
   * @param {string} message - The message to send
   */
  async sendMessage(message) {
    try {
      console.log('Attempting to send message...');
      
      // Take a screenshot before we start to see the current state
      try {
        const beforeScreenshot = `before-message-${new Date().getTime()}.png`;
        await this.page.screenshot({ path: beforeScreenshot, fullPage: true });
        console.log(`Before messaging screenshot saved to ${beforeScreenshot}`);
      } catch (e) {
        console.log('Could not save before screenshot:', e.message);
      }
      
      // Current URL and page info
      const currentUrl = await this.page.url();
      console.log('Current page URL:', currentUrl);
      
      // Determine if we're on a regular profile or Sales Navigator profile
      const isSalesNavigator = currentUrl.includes('/sales/');
      console.log(`Profile type: ${isSalesNavigator ? 'Sales Navigator' : 'Regular LinkedIn'}`);
      
      // Find and click the message button - different selectors for regular vs Sales Navigator
      let messageButtonClicked = false;
      
      // Try different methods to find and click the message button
      const messagingMethods = [
        // Method 0: Sales Navigator specific method
        async () => {
          // Check if we're on a Sales Navigator page
          const currentUrl = await this.page.url();
          if (currentUrl.includes('/sales/')) {
            console.log('Trying Sales Navigator specific messaging approach...');
            
            // Take a screenshot to debug
            const snScreenshot = `sales-nav-profile-${new Date().getTime()}.png`;
            await this.page.screenshot({ path: snScreenshot });
            
            // First look for the exact message button on Sales Navigator
            try {
              // Wait briefly for the page to fully load
              await randomSleep(3000, 5000);
              
              // Look for the message button with various advanced techniques
              const foundMessageButton = await this.page.evaluate(() => {
                console.log('Looking for message button in Sales Navigator...');
                
                // Primary method: Look for buttons with "Message" text
                const messageButtons = Array.from(document.querySelectorAll('button'))
                  .filter(btn => {
                    const text = btn.textContent.toLowerCase().trim();
                    return text === 'message' || text === 'send message' || text === 'send inmail';
                  });
                
                if (messageButtons.length > 0) {
                  console.log('Found primary message button');
                  messageButtons[0].style.border = '5px solid blue';
                  messageButtons[0].click();
                  return true;
                }
                
                // Secondary method: Look for all buttons on the page and check attributes
                const allButtons = Array.from(document.querySelectorAll('button'));
                
                for (const btn of allButtons) {
                  // Look for buttons with message in their attributes
                  const hasMessageAttr = 
                    (btn.getAttribute('aria-label') || '').toLowerCase().includes('message') ||
                    (btn.getAttribute('data-control-name') || '').toLowerCase().includes('message');
                  
                  // Or in their text
                  const text = btn.textContent.toLowerCase().trim();
                  const hasMessageText = text.includes('message') || text.includes('mail');
                  
                  if (hasMessageAttr || hasMessageText) {
                    console.log('Found button that might be for messaging', 
                      btn.tagName, 
                      btn.getAttribute('aria-label') || '',
                      text);
                    btn.style.border = '5px solid red';
                    btn.click();
                    return true;
                  }
                }
                
                // Last attempt: Any clickable node with 'message' in its text
                const allElements = document.querySelectorAll('a, button, div[role="button"]');
                for (const el of allElements) {
                  const text = el.textContent.toLowerCase();
                  if (text.includes('message') || text.includes('inmail')) {
                    console.log('Found element with message text', el.tagName);
                    el.style.border = '5px solid green';
                    el.click();
                    return true;
                  }
                }
                
                return false;
              });
              
              if (foundMessageButton) {
                console.log('Successfully found and clicked message button in Sales Navigator');
                await randomSleep(3000, 5000);
                return true;
              }
            } catch (e) {
              console.log('Error finding Sales Navigator message button:', e.message);
            }
            
            // If the first approach fails, try with specific selectors
            const messageButtonSelectors = [
              'button[aria-label*="message"]',
              'button[aria-label*="Message"]',
              'button.message-anywhere-button',
              'button[data-control-name="message"]',
              'button[data-control-name="writing_inmail"]',
              'button.artdeco-button--primary[data-control-name="srp_profile_actions"]',
              'button.message-anywhere-button'
            ];
            
            for (const selector of messageButtonSelectors) {
              try {
                const button = await this.page.$(selector);
                if (button) {
                  console.log(`Found Sales Navigator message button with selector: ${selector}`);
                  await button.click();
                  await randomSleep(2000, 3000);
                  return true;
                }
              } catch (e) {
                console.log(`Error with selector ${selector}:`, e.message);
              }
            }
            
            console.log('Could not find message button with standard selectors, trying generic approach');
            return false;
          }
          return false;
        },
        
        // Method 1: Find button with "Message" text in regular profiles
        async () => {
          console.log('Trying method 1: Message button by text...');
          
          // Get all buttons on the page
          const buttons = await this.page.$$('button');
          console.log(`Found ${buttons.length} buttons on page`);
          
          for (const button of buttons) {
            const buttonText = await this.page.evaluate(el => el.innerText, button);
            if (buttonText && buttonText.toLowerCase().includes('message')) {
              console.log('Found message button with text:', buttonText);
              await button.click();
              await randomSleep(2000, 3000);
              return true;
            }
          }
          return false;
        },
        
        // Method 2: More menu approach for regular profiles
        async () => {
          console.log('Trying method 2: More menu approach...');
          
          // First find the "More" button
          const moreButtons = await this.page.$$('button');
          
          for (const button of moreButtons) {
            const buttonText = await this.page.evaluate(el => el.innerText, button);
            if (buttonText && buttonText.toLowerCase().includes('more')) {
              console.log('Found More button, clicking it...');
              await button.click();
              await randomSleep(2000, 3000);
              
              // Now look for the message option in the dropdown
              const messageOptions = await this.page.$$('div[role="button"], button');
              for (const option of messageOptions) {
                const optionText = await this.page.evaluate(el => el.innerText, option);
                if (optionText && optionText.toLowerCase().includes('message')) {
                  console.log('Found Message option in dropdown, clicking it...');
                  await option.click();
                  await randomSleep(2000, 3000);
                  return true;
                }
              }
            }
          }
          return false;
        },
        
        // Method 3: Connect button might lead to message option
        async () => {
          console.log('Trying method 3: Connect button approach...');
          
          // Some profiles have a Connect button that shows a message option
          const connectButtons = await this.page.$$('button');
          
          for (const button of connectButtons) {
            const buttonText = await this.page.evaluate(el => el.innerText, button);
            if (buttonText && buttonText.toLowerCase().includes('connect')) {
              console.log('Found Connect button, clicking it...');
              await button.click();
              await randomSleep(2000, 3000);
              
              // Now look for Add a note or Message option
              const noteOptions = await this.page.$$('button, a');
              for (const option of noteOptions) {
                const optionText = await this.page.evaluate(el => el.innerText, option);
                if (optionText && (
                  optionText.toLowerCase().includes('add a note') || 
                  optionText.toLowerCase().includes('message')
                )) {
                  console.log('Found Add a note option, clicking it...');
                  await option.click();
                  await randomSleep(2000, 3000);
                  return true;
                }
              }
            }
          }
          return false;
        },
        
        // Method 4: Direct messaging link
        async () => {
          console.log('Trying method 4: Direct messaging link...');
          
          // Some profiles have direct messaging links
          const messageLinks = await this.page.$$('a[href*="messaging"]');
          console.log(`Found ${messageLinks.length} messaging links`);
          
          if (messageLinks.length > 0) {
            // Click the first messaging link
            await messageLinks[0].click();
            await randomSleep(2000, 3000);
            return true;
          }
          return false;
        }
      ];
      
      // Try each method until one works
      for (let i = 0; i < messagingMethods.length; i++) {
        if (await messagingMethods[i]()) {
          console.log(`Message button clicked using method ${i + 1}`);
          messageButtonClicked = true;
          break;
        }
      }
      
      // If we still haven't found a way to message, take a screenshot and throw an error
      if (!messageButtonClicked) {
        try {
          const errorScreenshot = `message-button-not-found-${new Date().getTime()}.png`;
          await this.page.screenshot({ path: errorScreenshot, fullPage: true });
          console.log(`Error screenshot saved to ${errorScreenshot}`);
        } catch (e) {
          console.log('Could not save error screenshot:', e.message);
        }
        
        // Dump the HTML for debugging
        const html = await this.page.content();
        require('fs').writeFileSync(`page-content-${new Date().getTime()}.html`, html);
        
        throw new Error('Could not find any way to message this profile');
      }
      
      // Wait longer for message composer to appear
      await randomSleep(3000, 5000);
      
      // Take a screenshot after clicking message button
      try {
        const composerScreenshot = `message-composer-${new Date().getTime()}.png`;
        await this.page.screenshot({ path: composerScreenshot, fullPage: true });
        console.log(`Message composer screenshot saved to ${composerScreenshot}`);
      } catch (e) {
        console.log('Could not save composer screenshot:', e.message);
      }
      
      // Wait for message composer to appear - different selectors for different interfaces
      console.log('Waiting for message composer to appear...');
      
      // List of possible message input selectors
      const possibleInputSelectors = [
        'div[role="textbox"]', 
        'textarea[name="message"]', 
        'div[contenteditable="true"]',
        'textarea.msg-form__textarea',
        'div.msg-form__msg-content-container',
        'div.msg-form__message-texteditor',
        // Sales Navigator specific selectors
        '.compose-form__message-field',
        '[data-control-name="write_inmail"]',
        'textarea',
        '.inmail-component__compose-body-container'
      ];
      
      // Try to find any input that matches our selectors
      let foundInput = false;
      let selector = '';
      
      for (const inputSelector of possibleInputSelectors) {
        try {
          console.log(`Looking for input with selector: ${inputSelector}`);
          const inputExists = await this.page.$(inputSelector);
          
          if (inputExists) {
            console.log(`Found input with selector: ${inputSelector}`);
            foundInput = true;
            selector = inputSelector;
            break;
          }
        } catch (e) {
          console.log(`Error checking for ${inputSelector}:`, e.message);
        }
      }
      
      if (!foundInput) {
        try {
          const errorScreenshot = `message-input-not-found-${new Date().getTime()}.png`;
          await this.page.screenshot({ path: errorScreenshot, fullPage: true });
          console.log(`Error screenshot saved to ${errorScreenshot}`);
          
          // Last resort - try to find ANY element that might be the messaging input
          console.log("Trying last resort approach to find messaging input...");
          
          // Try the html injection approach
          const lastAttempt = await this.page.evaluate(() => {
            // Look for ANY input-like elements
            const possibleInputs = [
              ...document.querySelectorAll('div[contenteditable="true"]'),
              ...document.querySelectorAll('textarea'),
              ...document.querySelectorAll('div[role="textbox"]'),
              ...document.querySelectorAll('[placeholder]'),
              ...document.querySelectorAll('div.msg-form__message-texteditor'),
              ...document.querySelectorAll('div[contenteditable]')
            ];
            
            // Try to find a visible input
            for (const input of possibleInputs) {
              const rect = input.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                // Highlight it for debugging
                input.style.border = '3px solid red';
                return true;
              }
            }
            return false;
          });
          
          if (lastAttempt) {
            console.log("Found a potential input with last resort approach - trying to focus and type");
            // Use tab key to try to focus input 
            await this.page.keyboard.press('Tab');
            await randomSleep(500, 1000);
            
            // Try typing directly
            await this.page.keyboard.type(message, { delay: 50 });
            console.log("Typed message using keyboard simulation");
            
            // Take a screenshot
            const typedScreenshot = `message-typed-last-resort-${new Date().getTime()}.png`;
            await this.page.screenshot({ path: typedScreenshot });
            
            // Look for the send button with a similar approach
            const sendFound = await this.page.evaluate(() => {
              const sendButtons = Array.from(document.querySelectorAll('button'))
                .filter(btn => {
                  const text = btn.textContent.toLowerCase();
                  return text.includes('send');
                });
              
              if (sendButtons.length > 0) {
                sendButtons[0].style.border = '3px solid green';
                sendButtons[0].click();
                return true;
              }
              return false;
            });
            
            if (sendFound) {
              console.log("Found and clicked send button with last resort approach");
              await randomSleep(3000, 5000);
              return { success: true };
            }
          }
        } catch (e) {
          console.log('Could not save error screenshot or run last resort approach:', e.message);
        }
        
        throw new Error('Could not find message composer');
      }
      
      // Clear any existing text first
      await this.page.evaluate((sel) => {
        const input = document.querySelector(sel);
        if (input) {
          if (input.tagName === 'DIV') {
            input.innerText = ''; // For contenteditable divs
          } else {
            input.value = ''; // For textareas
          }
        }
      }, selector);
      
      // Now enter our message
      console.log('Typing message...');
      
      // Type the message with random delays between keystrokes to simulate human typing
      await this.page.type(selector, message, { delay: 50 });
      console.log('Message typed');
      
      // Take a screenshot after typing message
      try {
        const typedScreenshot = `message-typed-${new Date().getTime()}.png`;
        await this.page.screenshot({ path: typedScreenshot, fullPage: true });
        console.log(`After typing screenshot saved to ${typedScreenshot}`);
      } catch (e) {
        console.log('Could not save typing screenshot:', e.message);
      }
      
      await randomSleep(2000, 3000);
      
      // Find and click the send button
      console.log('Looking for send button...');
      
      // List of possible send button selectors
      const possibleSendSelectors = [
        'button[aria-label="Send"]',
        'button[type="submit"]',
        'button.msg-form__send-button',
        'button:has(span:contains("Send"))'
      ];
      
      // Try to find and click the send button
      let sendButtonClicked = false;
      
      for (const sendSelector of possibleSendSelectors) {
        try {
          console.log(`Looking for send button with selector: ${sendSelector}`);
          const sendButtonExists = await this.page.$(sendSelector);
          
          if (sendButtonExists) {
            console.log(`Found send button with selector: ${sendSelector}`);
            await this.page.click(sendSelector);
            sendButtonClicked = true;
            break;
          }
        } catch (e) {
          console.log(`Error checking for ${sendSelector}:`, e.message);
        }
      }
      
      // If specific selectors didn't work, try a more generic approach
      if (!sendButtonClicked) {
        console.log('Using fallback method to find send button...');
        
        // Try to find buttons with "Send" text
        const buttons = await this.page.$$('button');
        console.log(`Found ${buttons.length} buttons to check`);
        
        for (const button of buttons) {
          try {
            const buttonText = await this.page.evaluate(el => {
              return el.innerText || el.textContent || '';
            }, button);
            
            if (buttonText && buttonText.toLowerCase().includes('send')) {
              console.log('Found button with Send text:', buttonText);
              await button.click();
              sendButtonClicked = true;
              break;
            }
          } catch (e) {
            console.log('Error checking button text:', e.message);
          }
        }
      }
      
      // If we still couldn't find a send button, look for the last button in a dialog
      if (!sendButtonClicked) {
        try {
          console.log('Looking for any button in message dialog...');
          
          // Get all buttons in dialogs
          const buttonsInDialog = await this.page.$$('div[role="dialog"] button');
          
          if (buttonsInDialog.length > 0) {
            // Click the last button, which is often the send button
            console.log(`Found ${buttonsInDialog.length} buttons in dialog, clicking the last one`);
            await buttonsInDialog[buttonsInDialog.length - 1].click();
            sendButtonClicked = true;
          }
        } catch (e) {
          console.log('Error with dialog button approach:', e.message);
        }
      }
      
      if (!sendButtonClicked) {
        try {
          const errorScreenshot = `send-button-not-found-${new Date().getTime()}.png`;
          await this.page.screenshot({ path: errorScreenshot, fullPage: true });
          console.log(`Error screenshot saved to ${errorScreenshot}`);
        } catch (e) {
          console.log('Could not save error screenshot:', e.message);
        }
        
        throw new Error('Could not find send button');
      }
      
      // Wait for the message to be sent
      console.log('Waiting for message to be sent...');
      await randomSleep(4000, 7000);
      
      // Take a final screenshot
      try {
        const afterScreenshot = `after-sending-${new Date().getTime()}.png`;
        await this.page.screenshot({ path: afterScreenshot, fullPage: true });
        console.log(`After sending screenshot saved to ${afterScreenshot}`);
      } catch (e) {
        console.log('Could not save after screenshot:', e.message);
      }
      
      // Check for confirmation that message was sent
      let messageSent = false;
      
      try {
        // Look for elements that indicate a message was sent
        messageSent = await this.page.evaluate(() => {
          // Success messages or sent message timestamps
          const successElements = document.querySelectorAll('.msg-s-event-listitem__body, .msg-s-event--timestamp');
          return successElements.length > 0;
        });
        
        if (messageSent) {
          console.log('Found confirmation elements that message was sent');
        } else {
          console.log('No confirmation elements found, but no errors occurred');
        }
      } catch (e) {
        console.log('Error checking for message confirmation:', e.message);
      }
      
      console.log('Message appears to have been sent successfully');
      
      return { 
        success: true 
      };
    } catch (error) {
      console.error('Error sending message:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      console.log('Browser closed');
    }
  }
}

module.exports = LinkedInClient;