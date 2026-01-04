#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the source file
const sourceFile = path.join(__dirname, '../truth/db/us/files.json');
const targetFile = path.join(__dirname, '../truth/db/us/files_new.json');

console.log('Reading source file:', sourceFile);
const files = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

console.log(`Processing ${files.length} files...`);

// Group files by their group and scene properties
const grouped = {};

for (const file of files) {
  const groupName = file.group || 'ungrouped';
  const sceneName = file.scene || '';
  
  if (!grouped[groupName]) {
    grouped[groupName] = {};
  }
  
  if (!grouped[groupName][sceneName]) {
    grouped[groupName][sceneName] = {};
  }
  
  // Create a new object with only defined properties, excluding 'name', 'group', and 'scene'
  const fileRecord = {};
  
  // Always include these core properties
  fileRecord.start = file.start;
  fileRecord.end = file.end;
  fileRecord.type = file.type;
  
  // Only include optional properties if they are defined (excluding scene)
  if (file.id !== undefined) fileRecord.id = file.id;
  if (file.compressed !== undefined) fileRecord.compressed = file.compressed;
  if (file.upper !== undefined) fileRecord.upper = file.upper;
  
  // Use the file name as the key
  grouped[groupName][sceneName][file.name] = fileRecord;
}

// Sort groups alphabetically
const sortedGrouped = {};
const sortedGroupKeys = Object.keys(grouped).sort();
for (const groupKey of sortedGroupKeys) {
  sortedGrouped[groupKey] = {};
  // Sort scenes within each group (empty string "" should come first)
  const sortedSceneKeys = Object.keys(grouped[groupKey]).sort((a, b) => {
    if (a === '' && b !== '') return -1;
    if (b === '' && a !== '') return 1;
    return a.localeCompare(b);
  });
  for (const sceneKey of sortedSceneKeys) {
    sortedGrouped[groupKey][sceneKey] = grouped[groupKey][sceneKey];
  }
}

// Custom JSON stringification to ensure each file is on its own line
let output = '{\n';
const groupKeys = Object.keys(sortedGrouped);

for (let i = 0; i < groupKeys.length; i++) {
  const groupKey = groupKeys[i];
  const scenes = sortedGrouped[groupKey];
  
  output += `    "${groupKey}": {\n`;
  
  const sceneKeys = Object.keys(scenes);
  for (let j = 0; j < sceneKeys.length; j++) {
    const sceneKey = sceneKeys[j];
    const files = scenes[sceneKey];
    
    output += `        "${sceneKey}": {\n`;
    
    const fileKeys = Object.keys(files);
    for (let k = 0; k < fileKeys.length; k++) {
      const fileName = fileKeys[k];
      const fileData = files[fileName];
      
      // Stringify the file data on a single line
      const fileJson = JSON.stringify(fileData);
      output += `            "${fileName}": ${fileJson}`;
      
      // Add comma if not the last file in the scene
      if (k < fileKeys.length - 1) {
        output += ',';
      }
      output += '\n';
    }
    
    output += '        }';
    
    // Add comma if not the last scene in the group
    if (j < sceneKeys.length - 1) {
      output += ',';
    }
    output += '\n';
  }
  
  output += '    }';
  
  // Add comma if not the last group
  if (i < groupKeys.length - 1) {
    output += ',';
  }
  output += '\n';
}

output += '}\n';

// Write the result
console.log('Writing to:', targetFile);
fs.writeFileSync(targetFile, output, 'utf8');

console.log('Done! Generated files_new.json with grouped structure.');
console.log(`Groups found: ${Object.keys(sortedGrouped).length}`);

// Count total scenes
let sceneCount = 0;
for (const groupKey of Object.keys(sortedGrouped)) {
  sceneCount += Object.keys(sortedGrouped[groupKey]).length;
}
console.log(`Scenes found: ${sceneCount}`);

