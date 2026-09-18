import { Effect } from "effect";
import { implementing, type EffectGen } from "effective-modules";
import { libraryModules } from "../index";
import type {
  CompileExecutableInput,
  IOSPlatform,
  ProcessResult,
  SpawnProcessInput,
} from "./interface";

export class OSPlatformImpl extends implementing(libraryModules.OSPlatform) implements IOSPlatform {
  *spawnProcess(input: SpawnProcessInput): EffectGen<ProcessResult, string> {
    return yield* Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn([input.command, ...(input.args ?? [])], {
          cwd: input.cwd,
          env: input.env,
          stdin: input.stdin ?? "ignore",
          stdout: input.stdout ?? "pipe",
          stderr: input.stderr ?? "pipe",
        });
        const [exitCode, stdout, stderr] = await Promise.all([
          proc.exited,
          proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(""),
          proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(""),
        ]);
        return { exitCode, stdout, stderr };
      },
      catch: (e) => `Failed to run ${input.command}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  *compileExecutable(input: CompileExecutableInput): EffectGen<void, string> {
    const result = yield* Effect.tryPromise({
      try: () => Bun.build({
        entrypoints: [input.entrypoint],
        compile: { outfile: input.outfile, target: input.target as Bun.Build.CompileTarget },
        root: input.root,
        sourcemap: "inline",
      }),
      catch: (e) => `Failed to compile ${input.target}: ${e instanceof Error ? e.message : String(e)}`,
    });
    if (!result.success) {
      return yield* Effect.fail(`Failed to compile ${input.target}: ${result.logs.map(String).join("\n")}`);
    }
  }

  *getCurrentDirectory(): EffectGen<string> {
    return yield* Effect.sync(() => process.cwd());
  }

  *getCurrentPlatform(): EffectGen<{ readonly os: string; readonly cpu: string }> {
    return yield* Effect.sync(() => ({ os: process.platform, cpu: process.arch }));
  }

  *requireEnv(name: string): EffectGen<string, string> {
    const value = yield* Effect.sync(() => process.env[name]);
    if (!value) return yield* Effect.fail(`${name} is not set`);
    return value;
  }
}
