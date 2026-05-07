import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildDiagnostic, BuildProfile, BuildResult, HelperSettings } from "@usaco-helper/shared-types";
import { parseCompilerDiagnostics } from "../utils/diagnostics.js";
import { analyzeCppSourceSnapshot, validateCppSourceSnapshot } from "../utils/sourceValidation.js";

export class BuildService {
  constructor(private readonly workspaceDir: string) {}

  async build(
    sourceFileName: string,
    sourceCode: string,
    settings: HelperSettings,
    profile: BuildProfile = "usaco"
  ): Promise<BuildResult> {
    const sourceValidation = validateCppSourceSnapshot(sourceCode);
    if (!sourceValidation.ok) {
      return invalidSourceBuildResult(sourceValidation.message ?? "No synced source code available. Use Sync first.");
    }
    const sourceWarnings = analyzeCppSourceSnapshot(sourceCode);

    await mkdir(this.workspaceDir, { recursive: true });
    const safeSourceFileName = sanitizeFileName(sourceFileName);
    const sourcePath = path.join(this.workspaceDir, safeSourceFileName);
    const executablePath = path.join(this.workspaceDir, process.platform === "win32" ? "main.exe" : "main");
    await writeFile(sourcePath, sourceCode, "utf8");

    const args = [
      `-std=${settings.cxxStandard}`,
      ...flagsForProfile(profile),
      sourcePath,
      "-o",
      executablePath,
      ...(profile === "usaco" ? ["-lm"] : []),
      ...settings.extraCompileFlags
    ];

    const { command, result } = await compileWithStandardFallbacks(
      settings.compilerPath,
      args,
      settings.cxxStandard,
      this.workspaceDir
    );
    const diagnostics = normalizeDiagnostics(parseCompilerDiagnostics(result.stderr), result.stderr);
    const stdout = prependSourceWarnings(result.stdout, sourceWarnings);

    return {
      success: result.exitCode === 0,
      command,
      stdout,
      stderr: result.stderr,
      diagnostics,
      executablePath: result.exitCode === 0 ? executablePath : undefined
    };
  }
}

function sanitizeFileName(fileName: string): string {
  return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_") || "main.cpp";
}

function invalidSourceBuildResult(message: string): BuildResult {
  return {
    success: false,
    command: [],
    stdout: "",
    stderr: message,
    diagnostics: [
      {
        severity: "error",
        message,
        raw: message
      }
    ]
  };
}

function prependSourceWarnings(stdout: string, warnings: string[]): string {
  if (warnings.length === 0) {
    return stdout;
  }

  return [
    "[USACO Helper source check]",
    ...warnings.map((warning) => `- ${warning}`),
    "",
    stdout
  ].join("\n");
}

function flagsForProfile(profile: BuildProfile): string[] {
  if (profile === "debug") {
    return ["-O0", "-g"];
  }

  return ["-O2"];
}

async function spawnProcess(command: string, args: string[], cwd: string) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function compileWithStandardFallbacks(
  compilerPath: string,
  args: string[],
  requestedStandard: string,
  cwd: string
) {
  let currentArgs = args;
  let result = await spawnProcess(compilerPath, currentArgs, cwd);

  if (result.exitCode === 0 || !isUnsupportedStandardError(result.stderr)) {
    return {
      command: [compilerPath, ...currentArgs],
      result
    };
  }

  for (const standard of fallbackStandardsFor(requestedStandard)) {
    currentArgs = args.map((arg) => arg === `-std=${requestedStandard}` ? `-std=${standard}` : arg);
    result = await spawnProcess(compilerPath, currentArgs, cwd);

    if (result.exitCode === 0 || !isUnsupportedStandardError(result.stderr)) {
      return {
        command: [compilerPath, ...currentArgs],
        result
      };
    }
  }

  return {
    command: [compilerPath, ...currentArgs],
    result
  };
}

function isUnsupportedStandardError(stderr: string): boolean {
  return /unrecognized command(?:-|\s+)line option|invalid value|valid arguments/i.test(stderr);
}

function fallbackStandardsFor(cxxStandard: string): string[] {
  switch (cxxStandard) {
    case "c++17":
      return ["c++1z"];
    case "gnu++17":
      return ["gnu++1z"];
    case "c++11":
      return ["c++0x"];
    case "gnu++11":
      return ["gnu++0x"];
    default:
      return [];
  }
}

function normalizeDiagnostics(diagnostics: BuildDiagnostic[], stderr: string): BuildDiagnostic[] {
  if (diagnostics.length > 0 || !stderr.trim()) {
    return diagnostics;
  }
  return [
    {
      severity: "error",
      message: stderr.trim(),
      raw: stderr.trim()
    }
  ];
}
