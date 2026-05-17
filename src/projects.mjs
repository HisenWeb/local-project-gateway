import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleProjectsConfig = path.join(repoRoot, "projects.example.json");
const localProjectsConfig = path.join(repoRoot, "projects.local.json");

const MAX_MODEL_CHARS = 200;
const MODEL_RE = /^[a-zA-Z][a-zA-Z0-9._-]*\/[a-zA-Z][a-zA-Z0-9._-]+$/;

export function resolveProjectsConfigPath() {
  if (process.env.PROJECTS_CONFIG) {
    return path.resolve(process.env.PROJECTS_CONFIG);
  }

  if (fsSync.existsSync(localProjectsConfig)) {
    return localProjectsConfig;
  }

  return exampleProjectsConfig;
}

export async function loadProjects() {
  const configPath = resolveProjectsConfigPath();
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(String(raw || "").replace(/^\uFEFF/, ""));
  const configDir = path.dirname(configPath);

  if (!parsed || !Array.isArray(parsed.projects)) {
    throw new Error(`${path.basename(configPath)} must contain projects array`);
  }

  return parsed.projects.map((project) => {
    const id = String(project.id || "").trim();
    const rootInput = String(project.root || "");

    if (!id) {
      throw new Error(`${path.basename(configPath)} contains project without id`);
    }

    if (!rootInput) {
      throw new Error(`${path.basename(configPath)} contains project without root`);
    }

    const root = path.isAbsolute(rootInput)
      ? path.resolve(rootInput)
      : path.resolve(configDir, rootInput);

    const model = (() => {
      const raw = String(project.model ?? "").trim();
      if (!raw) return null;
      if (raw.length > MAX_MODEL_CHARS) throw new Error(`${path.basename(configPath)} contains project with invalid model`);
      if (!MODEL_RE.test(raw)) throw new Error(`${path.basename(configPath)} contains project with invalid model`);
      return raw;
    })();

    return {
      id,
      name: String(project.name || id),
      root,
      model
    };
  });
}

export async function findProject(projectId) {
  const id = String(projectId || "").trim();
  const projects = await loadProjects();
  return projects.find((project) => project.id === id) || null;
}


