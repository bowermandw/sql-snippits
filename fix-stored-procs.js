const fs = require('fs');
const path = require('path');

// Directory containing stored procedures to process
const storedProcDir = __dirname;

// Read the flowerbox template (preserve indentation, only trim trailing whitespace)
const flowerboxTemplate = fs.readFileSync(path.join(__dirname, 'flowerbox.sql'), 'utf8')
    .replace(/\r\n/g, '\n')
    .trimEnd();

// Get all .sql files in the directory (excluding the template)
const sqlFiles = fs.readdirSync(storedProcDir)
    .filter(f => f.endsWith('.sql') && f !== 'flowerbox.sql');

console.log(`Found ${sqlFiles.length} SQL files to process.\n`);

for (const file of sqlFiles) {
    const filePath = path.join(storedProcDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Normalize line endings to \n for processing
    content = content.replace(/\r\n/g, '\n');

    // Check if this is a stored procedure file (must have CREATE PROCEDURE or CREATE OR ALTER PROCEDURE)
    const isStoredProc = /create\s+(or\s+alter\s+)?procedure\s+/i.test(content);
    if (!isStoredProc) {
        console.log(`[${file}] Skipping: Not a stored procedure file.`);
        continue;
    }

    let modified = false;
    const changes = [];

    // Extract procedure name from the CREATE/ALTER statement
    // Handles: dbo.name, [dbo].[name], or just name
    const procNameMatch = content.match(/create\s+(or\s+alter\s+)?procedure\s+((\[?[\w]+\]?\.)?\[?[\w]+\]?)/i);
    // Get full procedure name (schema.name), removing brackets - group 2 contains the full name
    const fullProcName = procNameMatch ? procNameMatch[2].replace(/\[|\]/g, '') : 'Unknown';

    // Get file creation date
    const fileStats = fs.statSync(filePath);
    const createdDate = fileStats.birthtime.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if flowerbox exists (look for the distinctive pattern)
    const hasFlowerbox = content.includes('/************************************************');

    // Find the BEGIN statement
    const beginMatch = content.match(/^BEGIN\s*$/im);

    if (!beginMatch) {
        console.log(`[${file}] WARNING: Could not find BEGIN statement, skipping.`);
        continue;
    }

    const beginIndex = content.indexOf(beginMatch[0]);
    const afterBegin = content.substring(beginIndex + beginMatch[0].length);

    // If no flowerbox, add one after BEGIN
    if (!hasFlowerbox) {
        const beforeBegin = content.substring(0, beginIndex + beginMatch[0].length);
        const restContent = afterBegin;

        // Fill in the flowerbox template with procedure name and creation date
        const filledFlowerbox = flowerboxTemplate
            .replace('Procedure Name: ', `Procedure Name: ${fullProcName}`)
            .replace('{{created_date}}', createdDate);

        content = beforeBegin + '\n' + filledFlowerbox + restContent;
        modified = true;
        changes.push('Added flowerbox');
    }

    // Check for SET NOCOUNT ON; after the flowerbox
    // Find the end of the flowerbox (the closing ***/)
    const flowerboxEndMatch = content.match(/\*{4,}\/\s*\n/);
    if (flowerboxEndMatch) {
        const flowerboxEndIndex = content.indexOf(flowerboxEndMatch[0]) + flowerboxEndMatch[0].length;
        const afterFlowerbox = content.substring(flowerboxEndIndex);

        // Check if SET NOCOUNT ON is already there (allowing for whitespace)
        const hasSetNocount = /^\s*SET\s+NOCOUNT\s+ON\s*;/i.test(afterFlowerbox);

        if (!hasSetNocount) {
            const beforeFlowerboxEnd = content.substring(0, flowerboxEndIndex);
            content = beforeFlowerboxEnd + '    SET NOCOUNT ON;\n' + afterFlowerbox;
            modified = true;
            changes.push('Added SET NOCOUNT ON;');
        }
    }

    // Check for GO followed by newline at the end
    const endsWithGo = /\nGO\r?\n$/.test(content) || /\nGO\s*$/.test(content);

    if (!endsWithGo) {
        // Remove any trailing whitespace/newlines and add GO\n
        content = content.trimEnd() + '\nGO\n';
        modified = true;
        changes.push('Added GO at end');
    }

    if (modified) {
        // Convert to CRLF for Windows/SQL Server compatibility
        content = content.replace(/\n/g, '\r\n');

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[${file}] Modified: ${changes.join(', ')}`);
    } else {
        console.log(`[${file}] No changes needed.`);
    }
}

console.log('\nDone!');
