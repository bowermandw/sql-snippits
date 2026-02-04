#!/usr/bin/env node

/**
 * Generates dates in descending order from start date to end date
 * Format: [[YYYY-MM-DD]]
 * Usage: node generate-dates.js <start-date> <end-date>
 * Example: node generate-dates.js 2026-01-31 2026-01-01
 */

function generateDates(startDate, endDate) {
  // Parse dates as YYYY-MM-DD strings to avoid timezone issues
  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);

  // Validate date format
  if (startParts.length !== 3 || endParts.length !== 3) {
    console.error('Error: Invalid date format. Please use YYYY-MM-DD format.');
    process.exit(1);
  }

  // Create dates using local timezone
  const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);

  // Validate dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('Error: Invalid date format. Please use YYYY-MM-DD format.');
    process.exit(1);
  }

  if (start < end) {
    console.error('Error: Start date must be greater than or equal to end date for descending order.');
    process.exit(1);
  }

  // Generate dates in descending order
  const currentDate = new Date(start);
  const dates = [];

  while (currentDate >= end) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');

    dates.push(`[[${year}-${month}-${day}]]`);

    // Move to previous day
    currentDate.setDate(currentDate.getDate() - 1);
  }

  return dates;
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node generate-dates.js <start-date> <end-date>');
  console.log('Example: node generate-dates.js 2026-01-31 2026-01-01');
  console.log('');
  console.log('Generates dates in descending order from start to end date.');
  console.log('Format: [[YYYY-MM-DD]]');
  process.exit(1);
}

const [startDate, endDate] = args;
const dates = generateDates(startDate, endDate);

// Output each date on a new line
dates.forEach(date => console.log(date));
