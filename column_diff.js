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

// Prompt for List A
rl.question('Enter List A (paste column names, press Enter when done):\n', (listAInput) => {
  const listA = parseColumns(listAInput);
  
  // Prompt for List B
  rl.question('\nEnter List B (paste column names, press Enter when done):\n', (listBInput) => {
    const listB = parseColumns(listBInput);
    
    // Find columns in A that are not in B
    const listBSet = new Set(listB);
    const result = listA.filter(col => !listBSet.has(col));
    
    // Display results
    console.log('\n=== Results ===');
    console.log(`Columns in List A: ${listA.length}`);
    console.log(`Columns in List B: ${listB.length}`);
    console.log(`Columns in A but not in B: ${result.length}\n`);
    
    if (result.length > 0) {
      console.log('Columns in A that are not in B:');
      result.forEach(col => console.log(`  ${col}`));
    } else {
      console.log('All columns in A are also in B.');
    }
    
    rl.close();
  });
});
