const fs = require('fs');
const path = require('path');

// Read the input files
const blocksPath = path.join(__dirname, '../truth/db/us/blocks.json');
const partsPath = path.join(__dirname, '../truth/db/us/parts.json');
const outputPath = path.join(__dirname, '../truth/db/us/blocks_new.json');

console.log('Reading blocks.json...');
const blocks = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));

console.log('Reading parts.json...');
const parts = JSON.parse(fs.readFileSync(partsPath, 'utf8'));

console.log(`Loaded ${blocks.length} blocks and ${parts.length} parts`);

// Create a map of parts by block name for faster lookup
const partsByBlock = {};
parts.forEach(part => {
    if (!partsByBlock[part.block]) {
        partsByBlock[part.block] = [];
    }
    partsByBlock[part.block].push(part);
});

// Group blocks by their group field
const result = {};

blocks.forEach(block => {
    const groupName = block.group || 'ungrouped';
    
    // Initialize group if it doesn't exist
    if (!result[groupName]) {
        result[groupName] = {};
    }
    
    // Create the block entry
    const blockEntry = {};
    
    // Add all properties except 'name' and 'group'
    Object.keys(block).forEach(key => {
        if (key !== 'name' && key !== 'group') {
            blockEntry[key] = block[key];
        }
    });
    
    // Add parts if they exist for this block
    const blockParts = partsByBlock[block.name];
    if (blockParts && blockParts.length > 0) {
        blockEntry.parts = {};
        blockParts.forEach(part => {
            blockEntry.parts[part.name] = {
                start: part.start,
                end: part.end,
                type: part.struct
            };
        });
    }
    
    // Add the block to its group
    result[groupName][block.name] = blockEntry;
});

// Write the output with custom formatting
// We want each part entry on a single line
console.log('Writing output...');

// Custom formatter to put each part on a single line
function formatOutput(obj, indent = 0) {
    const spaces = '    '.repeat(indent);
    const nextSpaces = '    '.repeat(indent + 1);
    
    if (typeof obj !== 'object' || obj === null) {
        return JSON.stringify(obj);
    }
    
    const lines = [];
    lines.push('{');
    
    const keys = Object.keys(obj);
    keys.forEach((key, index) => {
        const value = obj[key];
        const isLast = index === keys.length - 1;
        const comma = isLast ? '' : ',';
        
        if (key === 'parts' && typeof value === 'object') {
            // Format parts with each part entry on a single line
            lines.push(`${nextSpaces}"${key}": {`);
            const partKeys = Object.keys(value);
            partKeys.forEach((partKey, partIndex) => {
                const part = value[partKey];
                const partComma = partIndex === partKeys.length - 1 ? '' : ',';
                // Format with spaces for readability
                const partStr = `{ "start": ${part.start}, "end": ${part.end}, "type": "${part.type}" }`;
                lines.push(`${nextSpaces}    "${partKey}": ${partStr}${partComma}`);
            });
            lines.push(`${nextSpaces}}${comma}`);
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            lines.push(`${nextSpaces}"${key}": ${formatOutput(value, indent + 1)}${comma}`);
        } else {
            lines.push(`${nextSpaces}"${key}": ${JSON.stringify(value)}${comma}`);
        }
    });
    
    lines.push(`${spaces}}`);
    return lines.join('\n');
}

const output = formatOutput(result);

fs.writeFileSync(outputPath, output, 'utf8');

console.log(`Successfully wrote combined data to ${outputPath}`);
console.log(`Groups: ${Object.keys(result).length}`);

