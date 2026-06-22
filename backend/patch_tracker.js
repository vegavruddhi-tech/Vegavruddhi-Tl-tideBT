const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'tl.js');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = "// GET /api/tl/tidebt-team-fund-tracker - Get fund usage per FSE under this TL";
const endMarker = "// GET /api/tl/tidebt-team-reward-pass";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!', { startIdx, endIdx });
  process.exit(1);
}

// Read the new endpoint from separate file
const newEndpoint = fs.readFileSync(path.join(__dirname, 'new_tracker_endpoint.js'), 'utf8');

const before = content.substring(0, startIdx);
const after  = content.substring(endIdx);
const newContent = before + newEndpoint + '\n\n' + after;

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done! Replaced', content.substring(startIdx, endIdx).split('\n').length, 'lines');
