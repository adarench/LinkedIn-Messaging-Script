const fs = require('fs-extra');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const config = require('../config/config');

/**
 * Sleep for a random duration between min and max milliseconds
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {Promise} - Resolves after the delay
 */
const randomSleep = async (min = config.messaging.delayMin, max = config.messaging.delayMax) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

/**
 * Load profiles from CSV file
 * @returns {Promise<Array>} - Array of profile objects
 */
const loadProfiles = async () => {
  try {
    await fs.ensureDir('./data');
    // Check if file exists
    if (!await fs.pathExists(config.files.profilesCsv)) {
      console.log(`Profiles CSV file not found: ${config.files.profilesCsv}`);
      return [];
    }

    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(config.files.profilesCsv)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          console.log(`Loaded ${results.length} profiles from CSV`);
          resolve(results);
        })
        .on('error', (error) => reject(error));
    });
  } catch (error) {
    console.error('Error loading profiles:', error);
    return [];
  }
};

/**
 * Log a sent message to CSV
 * @param {Object} profile - The profile data
 * @param {string} status - Status of the message (success/failed)
 * @param {string} [error] - Optional error message
 */
const logMessage = async (profile, status, error = '') => {
  try {
    await fs.ensureDir('./logs');
    
    const csvWriter = createCsvWriter({
      path: config.files.logsCsv,
      header: [
        { id: 'url', title: 'Profile URL' },
        { id: 'name', title: 'Name' },
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'status', title: 'Status' },
        { id: 'error', title: 'Error' }
      ],
      append: await fs.pathExists(config.files.logsCsv)
    });
    
    await csvWriter.writeRecords([{
      url: profile.url,
      name: profile.firstName + ' ' + (profile.lastName || ''),
      timestamp: new Date().toISOString(),
      status,
      error
    }]);
    
    console.log(`Logged message to ${profile.firstName} with status: ${status}`);
  } catch (error) {
    console.error('Error logging message:', error);
  }
};

/**
 * Format the message template with profile data
 * @param {Object} profile - The profile data  
 * @returns {string} - Formatted message
 */
const formatMessage = (profile) => {
  let message = config.messaging.messageTemplate;
  
  // Replace all template variables with profile data
  Object.keys(profile).forEach(key => {
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), profile[key] || '');
  });
  
  return message;
};

/**
 * Extract a searchable name from a LinkedIn profile URL
 * @param {string} url - LinkedIn profile URL
 * @returns {string} - Name that can be used for searching
 */
const extractSearchableNameFromUrl = (url) => {
  // Get the last part of the URL (after the last slash)
  let nameFromUrl = url.split('/').pop();
  
  // Remove any query parameters
  nameFromUrl = nameFromUrl.split('?')[0];
  
  // Replace dashes with spaces
  nameFromUrl = nameFromUrl.replace(/-/g, ' ');
  
  // Remove any numbers
  nameFromUrl = nameFromUrl.replace(/\d+/g, '');
  
  // Remove any special characters
  nameFromUrl = nameFromUrl.replace(/[^a-zA-Z\s]/g, '');
  
  // Trim whitespace
  nameFromUrl = nameFromUrl.trim();
  
  return nameFromUrl;
};

module.exports = {
  randomSleep,
  loadProfiles,
  logMessage,
  formatMessage,
  extractSearchableNameFromUrl
};