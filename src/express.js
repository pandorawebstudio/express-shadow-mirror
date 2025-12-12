// src/express.js
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { sanitize, safeJSONParse, logMismatch } from './utils.js';

/**
 * Express/Fastify Middleware (ESM Version)
 */
export default function shadowMiddleware(options) {
    // Default config
    const config = {
        target: options.target,
        ignoreKeys: options.ignoreKeys || [],
        ...options
    };

    return (req, res, next) => {
        // 1. Skip non-modifying requests
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

                        // Use shared helpers
                        const prodJson = safeJSONParse(prodBody);
                        const shadowJson = safeJSONParse(shadowBody);

                        let isMatch = false;

                        if (prodJson && shadowJson) {
                            const cleanProd = sanitize(prodJson, config.ignoreKeys);
                            const cleanShadow = sanitize(shadowJson, config.ignoreKeys);
                            isMatch = JSON.stringify(cleanProd) === JSON.stringify(cleanShadow);
                        } else {
                            isMatch = prodBody === shadowBody;
                        }

                        if (!isMatch) {
                            logMismatch(req.url, prodBody, shadowBody, config.ignoreKeys);
                        }
                    });
            }
            return originalEmit.apply(this, arguments);
        };

        next();
    };
}

// Helper: HTTP Request to Shadow
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