const https = require('https');
const url = 'https://integritypulse-fortress.marywomack.workers.dev/mcp';
const key = process.env.OPENCLAW_API_KEY;

process.stdin.on('data', (chunk) => {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'Accept': 'application/json'
    }
  };

  const req = https.request(url, options, (res) => {
    res.on('data', (data) => process.stdout.write(data));
  });

  req.on('error', (e) => {
    const err = JSON.stringify({jsonrpc: "2.0", error: {code: -32603, message: e.message}, id: null});
    process.stderr.write(err + '\n');
  });

  req.write(chunk);
  req.end();
});
