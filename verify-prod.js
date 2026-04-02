const https = require('https');

const config = {
  url: 'https://integritypulse-fortress.marywomack.workers.dev/mcp',
  key: process.env.OPENCLAW_API_KEY,
  target: 'https://missionmeetstech.com/about'
};

const payload = JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'tools/call',
  params: { name: 'verify_live_state', arguments: { target_url: config.target } }
});

const req = https.request(config.url, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json', 
    'x-api-key': config.key, 
    'Accept': 'application/json, text/event-stream' 
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.result) {
        console.log('\n--- 🛡️ FORTRESS VERIFICATION RESULT ---');
        console.log(JSON.stringify(json.result, null, 2));
      } else {
        console.error('\n❌ WORKER ERROR:', JSON.stringify(json.error || data, null, 2));
      }
    } catch (e) {
      // If it's not JSON, it might be the raw SSE stream text
      console.log('\n--- 🛡️ RAW STREAM OUTPUT ---');
      console.log(data);
    }
  });
});

req.on('error', (e) => console.error('\n❌ CONNECTION ERROR:', e));
req.write(payload);
req.end();
