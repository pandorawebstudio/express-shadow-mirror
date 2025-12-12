# Express Shadow Mirror

A lightweight Node.js middleware that mirrors incoming production traffic to a "Shadow" (Staging) server. It compares the responses from both servers and logs any mismatches, allowing for risk-free testing of new code with real-world data.

## Features
- 🚀 **Zero Latency:** Shadow requests happen asynchronously; the user is never blocked.
- 🛡️ **Non-Destructive:** Uses event spies to capture streams without breaking `body-parser`.
- 🔍 **Smart Diffing:** recursively ignores volatile fields like `timestamp` or `trace_id`.
- 📦 **Zero Dependencies:** Built using native Node.js `http`/`https` modules.

## Installation

```bash
npm install express-shadow-mirror
```

## Usage

```bash
const express = require('express');
const shadow = require('express-shadow-mirror');

const app = express();

app.use(shadow({
  target: '[https://staging-api.yourcompany.com](https://staging-api.yourcompany.com)',
  ignoreKeys: ['timestamp', 'id', '_id', 'trace_id']
}));

// Your normal routes follow...
app.post('/api/login', (req, res) => {
   // ...
});
```

## License
MIT
