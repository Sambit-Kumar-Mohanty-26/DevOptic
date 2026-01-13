// test-db.js
const { Client } = require('pg');
require('dotenv').config();

// Manually load the URL to ensure no caching issues
const connectionString = process.env.DATABASE_URL;

console.log("Testing connection to:", connectionString.split('@')[1]); // Log host only (hide password)

const client = new Client({
  connectionString: connectionString,
});

async function test() {
  try {
    console.log("Attempting to connect...");
    await client.connect();
    console.log("✅ SUCCESS! Connected to Neon DB.");
    const res = await client.query('SELECT NOW()');
    console.log("Server Time:", res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("❌ CONNECTION FAILED:", err.message);
    if (err.code === 'ETIMEDOUT') console.error("-> Hint: Firewall is blocking port 5432.");
    if (err.message.includes('certificate')) console.error("-> Hint: SSL/Certificate issue.");
  }
}

test();