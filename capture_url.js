const { spawn } = require('child_process');
const http = require('http');

const child = spawn('npx', ['expo', 'start', '--host', 'tunnel'], {
  cwd: 'C:/Users/PC/Downloads/Perix1/Perix-main/frontend',
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  output += text;
  
  const match = text.match(/exp:\/\/[^\s\n]+/);
  if (match) {
    console.log('\n>>> FOUND URL:', match[0], '<<<\n');
  }
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  process.stderr.write(text);
  output += text;
  
  const match = text.match(/exp:\/\/[^\s\n]+/);
  if (match) {
    console.log('\n>>> FOUND URL:', match[0], '<<<\n');
  }
});

setTimeout(() => {
  console.log('\n--- Captured output so far ---');
  console.log(output);
  process.exit(0);
}, 30000);
