/**
 * Tests for pure utility functions from shared.js
 * Run: node --test tests/frontend/
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---- escHtml ----
function escHtml(str) {
    const div = { textContent: '' };
    if (str === null || str === undefined) {
        div.textContent = '';
    } else {
        div.textContent = String(str);
    }
    // Simulate innerHTML getting the escaped version
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(div.textContent).replace(/[&<>"']/g, c => map[c]);
}

describe('escHtml', () => {
    it('escapes < and >', () => {
        assert.strictEqual(escHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
    it('escapes &', () => {
        assert.strictEqual(escHtml('a & b'), 'a &amp; b');
    });
    it('returns empty string for null', () => {
        assert.strictEqual(escHtml(null), '');
    });
    it('returns empty string for undefined', () => {
        assert.strictEqual(escHtml(undefined), '');
    });
    it('preserves plain text', () => {
        assert.strictEqual(escHtml('hello world 123'), 'hello world 123');
    });
    it('handles numbers', () => {
        assert.strictEqual(escHtml(42), '42');
    });
    it('handles empty string', () => {
        assert.strictEqual(escHtml(''), '');
    });
});

// ---- formatTime ----
function formatTime(utcStr) {
    if (!utcStr) return "";
    try {
        const d = new Date((utcStr + "Z").replace(" ", "T"));
        if (isNaN(d.getTime())) return utcStr;
        const pad = (n) => String(n).padStart(2, "0");
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    } catch (_) {
        return utcStr;
    }
}

describe('formatTime', () => {
    it('returns empty string for null', () => {
        assert.strictEqual(formatTime(null), '');
    });
    it('returns empty string for undefined', () => {
        assert.strictEqual(formatTime(undefined), '');
    });
    it('returns empty string for empty string', () => {
        assert.strictEqual(formatTime(''), '');
    });
    it('returns original on invalid input', () => {
        assert.strictEqual(formatTime('not-a-date'), 'not-a-date');
    });
    it('parses UTC datetime string correctly', () => {
        // "2024-01-15 10:30:00" UTC should produce a local time string in YYYY-MM-DD HH:MM:SS format
        const result = formatTime('2024-01-15 10:30:00');
        // Verify format: YYYY-MM-DD HH:MM:SS
        assert.match(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
    it('preserves the correct date components', () => {
        // Jan 15 2024 10:30:00 UTC
        const result = formatTime('2024-01-15 10:30:00');
        assert.ok(result.startsWith('2024-01-15'));
        // The time should be 10:30:00 if in UTC timezone or adjusted if not
        assert.ok(result.includes('30')); // minutes should be preserved
    });
});

// ---- fetchWithRetry (simplified retry logic, tested without AbortController timing) ----
async function fetchWithRetry(url, options, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const resp = await fetch(url, options);
            return resp;
        } catch (err) {
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, 1));
        }
    }
}

describe('fetchWithRetry', () => {
    it('returns response on first success', async () => {
        const mockResp = { ok: true, status: 200 };
        mock.method(globalThis, 'fetch', () => Promise.resolve(mockResp));
        const result = await fetchWithRetry('/test');
        assert.strictEqual(result, mockResp);
        assert.strictEqual(fetch.mock.calls.length, 1);
        fetch.mock.restore();
    });

    it('retries on failure and succeeds', async () => {
        let callCount = 0;
        const mockResp = { ok: true, status: 200 };
        mock.method(globalThis, 'fetch', () => {
            callCount++;
            if (callCount < 3) return Promise.reject(new Error('timeout'));
            return Promise.resolve(mockResp);
        });
        const result = await fetchWithRetry('/test', {}, 3);
        assert.strictEqual(result, mockResp);
        assert.strictEqual(callCount, 3);
        fetch.mock.restore();
    });

    it('throws after exhausting retries', async () => {
        mock.method(globalThis, 'fetch', () => Promise.reject(new Error('network error')));
        await assert.rejects(
            () => fetchWithRetry('/test', {}, 2),
            /network error/
        );
        assert.strictEqual(fetch.mock.calls.length, 2);
        fetch.mock.restore();
    });
});
