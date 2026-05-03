const http = require('http');

const data = JSON.stringify({
  schoolName: "Test",
  schoolPhone: "123",
  schoolEmail: "test@test.com",
  address: "123",
  schoolType: "Primary",
  studentEstimate: 100,
  adminFullName: "Admin",
  adminEmail: "testadmin123456@test.com",
  password: "password123",
  academicYear: "2023",
  currentTerm: "Term 1",
  onboardingTemplate: "default"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/public/start-trial',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.log(body);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
