#!/usr/bin/env node
// SessionStart hook: print the routing policy so it lands in Claude's context.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const policy = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts", "routing-policy.md");
process.stdout.write(fs.readFileSync(policy, "utf8"));
