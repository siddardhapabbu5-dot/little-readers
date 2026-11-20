/**
 * Source-level checks for the unique subscription entry wiring (no RN runtime).
 * Run: node services/subscription-entry.test.ts  (from apps/mobile)
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const entrySvc = fs.readFileSync(path.join(__dirname, "subscription-entry.ts"), "utf8");
const entryScreen = fs.readFileSync(path.join(root, "app", "subscription-entry.tsx"), "utf8");
const profile = fs.readFileSync(path.join(root, "app", "(tabs)", "profile.tsx"), "utf8");
const parent = fs.readFileSync(path.join(root, "app", "parent.tsx"), "utf8");
const setup = fs.readFileSync(path.join(root, "app", "child-setup", "[id].tsx"), "utf8");
const gate = fs.readFileSync(path.join(__dirname, "parent-gate.ts"), "utf8");
const sub = fs.readFileSync(path.join(root, "app", "subscription.tsx"), "utf8");
const agree = fs.readFileSync(path.join(root, "app", "agreements.tsx"), "utf8");

assert.match(entrySvc, /resolveSubscriptionEntryHref/);
assert.match(entrySvc, /markChildSetupComplete/);
assert.match(entrySvc, /child-setup/);
assert.match(entryScreen, /RequireParentGate/);
assert.match(entryScreen, /resolveSubscriptionEntryHref/);
assert.match(profile, /subscription-entry/);
assert.match(parent, /subscription-entry/);
assert.match(setup, /markChildSetupComplete/);
assert.match(setup, /subscription\?setup=1/);
assert.match(gate, /subscription-entry/);
assert.match(sub, /\/agreements\?planId=/);
assert.match(agree, /openRazorpayCheckout|Pay with Razorpay|GooglePlay|cashfree/i);

console.log("subscription-entry.test.ts: PASS");
