const express = require('express');
const http = require('http');
const shadowMiddleware = require('./index'); // Assuming your middleware is in index.js

// --- CONFIGURATION ---
const PROD_PORT = 3000;
const SHADOW_PORT = 4000;

// ==========================================
// 1. The "Shadow" Server (Staging)
// ==========================================
const shadowApp = express();

// Middleware to parse body so we can verify the data arrived
shadowApp.use(express.json());

shadowApp.post('/api/data', (req, res) => {
    console.log('\x1b[36m%s\x1b[0m', `[SHADOW] 👻 Received Data on Port ${SHADOW_PORT}:`, req.body);
    res.json({
        status: 'success',
        data: req.body,
        timestamp: Date.now(), // ALWAYS DIFFERENT
        trace_id: 'shadow-123'
    });
});

shadowApp.listen(SHADOW_PORT, () => {
    console.log(`Shadow Server listening on port ${SHADOW_PORT}`);
});

// ==========================================
// 2. The "Production" Server (Main App)
// ==========================================
const prodApp = express();

// !!! ATTACH OUR MIDDLEWARE FIRST !!!
prodApp.use(shadowMiddleware({
    target: `http://localhost:${SHADOW_PORT}`,
    ignoreKeys: ['timestamp', 'trace_id']
}));

// Standard Body Parser (This usually breaks if streams are mishandled)
prodApp.use(express.json());

prodApp.post('/api/data', (req, res) => {
    console.log('\x1b[32m%s\x1b[0m', `[PROD] 🟢 Main App processed request:`, req.body);
    res.json({
        status: 'success',
        data: req.body,
        timestamp: Date.now() + 500, // ALWAYS DIFFERENT
        trace_id: 'prod-999'
    });
});

prodApp.listen(PROD_PORT, () => {
    console.log(`Production Server listening on port ${PROD_PORT}`);
    console.log('--- Servers Ready ---\n');

    // Trigger the test automatically after 1 second
    setTimeout(runClientTest, 1000);
});

// ==========================================
// 3. The Client (Simulating a User)
// ==========================================
function runClientTest() {
    console.log('--- 🚀 Sending Test Request ---');

    const postData = JSON.stringify({
        user_id: 101,
        action: "update_profile",
        payload: "This data must exist in BOTH servers"
    });

    const options = {
        hostname: 'localhost',
        port: PROD_PORT,
        path: '/api/data',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`[CLIENT] Response Code: ${res.statusCode}`);
        res.on('data', (d) => process.stdout.write(`[CLIENT] Body: ${d}\n`));
    });

    req.on('error', (e) => console.error(`[CLIENT] Problem with request: ${e.message}`));

    // Write data to request body
    req.write(postData);
    req.end();
}