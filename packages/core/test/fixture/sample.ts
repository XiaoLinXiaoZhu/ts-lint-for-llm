// Test fixture for assertion system

/** @assert pure */
function add(a: number, b: number): number {
  return a + b;
}

/** @assert sync immutable */
function formatName(name: string): string {
  return name.trim().toUpperCase();
}

// This function does IO — calling fetch internally
async function getPrice(itemId: string): Promise<number> {
  const response = await fetch(`/api/price/${itemId}`);
  const data = await response.json();
  return data.price;
}

/** @assert pure */
function calculateTotal(items: string[]): number {
  // This violates "pure" because getPrice has IO/Async/Fallible
  let total = 0;
  for (const item of items) {
    total += getPriceSync(item);
  }
  return total;
}

// Simulates an internal function that calls a fallible external
function getPriceSync(itemId: string): number {
  const raw = readFromCache(itemId);
  return JSON.parse(raw);
}

function readFromCache(key: string): string {
  // Simulates reading from filesystem
  const fs = require("fs");
  return fs.readFileSync(`/cache/${key}`, "utf8");
}

/** @assert infallible */
function safeProcess(input: string): string {
  // Violates infallible: JSON.parse is Fallible
  const data = JSON.parse(input);
  return data.value;
}

// A pure helper — no assertions needed, system infers it's pure
function double(x: number): number {
  return x * 2;
}
