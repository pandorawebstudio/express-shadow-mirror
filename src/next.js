// src/next.js
import { sanitize, safeJSONParse, logMismatch } from './utils.js';

/**
 * Next.js App Router Wrapper
 * Wraps a route handler (GET, POST, etc.) to mirror traffic.
 */
export function withShadow(handler, config) {
    return async (req, context) => {
        // 1. Clone the request immediately because streams can only be read once
        // One clone for the real app, one for the shadow
        const shadowReq = req.clone();

        // 2. Execute the Real Handler (Production)
        const prodResponse = await handler(req, context);

        // 3. Clone the response so we can read it without stealing it from the user
        const prodResponseClone = prodResponse.clone();

        // 4. Fire and Forget the Shadow Traffic
        // We do NOT await this, so user latency is unaffected
        processShadow(shadowReq, prodResponseClone, config).catch(err => {
            console.error('[Shadow Error]', err);
        });

        // 5. Return the real response to the user immediately
        return prodResponse;
    };
}

async function processShadow(req, prodResponse, config) {
    const { target, ignoreKeys = [] } = config;
    const targetUrl = new URL(req.nextUrl.pathname, target); // Next.js specific URL handling

    // Prepare Shadow Request
    const shadowOptions = {
        method: req.method,
        headers: new Headers(req.headers),
        body: req.body, // This is a ReadableStream
        duplex: 'half' // Required for Node.js fetch with body streams
    };

    // Tag traffic
    shadowOptions.headers.set('x-shadow-traffic', 'true');
    shadowOptions.headers.set('host', targetUrl.host);

    // Execute Shadow Request
    // note: We use global 'fetch' which is standard in Next.js 13+
    let shadowResponse;
    try {
        shadowResponse = await fetch(targetUrl, shadowOptions);
    } catch (err) {
        return; // Shadow server might be down, ignore.
    }

    // Compare Results
    const [prodText, shadowText] = await Promise.all([
        prodResponse.text(),
        shadowResponse.text()
    ]);

    const prodJson = safeJSONParse(prodText);
    const shadowJson = safeJSONParse(shadowText);

    let isMatch = false;

    if (prodJson && shadowJson) {
        const cleanProd = sanitize(prodJson, ignoreKeys);
        const cleanShadow = sanitize(shadowJson, ignoreKeys);
        isMatch = JSON.stringify(cleanProd) === JSON.stringify(cleanShadow);
    } else {
        isMatch = prodText === shadowText;
    }

    if (!isMatch) {
        logMismatch(req.nextUrl.pathname, prodText, shadowText, ignoreKeys);
    }
}