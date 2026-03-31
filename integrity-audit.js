const https = require('https');
const fs = require('fs');

// Load key from the local file Claude just saw
const API_KEY = fs.readFileSync('.env.production', 'utf8').split('=')[1].trim();

const config = {
  url: 'https://integritypulse-fortress.marywomack.workers.dev/mcp',
  routes: [
    { path: '/', file: 'index.html' },
    { path: '/about', file: 'about.html' },
    { path: '/newsletter', file: 'newsletter.html' }
  ]
};

async function auditRoute(route) {
  const payload = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'verify_live_state', arguments: { target_url: `https://missionmeetstech.com${route.path}`, bypass_cache: true } }
  });

  return new Promise((resolve) => {
    const req = https.request(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'Accept': 'application/json, text/event-stream' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data).result;
          resolve({ route: route.path, status: 'SUCCESS', size: result.content[0].text.match(/Body size:\*\* ([\d,]+) bytes/)?.[1] });
        } catch (e) { resolve({ route: route.path, status: 'FAILED' }); }
      });
    });
    req.on('error', (e) => resolve({ route: route.path, status: 'ERROR' }));
    req.write(payload);
    req.end();
  });
}

console.log('🚀 RUNNING APPROVED SITE AUDIT...');
Promise.all(config.routes.map(auditRoute)).then(results => { console.table(results); });
