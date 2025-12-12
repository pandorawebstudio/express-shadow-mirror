const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Helper: Recursively remove specific keys from an object/array.
 * @param {any} obj - The object to sanitize
 * @param {string[]} keysToIgnore - Array of key names to remove
 * @returns {any} - A new copy of the object with keys removed
 */
function sanitize(obj, keysToIgnore) {
    // Handle null/undefined or non-objects (primitives)
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // Handle Arrays: Map over them and sanitize each item
    if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item, keysToIgnore));
    }

    // Handle Objects: Create a copy, ignoring specific keys
    const newObj = {};
    for (const key in obj) {
        if (keysToIgnore.includes(key)) {
            continue; // Skip this key
        }
        // Recurse into the value
        newObj[key] = sanitize(obj[key], keysToIgnore);
    }
    return newObj;
}

/**
 * Traffic Shadow Middleware
 */
const shadowMiddleware = (options) => {
    // Default config
    const config = {
        target: options.target,
        ignoreKeys: options.ignoreKeys || [], // e.g. ['timestamp', '_id', 'traceId']
        ...options
    };

    return (req, res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }

        // --- PART A: Capture Production Response ---
        const prodChunks = [];
        const originalWrite = res.write;
        const originalEnd = res.end;

        const prodResponseFinished = new Promise((resolve) => {
            res.write = function (chunk, ...args) {
                if (chunk) prodChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                return originalWrite.apply(res, args);
            };

            res.end = function (chunk, ...args) {
                if (chunk) prodChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                const result = originalEnd.apply(res, args);
                resolve(Buffer.concat(prodChunks));
                return result;
            };
        });

        // --- PART B: Capture Request & Send to Shadow ---
        const reqChunks = [];
        const originalEmit = req.emit;

        req.emit = function (event, ...args) {
            if (event === 'data') {
                const chunk = args[0];
                if (chunk) reqChunks.push(chunk);
            }

            if (event === 'end') {
                const rawReqBody = Buffer.concat(reqChunks);

                // Start Shadow Request
                const shadowPromise = sendToShadow(config.target, req, rawReqBody);

                // --- PART C: Compare Results ---
                Promise.allSettled([prodResponseFinished, shadowPromise])
                    .then(([prodResult, shadowResult]) => {

                        if (prodResult.status === 'rejected' || shadowResult.status === 'rejected') return;

                        const prodBody = prodResult.value.toString();
                        const shadowBody = shadowResult.value.body;

                        let isMatch = false;

                        // Try JSON Comparison first
                        try {
                            const prodJSON = JSON.parse(prodBody);
                            const shadowJSON = JSON.parse(shadowBody);

                            // SANITIZE BOTH OBJECTS BEFORE COMPARING
                            const cleanProd = sanitize(prodJSON, config.ignoreKeys);
                            const cleanShadow = sanitize(shadowJSON, config.ignoreKeys);

                            // Compare the "clean" versions
                            isMatch = JSON.stringify(cleanProd) === JSON.stringify(cleanShadow);
                        } catch (e) {
                            // Fallback to strict string comparison if not JSON
                            isMatch = prodBody === shadowBody;
                        }

                        if (!isMatch) {
                            console.log('\n\x1b[41m\x1b[37m[MISMATCH DETECTED]\x1b[0m');
                            console.log(`Path: ${req.url}`);
                            console.log(`Prod Body:   ${prodBody.substring(0, 100)}...`);
                            console.log(`Shadow Body: ${shadowBody.substring(0, 100)}...`);
                            console.log(`Ignored Keys: [${config.ignoreKeys.join(', ')}]`);
                        }
                    });
            }
            return originalEmit.apply(this, arguments);
        };

        next();
    };
};

function sendToShadow(targetBase, originalReq, bodyBuffer) {
    return new Promise((resolve, reject) => {
        const shadowUrl = new URL(originalReq.url, targetBase);
        const lib = shadowUrl.protocol === 'https:' ? https : http;

        const options = {
            method: originalReq.method,
            headers: { ...originalReq.headers, 'x-shadow-traffic': 'true', host: shadowUrl.host }
        };

        const req = lib.request(shadowUrl, options, (res) => {
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString() }));
        });

        req.on('error', reject);
        req.write(bodyBuffer);
        req.end();
    });
}

module.exports = shadowMiddleware;