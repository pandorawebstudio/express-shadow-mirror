# Shadow Traffic Mirror

An enterprise-grade middleware that mirrors incoming production traffic to a "Shadow" (Staging) environment. It asynchronously compares the responses from both environments and logs mismatches, enabling **risk-free testing** of new deployments with real-world data.

## Features

- 🚀 **Zero Latency:** Shadow requests are fired asynchronously ("fire and forget"); user response time is unaffected.
- ⚡ **Dual Runtime Support:**
  - **Node.js Streams:** Optimized for Express/Fastify (event spies without breaking `body-parser`).
  - **Web Standards:** Optimized for Next.js App Router & Edge Runtimes (using `fetch` and `Request.clone()`).
- 🛡️ **Smart Diffing:** Recursively ignores volatile fields (e.g., `timestamp`, `trace_id`) to prevent false positives.
- 📦 **ESM Native:** Built for modern JavaScript stacks (ESM2025 ready).

---

## Installation

```bash
npm install shadow-traffic-mirror
Usage: Next.js (App Router)Designed for modern app/api routes using Web Standard Request/Response objects.File: app/api/users/route.tsTypeScriptimport { NextResponse } from 'next/server';
import { withShadow } from 'shadow-traffic-mirror/next'; // Note the /next import

// 1. Define your normal Route Handler
async function POST_HANDLER(req: Request) {
  const body = await req.json();
  // ... database logic ...
  return NextResponse.json({ status: 'success', id: 123, timestamp: Date.now() });
}


export const POST = withShadow(POST_HANDLER, {
  target: '[https://staging-api.yourcompany.com](https://staging-api.yourcompany.com)',
  ignoreKeys: ['timestamp', 'trace_id', '_id']
});
Usage: Express / Node.jsDesigned for traditional Node.js servers using Streams. This middleware safely "spies" on the stream without consuming it, ensuring compatibility with body-parser.File: server.jsJavaScriptimport express from 'express';
import shadow from 'shadow-traffic-mirror'; // Default import

const app = express();

// 1. Register middleware BEFORE body-parser
app.use(shadow({
  target: '[https://staging-api.yourcompany.com](https://staging-api.yourcompany.com)',
  ignoreKeys: ['timestamp', 'requestId']
}));

// 2. Normal middleware & routes
app.use(express.json());

app.post('/api/data', (req, res) => {
  res.json({ status: 'success', timestamp: Date.now() });
});

app.listen(3000);
```

### Configuration Options

Option | Type | Default | Description
--- | --- | --- | ---
target | string | Required | The base URL of the Shadow/Staging environment (e.g., https://staging.api.com).
ignoreKeys | string[][] | List of JSON keys to exclude from the comparison (supports deep nesting).
