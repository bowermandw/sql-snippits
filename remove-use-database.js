const fs = require('fs');
const path = require('path');

// Directory containing .sql files to process
const sqlDir = __dirname;

// Get all .sql files in the directory
const sqlFiles = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql'));

console.log(`Found ${sqlFiles.length} SQL files to process.\n`);

for (const file of sqlFiles) {
    const filePath = path.join(sqlDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Normalize line endings to \n for processing
    content = content.replace(/\r\n/g, '\n');

    // Match a leading `USE [database];` line at the top of the file
    // (allowing leading blank lines/whitespace), optionally followed by a `GO` line.
    //   - USE dbo;  | USE [my db]; | USE myDb  (trailing semicolon optional)
    //   - an immediately following line that is just GO
    const useRegex = /^\s*USE\s+(?:\[[^\]]+\]|[^\s;]+)\s*;?[ \t]*\n([ \t]*GO[ \t]*\n)?/i;

    const match = content.match(useRegex);
    if (!match) {
        console.log(`[${file}] No changes needed.`);
        continue;
    }

    const removedGo = Boolean(match[1]);
    content = content.slice(match[0].length);

    // Convert to CRLF for Windows/SQL Server compatibility
    content = content.replace(/\n/g, '\r\n');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[${file}] Modified: Removed USE line${removedGo ? ' and GO' : ''}.`);
}

console.log('\nDone!');
