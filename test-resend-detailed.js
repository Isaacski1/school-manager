import http from 'http';

const testEmail = "test-e2e-18924@example.com";

const payload = JSON.stringify({
  email: testEmail
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/public/resend-verification-email',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length
  }
};

console.log(`Testing resend verification email for: ${testEmail}`);
console.log('Checking if rate-limit causes queueing...');
console.log('');

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    
    if (res.statusCode === 202) {
      console.log('✅ EMAIL QUEUED - Rate-limiting detected and email queued for retry');
    } else if (res.statusCode === 200) {
      console.log('✅ EMAIL SENT - Verification email sent successfully');
    } else {
      console.log('❌ ERROR - Failed to send or queue email');
    }
    
    console.log('\nResponse:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log(data);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  process.exit(1);
});

req.write(payload);
req.end();

setTimeout(() => {
  console.error('Request timeout');
  process.exit(1);
}, 30000);
