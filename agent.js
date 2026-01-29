const { io } = require("socket.io-client");
const fs = require("fs").promises;
const path = require("path");
const { startTunnel } = require("untun");
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
const SESSION_ID = process.argv[2];
const ROOT_DIR = process.cwd();
const AGENT_SECRET = process.env.DEVOPTIC_AGENT_SECRET;

if (!SESSION_ID) {
    console.error(" Error: Session ID required.");
    console.log("Usage: node agent.js <session-id>");
    process.exit(1);
}

if (!AGENT_SECRET) {
    console.warn(" Warning: DEVOPTIC_AGENT_SECRET is missing in .env. Connection might fail.");
}

console.log(` Connecting to: ${SOCKET_URL}`);
console.log(` Working Directory: ${ROOT_DIR}`);
console.log(` Using Secret: ${AGENT_SECRET ? '******' : 'UNDEFINED'}`);

const socket = io(SOCKET_URL, {
    auth: {
        agentSecret: AGENT_SECRET
    },
    reconnection: true,
    reconnectionDelay: 1000,
});

let activeTunnel = null;

socket.on("connect", () => {
    console.log(`Connected! Socket ID: ${socket.id}`);
    console.log(`Joining session: ${SESSION_ID}`);
    socket.emit("join-session", SESSION_ID);
    socket.emit("agent:status", { sessionId: SESSION_ID, status: "online" });
    console.log("File System Agent Ready. Waiting for commands...");
});

socket.on("connect_error", (err) => {
    console.error(`Connection Error: ${err.message}`);
});

socket.on("disconnect", (reason) => {
    console.log(`Disconnected: ${reason}`);
    if (activeTunnel) {
        console.log("Closing active tunnel...");
        activeTunnel.close().catch(console.error);
        activeTunnel = null;
    }
});

socket.on("tunnel:start", async (data) => {
    console.log("[TUNNEL] Starting Cloudflare Tunnel...");
    if (activeTunnel) {
        console.log("[TUNNEL] Tunnel already active:", await activeTunnel.getURL());
        socket.emit("tunnel:ready", { sessionId: SESSION_ID, url: await activeTunnel.getURL() });
        return;
    }

    try {
        const tunnel = await startTunnel({ port: 3000 }); // Default Next.js port
        activeTunnel = tunnel;
        const url = await tunnel.getURL();
        console.log(`[TUNNEL] Tunnel Active: ${url}`);
        socket.emit("tunnel:ready", { sessionId: SESSION_ID, url });
    } catch (err) {
        console.error("[TUNNEL] START ERROR:", err);
        socket.emit("console:error", {
            sessionId: SESSION_ID,
            args: [`Tunnel Error: ${err.message}`],
            timestamp: Date.now()
        });
    }
});

socket.on("tunnel:stop", async () => {
    if (activeTunnel) {
        console.log("[TUNNEL] Stopping tunnel...");
        await activeTunnel.close();
        activeTunnel = null;
        console.log("[TUNNEL] Stopped.");
    }
});


socket.on("fs:list", async () => {
    console.log("[READ] Listing files...");
    try {
        const files = await getFiles(ROOT_DIR);
        socket.emit("fs:list:response", { sessionId: SESSION_ID, files });
    } catch (err) {
        console.error("List Error:", err);
    }
});

socket.on("fs:read", async (data) => {
    console.log(`[READ] ${data.path}`);
    try {
        const safePath = validatePath(data.path);
        const content = await fs.readFile(safePath, "utf-8");
        socket.emit("fs:read:response", { sessionId: SESSION_ID, path: data.path, content });
    } catch (err) {
        console.error("Read Error:", err.message);
        socket.emit("console:error", {
            sessionId: SESSION_ID,
            args: [`File Read Error: ${err.message}`],
            timestamp: Date.now()
        });
    }
});

socket.on("fs:write", async (data) => {
    console.log(`[WRITE] Attempting to save: ${data.path}`);
    try {
        const safePath = validatePath(data.path);
        await fs.writeFile(safePath, data.content, "utf-8");
        console.log("Saved successfully!");
        socket.emit("fs:write:success", { sessionId: SESSION_ID, path: data.path });
    } catch (err) {
        console.error("Write Error:", err.message);
        socket.emit("console:error", {
            sessionId: SESSION_ID,
            args: [`File Save Error: ${err.message}`],
            timestamp: Date.now()
        });
    }
});

async function getFiles(dir) {
    let results = [];
    try {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const dirent of list) {
            const res = path.resolve(dir, dirent.name);

            if (dirent.name === 'node_modules' || dirent.name === '.git' || dirent.name === '.next' || dirent.name === 'dist') {
                continue;
            }

            if (dirent.isDirectory()) {
                const subFiles = await getFiles(res);
                results = results.concat(subFiles);
            } else {
                results.push(res.replace(ROOT_DIR, ''));
            }
        }
    } catch (e) {
        console.error("Error reading directory:", e);
    }
    return results;
}

function validatePath(requestedPath) {
    const cleanReq = requestedPath.replace(/^[/\\]+/, "");
    const resolved = path.resolve(ROOT_DIR, cleanReq);

    if (!resolved.startsWith(ROOT_DIR)) {
        throw new Error(`Access Denied: Path ${resolved} is outside project root.`);
    }
    return resolved;
}