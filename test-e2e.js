import http from 'http';

const randomNum = Math.floor(Math.random() * 100000);
const testEmail = `test-e2e-${randomNum}@example.com`;

const payload = JSON.stringify({
  adminEmail: testEmail,
  adminFullName: "Test User",
  password: "TestPassword123",
  schoolName: "Test School",
  schoolPhone: "+11234567890",
  schoolEmail: testEmail,
  address: "123 Test St",
  schoolType: "Primary",
  studentEstimate: "100-200",
  academicYear: "2024",
  currentTerm: "1",
  onboardingTemplate: "guided"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/public/start-trial',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length
  }
};

console.log(`Testing signup with email: ${testEmail}`);
console.log('');

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Response:');
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

// Timeout after 30 seconds
setTimeout(() => {
  console.error('Request timeout');
  process.exit(1);
}, 30000);
