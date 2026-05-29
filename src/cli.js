#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONNECTOR = {
  "dir": "xmem-hermes",
  "bin": "xmem-hermes",
  "id": "hermes",
  "display": "Hermes",
  "description": "Hermes Agent MCP connector for XMem persistent memory.",
  "defaultUserId": "hermes_user",
  "category": "hermes",
  "installTarget": ".hermes/config.yaml and HERMES.md",
  "extraFiles": {}
};
const SECRET_PLACEHOLDER = "${XMEM_API_KEY}";

function parseArgs(argv) {
  const command = argv[0] || "help";
  const options = { command, dryRun: false, apiUrl: process.env.XMEM_API_URL || "https://api.xmem.in" };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--config-root") options.configRoot = argv[++i];
    else if (arg === "--api-url") options.apiUrl = argv[++i];
    else if (arg === "--mcp-command") options.mcpCommand = argv[++i];
    else if (arg === "--help" || arg === "-h") options.command = "help";
  }
  return options;
}

function configRoot(options) {
  if (options.configRoot) return options.configRoot;
  return homedir();
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function write(path, content, dryRun) {
  if (dryRun) {
    console.log("[dry-run] would write " + path);
    return;
  }
  ensureParent(path);
  writeFileSync(path, content, "utf8");
  console.log("wrote " + path);
}

function mcpServer(options) {
  const parts = (options.mcpCommand || "uvx xmem-mcp").split(/\s+/).filter(Boolean);
  return {
    command: parts[0],
    args: parts.slice(1),
    env: {
      TRANSPORT: "stdio",
      XMEM_API_URL: options.apiUrl,
      XMEM_API_KEY: SECRET_PLACEHOLDER,
      XMEM_USERNAME: "${XMEM_USERNAME}",
      DEFAULT_USER_ID: CONNECTOR.defaultUserId,
    },
  };
}

function json(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function tomlConfig(options) {
  const server = mcpServer(options);
  return [
    "[mcp_servers.xmem]",
    "command = \"" + server.command + "\"",
    "args = " + JSON.stringify(server.args),
    "",
    "[mcp_servers.xmem.env]",
    "TRANSPORT = \"stdio\"",
    "XMEM_API_URL = \"" + options.apiUrl + "\"",
    "XMEM_API_KEY = \"" + SECRET_PLACEHOLDER + "\"",
    "XMEM_USERNAME = \"${XMEM_USERNAME}\"",
    "DEFAULT_USER_ID = \"" + CONNECTOR.defaultUserId + "\"",
    "",
  ].join("\n");
}

function yamlConfig(options) {
  const server = mcpServer(options);
  return [
    "mcp_servers:",
    "  xmem:",
    "    command: " + server.command,
    "    args:",
    ...server.args.map((arg) => "      - " + arg),
    "    env:",
    "      TRANSPORT: stdio",
    "      XMEM_API_URL: " + options.apiUrl,
    "      XMEM_API_KEY: " + SECRET_PLACEHOLDER,
    "      XMEM_USERNAME: ${XMEM_USERNAME}",
    "      DEFAULT_USER_ID: " + CONNECTOR.defaultUserId,
    "",
  ].join("\n");
}

function memoryInstructions() {
  return [
    "# XMem memory",
    "",
    "Use the xmem MCP tools when the user asks you to remember, recall, search, or connect project context across sessions.",
    "",
    "- Save durable user preferences in user scope.",
    "- Save repository workflows, architecture, and decisions in project scope.",
    "- Search or retrieve before answering questions that depend on prior sessions.",
    "- Never store secrets, API keys, tokens, private keys, or credential material.",
    "",
  ].join("\n");
}

function install(options) {
  const root = configRoot(options);
  const server = mcpServer(options);
  if (CONNECTOR.category === "cursor") {
    write(join(root, ".cursor", "mcp.json"), json({ mcpServers: { xmem: server } }), options.dryRun);
    write(join(root, ".cursor", "rules", "xmem-memory.mdc"), memoryInstructions(), options.dryRun);
  } else if (CONNECTOR.category === "claude") {
    write(join(root, ".mcp.json"), json({ mcpServers: { xmem: server } }), options.dryRun);
    write(join(root, ".claude", "commands", "xmem-init.md"), memoryInstructions(), options.dryRun);
    write(join(root, ".claude", "commands", "xmem-recall.md"), "# Recall with XMem\n\nSearch and retrieve relevant XMem memories before responding.\n", options.dryRun);
  } else if (CONNECTOR.category === "hermes") {
    write(join(root, ".hermes", "config.yaml"), yamlConfig(options), options.dryRun);
    write(join(root, "HERMES.md"), memoryInstructions(), options.dryRun);
  } else if (CONNECTOR.category === "codex") {
    write(join(root, ".codex", "config.toml"), tomlConfig(options), options.dryRun);
    write(join(root, "AGENTS.md"), memoryInstructions(), options.dryRun);
  } else if (CONNECTOR.category === "openclaw") {
    write(join(root, ".mcp.json"), json({ mcpServers: { xmem: server } }), options.dryRun);
    write(join(root, "skills", "xmem-memory", "SKILL.md"), memoryInstructions(), options.dryRun);
    write(join(root, "openclaw.plugin.json"), json({
      id: "xmem-openclaw",
      name: "XMem OpenClaw",
      version: "1.0.0",
      description: "XMem memory connector bundle for OpenClaw",
      configSchema: { type: "object", additionalProperties: false, properties: {} },
    }), options.dryRun);
  }
  console.log(CONNECTOR.display + " connector install complete.");
  console.log("Keep XMEM_API_KEY in your environment; it was not copied into generated files.");
}

function doctor(options) {
  const root = configRoot(options);
  const expected = {
    cursor: [".cursor/mcp.json", ".cursor/rules/xmem-memory.mdc"],
    claude: [".mcp.json", ".claude/commands/xmem-init.md", ".claude/commands/xmem-recall.md"],
    hermes: [".hermes/config.yaml", "HERMES.md"],
    codex: [".codex/config.toml", "AGENTS.md"],
    openclaw: [".mcp.json", "skills/xmem-memory/SKILL.md", "openclaw.plugin.json"],
  }[CONNECTOR.category];
  let ok = true;
  for (const file of expected) {
    const path = join(root, file);
    const present = existsSync(path);
    ok = ok && present;
    console.log((present ? "ok " : "missing ") + file);
    if (present) {
      const content = readFileSync(path, "utf8");
      if (process.env.XMEM_API_KEY && content.includes(process.env.XMEM_API_KEY)) {
        console.error("secret value found in " + file);
        process.exitCode = 1;
      }
    }
  }
  if (!ok) process.exitCode = 1;
}

async function smokeTest() {
  const apiKey = process.env.XMEM_API_KEY;
  const apiUrl = (process.env.XMEM_API_URL || "https://api.xmem.in").replace(/\/$/, "");
  const username = process.env.XMEM_USERNAME || CONNECTOR.defaultUserId;
  if (!apiKey) {
    console.error("XMEM_API_KEY is required for smoke-test.");
    process.exit(1);
  }
  const response = await fetch(apiUrl + "/v1/memory/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      "X-XMem-Username": username,
    },
    body: JSON.stringify({
      query: "xmem connector smoke test",
      user_id: CONNECTOR.defaultUserId,
      top_k: 1,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status === "error") {
    console.error("XMem smoke test failed: HTTP " + response.status);
    process.exit(1);
  }
  const data = body.data || body;
  const count = Array.isArray(data.results) ? data.results.length : 0;
  console.log("XMem smoke test ok for " + CONNECTOR.display + " (" + count + " result(s)).");
}

function help() {
  console.log(`
${CONNECTOR.bin} - XMem connector for ${CONNECTOR.display}

Commands:
  install      Write connector config files
  doctor       Check generated files
  smoke-test   Verify XMem API access from environment

Options:
  --config-root <path>    Write config under a custom root
  --api-url <url>         XMem API URL
  --mcp-command <cmd>     MCP launch command, default: uvx xmem-mcp
  --dry-run               Print intended writes
`);
}

const options = parseArgs(process.argv.slice(2));
if (options.command === "install") install(options);
else if (options.command === "doctor") doctor(options);
else if (options.command === "smoke-test") await smokeTest();
else help();
