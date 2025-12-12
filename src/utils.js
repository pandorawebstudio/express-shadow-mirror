// src/utils.js

export function sanitize(obj, keysToIgnore) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => sanitize(item, keysToIgnore));

    const newObj = {};
    for (const key in obj) {
        if (keysToIgnore.includes(key)) continue;
        newObj[key] = sanitize(obj[key], keysToIgnore);
    }
    return newObj;
}

export function safeJSONParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

export function logMismatch(path, prodBody, shadowBody, ignoreKeys) {
    console.log('\n\x1b[41m\x1b[37m[MISMATCH DETECTED]\x1b[0m');
    console.log(`Path: ${path}`);
    console.log(`Prod Body:   ${String(prodBody).substring(0, 100)}...`);
    console.log(`Shadow Body: ${String(shadowBody).substring(0, 100)}...`);
    console.log(`Ignored Keys: [${ignoreKeys.join(', ')}]`);
}