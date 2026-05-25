import dotenv from "dotenv";
import { fileURLToPath } from "url";
import express from "express";
import path from "path";
import fs from "fs";
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") });
import { exec } from "child_process";
import { tavily } from "@tavily/core";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";

// Set up the sandboxed workspace folder
const SANDBOX_DIR = path.join(process.cwd(), "agent_sandbox");

if (!fs.existsSync(SANDBOX_DIR)) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

// Function to validate file path is within SANDBOX_DIR
function safePath(relativePath: string): string {
  // Normalize and clean backslashes
  const cleaned = relativePath.replace(/\\/g, "/");
  const resolved = path.resolve(SANDBOX_DIR, cleaned);
  if (!resolved.startsWith(SANDBOX_DIR)) {
    throw new Error(`Access Denied: Path '${relativePath}' escapes the sandboxed workspace boundary.`);
  }
  return resolved;
}

// Model & System instructions
const DEFAULT_SYSTEM_INSTRUCTION = `You are "CodexAgent", a highly skilled, autonomous software engineering AI agent.
Your goal is to solve the user's task by reading, creating, and modifying files in the workspace.

You have access to a rich set of command-line and filesystem tools. Work methodically:
1. List files/directories first to build context of the repository.
2. Read files to understand the current code.
3. Edit or write files to implement features or fix bugs.
4. Run bash commands (like 'node index.js' or 'python main.py') to run tests or execute execution loops, verify outputs, and diagnose issues.
5. If you hit errors or test failures, do not give up! Read the logs, understand the error, edit the workspace code, and run tests again until they pass.

Keep edits as minimal and high-quality as possible.
Write clean, concise markdown explanations of your choices. Each time you run a tool, you must follow up by analyzing its output in your thoughts.`;

// Seed templates helper
function seedTemplate(templateType: string) {
  // Wipe sandbox folder first (safely without removing the folder itself)
  const items = fs.readdirSync(SANDBOX_DIR);
  for (const item of items) {
    const full = path.join(SANDBOX_DIR, item);
    if (fs.statSync(full).isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    } else {
      fs.unlinkSync(full);
    }
  }

  if (templateType === "javascript") {
    fs.writeFileSync(
      path.join(SANDBOX_DIR, "index.js"),
      `// Simple Calculator implementation
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };

console.log("Adding 5 and 3:", add(5, 3));
`,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(SANDBOX_DIR, "test.js"),
      `// Basic Test execution suite
const { add, subtract } = require("./index");

console.log("---- RUNNING WORKSPACE TESTS ----");
const resAdd = add(5, 3);
if (resAdd === 8) {
  console.log("✓ TEST PASS: add(5, 3) yields 8");
} else {
  console.error("✗ TEST FAIL: add(5, 3) yielded " + resAdd);
  process.exit(1);
}

const resSub = subtract(10, 4);
if (resSub === 6) {
  console.log("✓ TEST PASS: subtract(10, 4) yields 6");
} else {
  console.error("✗ TEST FAIL: subtract(10, 4) yielded " + resSub);
  process.exit(1);
}

console.log("All workspace tests passed successfully!");
`,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(SANDBOX_DIR, "README.md"),
      `# Javascript Sandbox

This is a Node.js sandbox environment for the AI Coding Agent.

### Files inside:
- \`index.js\`: Core application logic (doing add/subtract operations).
- \`test.js\`: Executable node unit test logic.

### To execute:
- Run \`node index.js\` to run the utility helper.
- Run \`node test.js\` to evaluate tests.
`,
      "utf-8"
    );
  } else if (templateType === "data_science") {
    const mockData = [
      { id: 1, name: "Alice", score: 85, active: true },
      { id: 2, name: "Bob", score: 92, active: false },
      { id: 3, name: "Charlie", score: 78, active: true },
      { id: 4, name: "Diane", score: 95, active: true },
      { id: 5, name: "Evan", score: 64, active: true }
    ];

    fs.writeFileSync(
      path.join(SANDBOX_DIR, "data.json"),
      JSON.stringify(mockData, null, 2),
      "utf-8"
    );

    fs.writeFileSync(
      path.join(SANDBOX_DIR, "analyze.js"),
      `// Data analytics script
const fs = require("fs");

try {
  const fileContent = fs.readFileSync("data.json", "utf-8");
  const records = JSON.parse(fileContent);
  
  console.log("Analyzing " + records.length + " participant records...");
  
  const activeRecords = records.filter(r => r.active);
  console.log("Active participants count:", activeRecords.length);
  
  const totalScore = activeRecords.reduce((sum, r) => sum + r.score, 0);
  const avgScore = totalScore / activeRecords.length;
  console.log("Average score of active participants:", avgScore.toFixed(2));
  
} catch (err) {
  console.error("Analysis failed:", err.message);
  process.exit(1);
}
`,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(SANDBOX_DIR, "README.md"),
      `# Data Science Sandbox

A workspace centered around JSON records parsing and automated analytics summaries.

### To execute:
- Run \`node analyze.js\` to evaluate statistics.
`,
      "utf-8"
    );
  } else {
    // Default Empty/Markdown base
    fs.writeFileSync(
      path.join(SANDBOX_DIR, "README.md"),
      `# CodexAgent Workspace

Welcome to your sandboxed workspace. Write code prompts to ask the AI Coding Agent to build algorithms, fix issues, or create documentation.

### Core Features:
1. Ask the coding agent to fulfill goals in this workspace.
2. Observe thoughts and execution tools in the agent loop timeline.
3. Edit files manually or run terminal commands to test outputs.
`,
      "utf-8"
    );
    fs.writeFileSync(path.join(SANDBOX_DIR, "index.js"),`console.log("Hello from CodexAgent Workspace!");\n`,"utf-8");
  }
}

// Pre-seed with default template on startup
seedTemplate("default");

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

function getDirectoryTree(dir: string, baseDir: string = SANDBOX_DIR): FileNode[] {
  const result: FileNode[] = [];
  if (!fs.existsSync(dir)) return result;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === "node_modules" || file === ".git" || file === ".DS_Store") continue;
    const fullPath = path.join(dir, file);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      result.push({
        name: file,
        path: relPath,
        type: 'dir',
        children: getDirectoryTree(fullPath, baseDir)
      });
    } else {
      result.push({
        name: file,
        path: relPath,
        type: 'file'
      });
    }
  }

  return result.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function executeCommand(command: string): Promise<string> {
  return new Promise((resolve) => {
    const dangerousPattern = /(rm\s+-rf\s+\/|poweroff|reboot|shutdown|mkfs|dd\s+if|chown|chmod\s+777\s+\/)/i;
    if (dangerousPattern.test(command)) {
      return resolve("Error: Command blocked due to security policies.");
    }

    const timeout = 12000; // Limit command execution to 12s

    exec(command, { cwd: SANDBOX_DIR, timeout }, (error, stdout, stderr) => {
      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += `[stderr]\n${stderr}`;
      if (error) {
        if (error.killed) {
          output += `\n[Process killed: Execution timed out after ${timeout / 1000}s]`;
        } else {
          output += `\n[Exit Code ${error.code}]: ${error.message}`;
        }
      }
      resolve(output || "[Command completed with empty output]");
    });
  });
}

// ─── Tavily web search client ─────────────────────────────────────────────────
const tavilyClient = process.env.TAVILY_API_KEY
  ? tavily({ apiKey: process.env.TAVILY_API_KEY })
  : null;

async function tavilySearch(query: string): Promise<string> {
  if (!tavilyClient) return "";
  try {
    const result = await tavilyClient.search(query, {
      searchDepth: "basic",
      maxResults: 5,
      includeAnswer: true,
    });
    const answer = result.answer ? `Summary: ${result.answer}\n\n` : "";
    const sources = result.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content?.slice(0, 300)}`)
      .join("\n\n");
    return `${answer}Sources:\n${sources}`;
  } catch {
    return "";
  }
}

// ─── Supabase (server-side, service role) ────────────────────────────────────
const SUPABASE_URL          = process.env.SUPABASE_URL  || "https://hrtynofmjcumuanjvpxz.supabase.co";
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Verify Bearer token → return Supabase user or null
async function getRequestUser(req: express.Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

// Express initialization
async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000");

  app.use(express.json());

  // ─── CORS ──────────────────────────────────────────────────────────────────
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000").split(",");
  app.use((req, res, next) => {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ─── Kanban API ────────────────────────────────────────────────────────────

  app.get("/api/kanban/tasks", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { data, error } = await supabaseAdmin
      .from("gsyen_kanban_tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("position");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/kanban/tasks", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { title, description, col, priority, tag, position } = req.body;
    const { data, error } = await supabaseAdmin
      .from("gsyen_kanban_tasks")
      .insert({ user_id: user.id, title, description: description || "", col: col || "todo", priority: priority || "medium", tag: tag || "Feature", position: position || 0 })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.put("/api/kanban/tasks/:id", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const allowed = ["title", "description", "col", "priority", "tag", "position"];
    const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabaseAdmin
      .from("gsyen_kanban_tasks")
      .update(patch)
      .eq("id", req.params.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/kanban/tasks/:id", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { error } = await supabaseAdmin
      .from("gsyen_kanban_tasks")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.sendStatus(204);
  });

  // ─── Calendar API ──────────────────────────────────────────────────────────

  app.get("/api/calendar/events", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { data, error } = await supabaseAdmin
      .from("gsyen_calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("date")
      .order("time");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/calendar/events", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { title, date, time, type, description } = req.body;
    const { data, error } = await supabaseAdmin
      .from("gsyen_calendar_events")
      .insert({ user_id: user.id, title, date, time: time || "09:00", type: type || "other", description: description || "" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.put("/api/calendar/events/:id", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const allowed = ["title", "date", "time", "type", "description"];
    const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabaseAdmin
      .from("gsyen_calendar_events")
      .update(patch)
      .eq("id", req.params.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/calendar/events/:id", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { error } = await supabaseAdmin
      .from("gsyen_calendar_events")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.sendStatus(204);
  });

  // ─── Emails API ────────────────────────────────────────────────────────────

  app.get("/api/emails", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { data, error } = await supabaseAdmin
      .from("gsyen_emails")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.patch("/api/emails/:id", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const allowed = ["is_read", "is_starred"];
    const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabaseAdmin
      .from("gsyen_emails")
      .update(patch)
      .eq("id", req.params.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // 1. Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", sandboxExists: fs.existsSync(SANDBOX_DIR) });
  });

  // 2. GET Files list
  app.get("/api/workspace/files", (req, res) => {
    try {
      const tree = getDirectoryTree(SANDBOX_DIR);
      res.json({ success: true, tree });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. GET Single File Content
  app.get("/api/workspace/file", (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ success: false, error: "Missing 'path' query parameter." });
    }
    try {
      const full = safePath(filePath);
      if (!fs.existsSync(full)) {
        return res.status(404).json({ success: false, error: "File not found." });
      }
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
         return res.status(400).json({ success: false, error: "Path is a directory." });
      }
      const contents = fs.readFileSync(full, "utf-8");
      res.json({ success: true, path: filePath, contents });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. POST Write Single File contents
  app.post("/api/workspace/file", (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ success: false, error: "Missing 'path' or 'content' in body." });
    }
    try {
      const full = safePath(filePath);
      const parentDir = path.dirname(full);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(full, content, "utf-8");
      res.json({ success: true, message: `Successfully wrote file to '${filePath}'` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. DELETE a File
  app.delete("/api/workspace/file", (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ success: false, error: "Missing 'path' query parameter." });
    }
    try {
      const full = safePath(filePath);
      if (!fs.existsSync(full)) {
        return res.status(404).json({ success: false, error: "File not found." });
      }
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        fs.unlinkSync(full);
      }
      res.json({ success: true, message: `Successfully deleted file/dir '${filePath}'` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. POST execute custom command
  app.post("/api/workspace/shell", async (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ success: false, error: "Missing 'command' parameter." });
    }
    try {
      const output = await executeCommand(command);
      res.json({ success: true, output });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. POST reset template
  app.post("/api/workspace/reset", (req, res) => {
    const { template } = req.body;
    try {
      seedTemplate(template || "default");
      res.json({ success: true, message: `Workspace reset successfully to '${template || "default"}'` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7.5. POST Simple chat stream endpoint (ChatGPT flow)
  app.post("/api/chat/stream", async (req, res) => {
    const { messages, model, webSearch } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: "Missing 'messages' array in request body." });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    // Inject Tavily search context if requested
    let contextMessages = [...messages];
    if (webSearch && tavilyClient) {
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
      if (lastUserMsg) {
        const searchContext = await tavilySearch(lastUserMsg.content);
        if (searchContext) {
          contextMessages = [
            { role: "system", content: `You have access to the following real-time web search results. Use them to answer accurately. Today's date: ${new Date().toISOString().slice(0, 10)}.\n\n${searchContext}` },
            ...messages
          ];
        }
      }
    }

    const selectedModel: string = model || "gemini-3.5-flash";
    const isKimiModel = selectedModel.startsWith("kimi") || selectedModel.startsWith("moonshot");

    if (isKimiModel) {
      // --- Moonshot / Kimi path (OpenAI-compatible SSE) ---
      const moonshotKey = process.env.MOONSHOT_API_KEY;
      if (!moonshotKey) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "MOONSHOT_API_KEY is not configured. Please add it to your environment secrets." })}\n\n`);
        return res.end();
      }

      try {
        const kimiMessages = [
          {
            role: "system",
            content: "You are Kimi, a highly capable AI assistant and senior software engineer. Answer code prompts clearly, keep replies concise and beautifully formatted using markdown."
          },
          ...contextMessages.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : (m.role === "system" ? "system" : "user"), content: m.content }))
        ];

        const kimiRes = await fetch("https://api.moonshot.cn/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${moonshotKey}`
          },
          body: JSON.stringify({ model: selectedModel, messages: kimiMessages, stream: true })
        });

        if (!kimiRes.ok || !kimiRes.body) {
          const errText = await kimiRes.text().catch(() => kimiRes.statusText);
          res.write(`data: ${JSON.stringify({ type: "error", message: `Moonshot API error: ${errText}` })}\n\n`);
          return res.end();
        }

        const reader = kimiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
              continue;
            }
            try {
              const chunk = JSON.parse(raw);
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
            } catch { /* skip malformed chunks */ }
          }
        }
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      } finally {
        res.end();
      }

    } else {
      // --- Gemini path ---
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "GEMINI_API_KEY is not configured inside the environment secrets." })}\n\n`);
        return res.end();
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } }
        });

        const geminiContents = contextMessages
          .filter((m: any) => m.role !== "system")
          .map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }));
        const systemSearch = contextMessages.find((m: any) => m.role === "system");
        const systemInstruction = "You are a highly capable backend simulation AI assistant and senior software engineer. Answer code prompts clearly, keep replies concise and beautifully formatted using markdown." +
          (systemSearch ? `\n\n${systemSearch.content}` : "");

        const stream = await ai.models.generateContentStream({
          model: selectedModel,
          contents: geminiContents,
          config: { systemInstruction }
        });

        for await (const chunk of stream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ type: "text", text: chunk.text })}\n\n`);
          }
        }

        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      } finally {
        res.end();
      }
    }
  });

  // 8. POST Run Agent loop (SSE Stream)
  app.post("/api/agent/run", async (req, res) => {
    const { prompt, systemInstruction, model } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: "Missing 'prompt' parameter." });
    }

    // Set up Server-Sent Events headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    const streamSend = (payload: any) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      streamSend({
        type: "error",
        message: "Gemini API Key is not configured. Please supply GEMINI_API_KEY in Secrets panel."
      });
      return res.end();
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });

      const selectedModel = model || "gemini-3.5-flash";
      const actualSystemInstruction = systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

      streamSend({ type: "status", text: `Initializing ${selectedModel}...` });

      // Define standard tool declarations
      const tools = [
        {
          functionDeclarations: [
            {
              name: "read_file",
              description: "Read the exact content of any file in the workspace. Path is relative to the workspace, e.g. 'index.js'.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  path: {
                    type: Type.STRING,
                    description: "Relative path of the target file to read."
                  }
                },
                required: ["path"]
              }
            },
            {
              name: "write_file",
              description: "Create or fully overwrite a file with contents. Path is relative to the workspace, e.g. 'utils.js'.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  path: {
                    type: Type.STRING,
                    description: "Relative path of the target file to write."
                  },
                  content: {
                    type: Type.STRING,
                    description: "The complete content string to write."
                  }
                },
                required: ["path", "content"]
              }
            },
            {
              name: "edit_file",
              description: "Target a file and replace a single unique substring ('old_content') with replacement ('new_content'). Fast precise patcher.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  path: {
                    type: Type.STRING,
                    description: "Relative path of the target file to patch."
                  },
                  old_content: {
                    type: Type.STRING,
                    description: "The EXACT character-sequence matching current text in the file."
                  },
                  new_content: {
                    type: Type.STRING,
                    description: "The new drop-in replacement text."
                  }
                },
                required: ["path", "old_content", "new_content"]
              }
            },
            {
              name: "list_dir",
              description: "Recursive search layout. Returns a text tree outline of files/folders currently inside of the sandboxed workspace folder.",
              parameters: {
                type: Type.OBJECT,
                properties: {}
              }
            },
            {
              name: "grep",
              description: "Search workspace search pattern. Scans text patterns in workspace files recursively and prints matching line numbers.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  pattern: {
                    type: Type.STRING,
                    description: "Substring query or text to find."
                  }
                },
                required: ["pattern"]
              }
            },
            {
              name: "bash",
              description: "Execute interactive shell commands safely in the sandboxed folder. Use to run tests (e.g. 'node test.js') or evaluate outcomes (e.g. 'node index.js'). Runs in background.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  command: {
                    type: Type.STRING,
                    description: "Terminal CLI statement to run."
                  }
                },
                required: ["command"]
              }
            }
          ]
        }
      ];

      // Build message array history
      const contents: any[] = [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ];

      let loopLimit = 8;
      let active = true;
      let stepCounter = 0;

      while (active && loopLimit > 0) {
        stepCounter++;
        streamSend({
          type: "status",
          text: `Executing reasoning loop turn ${stepCounter}...`,
          step: stepCounter
        });

        const responseObj = await ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: actualSystemInstruction,
            tools
          }
        });

        // Parse thoughts & functionCalls
        const candidate = responseObj.candidates?.[0];
        if (!candidate) {
          throw new Error("No candidates received from Gemini API.");
        }

        const modelMessage = candidate.content;
        const textThoughts = modelMessage.parts?.map(p => p.text).filter(Boolean).join("\n") || "";
        const functionCalls = responseObj.functionCalls; // returns Array of FunctionCalls

        // Stream thoughts immediately if present
        if (textThoughts) {
          streamSend({
            type: "thought",
            text: textThoughts,
            step: stepCounter
          });
        }

        // Add model output content to history to preserve context
        contents.push(modelMessage);

        if (functionCalls && functionCalls.length > 0) {
          streamSend({
            type: "status",
            text: `Analyzing ${functionCalls.length} requested tool(s)...`
          });

          const functionResponseParts: any[] = [];

          for (const call of functionCalls) {
            const toolName = call.name;
            const toolArgs = call.args as any;
            const callId = call.id;

            streamSend({
              type: "tool_call",
              name: toolName,
              args: toolArgs,
              id: callId,
              step: stepCounter
            });

            // Execute local tool on sandbox
            let executionResult = "";
            try {
              if (toolName === "read_file") {
                const full = safePath(toolArgs.path);
                if (fs.existsSync(full)) {
                  executionResult = fs.readFileSync(full, "utf-8");
                } else {
                  executionResult = `Error: File not found at '${toolArgs.path}'`;
                }
              } else if (toolName === "write_file") {
                const full = safePath(toolArgs.path);
                const parent = path.dirname(full);
                if (!fs.existsSync(parent)) {
                  fs.mkdirSync(parent, { recursive: true });
                }
                fs.writeFileSync(full, toolArgs.content, "utf-8");
                executionResult = `Success: Written file '${toolArgs.path}' (${toolArgs.content.length} chars).`;
              } else if (toolName === "edit_file") {
                const full = safePath(toolArgs.path);
                if (!fs.existsSync(full)) {
                  executionResult = `Error: File not found at '${toolArgs.path}'`;
                } else {
                  const current = fs.readFileSync(full, "utf-8");
                  if (!current.includes(toolArgs.old_content)) {
                    executionResult = `Error: Match old_content not found inside '${toolArgs.path}'`;
                  } else {
                    const occurrences = current.split(toolArgs.old_content).length - 1;
                    if (occurrences > 1) {
                      executionResult = `Error: Multiple matches found (${occurrences}). Please supply a longer context block.`;
                    } else {
                      const updated = current.replace(toolArgs.old_content, toolArgs.new_content);
                      fs.writeFileSync(full, updated, "utf-8");
                      executionResult = `Success: Edited patch inside '${toolArgs.path}'`;
                    }
                  }
                }
              } else if (toolName === "list_dir") {
                const tree = getDirectoryTree(SANDBOX_DIR);
                const formatTree = (nodes: FileNode[], indent: string = ""): string => {
                  let out = "";
                  for (const node of nodes) {
                    if (node.type === "dir") {
                      out += `${indent}📁 ${node.name}/\n`;
                      out += formatTree(node.children || [], indent + "  ");
                    } else {
                      out += `${indent}📄 ${node.name}\n`;
                    }
                  }
                  return out;
                };
                executionResult = formatTree(tree) || "[Workspace is empty]";
              } else if (toolName === "grep") {
                const pattern = toolArgs.pattern || "";
                const results: string[] = [];
                const searchDir = (dir: string) => {
                  const files = fs.readdirSync(dir);
                  for (const file of files) {
                    if (file === "node_modules" || file === ".git" || file === ".DS_Store") continue;
                    const fullPath = path.join(dir, file);
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                      searchDir(fullPath);
                    } else {
                      const text = fs.readFileSync(fullPath, "utf-8");
                      const lines = text.split("\n");
                      const rel = path.relative(SANDBOX_DIR, fullPath).replace(/\\/g, "/");
                      lines.forEach((line, index) => {
                        if (line.toLowerCase().includes(pattern.toLowerCase())) {
                          results.push(`${rel}:${index + 1}: ${line.trim()}`);
                        }
                      });
                    }
                  }
                };
                searchDir(SANDBOX_DIR);
                executionResult = results.length > 0 ? results.join("\n") : `No matches found for '${pattern}'`;
              } else if (toolName === "bash") {
                executionResult = await executeCommand(toolArgs.command);
              } else {
                executionResult = `Error: Tool '${toolName}' not supported.`;
              }
            } catch (err: any) {
              executionResult = `Error executing tool: ${err.message}`;
            }

            streamSend({
              type: "tool_result",
              name: toolName,
              id: callId,
              output: executionResult,
              step: stepCounter
            });

            functionResponseParts.push({
              functionResponse: {
                name: toolName,
                response: { output: executionResult },
                id: callId
              }
            });
          }

          // Push the tool execution response back to context history
          contents.push({
            role: "tool",
            parts: functionResponseParts
          });

        } else {
          // No tools were called by the assistant, which means the task is complete in its views!
          active = false;
          streamSend({
            type: "done",
            text: textThoughts || "Task finished successfully!",
            step: stepCounter
          });
        }

        loopLimit--;
      }

      if (loopLimit <= 0 && active) {
        streamSend({
          type: "status",
          text: "Agent reached loop iteration constraint safety limit of 8 steps."
        });
        streamSend({
          type: "done",
          text: "Unfinished: Loop limit was reached before the agent fully concluded. Try refining your prompt.",
          step: stepCounter
        });
      }

    } catch (err: any) {
      streamSend({ type: "error", message: `Agent loop aborted: ${err.message}` });
    } finally {
      res.end();
    }
  });

  // Serve static assets in Vite or custom static folder
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Code Agent Simulator server listening on port ${PORT}`);
  });
}

startServer();
