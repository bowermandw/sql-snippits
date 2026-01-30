const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to clean and parse column names
function parseColumns(input) {
  // Split by common delimiters: newline, comma, semicolon, tab
  const items = input.split(/[\n,;\t]+/);
  
  return items
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .map(item => {
      // Remove surrounding brackets [Column Name] or quotes "Column Name" or 'Column Name'
      return item.replace(/^[\[\("']|[\]\)"']$/g, '').trim();
    });
}

// Function to parse conversion mappings
function parseConversions(input) {
  const conversions = new Map();
  
  // Split by common delimiters
  const pairs = input.split(/[,\n;]+/);
  
  pairs.forEach(pair => {
    pair = pair.trim();
    if (pair.length === 0) return;
    
    // Match pattern: [Name1]=[Name2] or "Name1"="Name2" or Name1=Name2
    const match = pair.match(/^[\[\("']?([^\]\)"'=]+)[\]\)"']?\s*=\s*[\[\("']?([^\]\)"']+)[\]\)"']?$/);
    
    if (match) {
      const fromName = match[1].trim();
      const toName = match[2].trim();
      conversions.set(fromName, toName);
    }
  });
  
  return conversions;
}

// Function to apply conversions to a column name
function applyConversion(columnName, conversions) {
  return conversions.get(columnName) || columnName;
}

// Prompt for List A
rl.question('Enter List A (paste column names, press Enter when done):\n', (listAInput) => {
  const listA = parseColumns(listAInput);
  
  // Prompt for List B
  rl.question('\nEnter List B (paste column names, press Enter when done):\n', (listBInput) => {
    const listB = parseColumns(listBInput);
    
    // Prompt for Conversion List
    rl.question('\nEnter Conversion List (format: [OldName]=[NewName], press Enter when done):\n', (conversionInput) => {
      const conversions = parseConversions(conversionInput);
      
      // Apply conversions to List A
      const listAConverted = listA.map(col => applyConversion(col, conversions));
      
      // Find columns in A (after conversion) that are not in B
      const listBSet = new Set(listB);
      const result = [];
      const resultConverted = [];
      
      for (let i = 0; i < listA.length; i++) {
        if (!listBSet.has(listAConverted[i])) {
          result.push(listA[i]);
          resultConverted.push(listAConverted[i]);
        }
      }
      
      // Display results
      console.log('\n=== Results ===');
      console.log(`Columns in List A: ${listA.length}`);
      console.log(`Columns in List B: ${listB.length}`);
      console.log(`Conversion mappings: ${conversions.size}`);
      console.log(`Columns in A but not in B (after conversion): ${result.length}\n`);
      
      if (conversions.size > 0) {
        console.log('Conversion mappings applied:');
        conversions.forEach((toName, fromName) => {
          console.log(`  ${fromName} → ${toName}`);
        });
        console.log();
      }
      
      if (result.length > 0) {
        console.log('Columns in A that are not in B (after conversion):');
        for (let i = 0; i < result.length; i++) {
          if (result[i] !== resultConverted[i]) {
            console.log(`  ${result[i]} (converted to: ${resultConverted[i]})`);
          } else {
            console.log(`  ${result[i]}`);
          }
        }
      } else {
        console.log('All columns in A are in B (after applying conversions).');
      }
      
      rl.close();
    });
  });
});
