import { Effect, FileSystem, pipe } from "effect";
import { implementing, type EffectGen } from "effective-modules";
import { resolve } from "node:path";
import { NPM_PACKAGE_SPEC } from "../../common/constants";
import { libraryModules } from "../index";
import type { INpm, InstallTarballInput, PublishInput } from "./interface";

export class NpmImpl extends implementing(libraryModules.Npm).uses(libraryModules.OSPlatform, FileSystem.FileSystem) implements INpm {
  *ensureAvailable(): EffectGen<string, string> {
    const result = yield* this.dependencies.OSPlatform.spawnProcess({
      command: "bunx",
      args: [NPM_PACKAGE_SPEC, "--version"],
    });
    if (result.exitCode !== 0) {
      return yield* Effect.fail(`Cannot resolve ${NPM_PACKAGE_SPEC}:\n${[result.stdout, result.stderr].join("\n").trim()}`);
    }
    return result.stdout.trim().split("\n").at(-1) ?? NPM_PACKAGE_SPEC;
  }

  *pack(packageDir: string, outDir: string): EffectGen<string, string> {
    // npm keeps a copy of every tarball it packs in its cache, and a pack always starts from freshly
    // stamped files so that copy is never reused. A throwaway cache keeps it out of dist/, which is
    // uploaded as the deploy artifact, and out of the user's own ~/.npm.
    const fs = this.getDependency(FileSystem.FileSystem);
    const cacheDir = yield* pipe(
      fs.makeTempDirectory({ prefix: "jive-npm-cache-" }),
      Effect.mapError((e) => `Cannot create a temporary npm cache: ${e.message}`),
    );

    try {
      const result = yield* this.dependencies.OSPlatform.spawnProcess({
        command: "bunx",
        args: [
          NPM_PACKAGE_SPEC, "pack", packageDir,
          "--pack-destination", outDir,
          "--ignore-scripts",
          "--cache", cacheDir,
          "--loglevel", "error",
        ],
      });
      if (result.exitCode !== 0) {
        return yield* Effect.fail(`npm pack failed for ${packageDir}:\n${result.stderr.trim()}`);
      }

      const fileName = result.stdout.trim().split("\n").at(-1);
      if (!fileName) {
        return yield* Effect.fail(`npm pack did not report an output file for ${packageDir}`);
      }
      return resolve(outDir, fileName);
    } finally {
      yield* pipe(fs.remove(cacheDir, { recursive: true, force: true }), Effect.ignore);
    }
  }

  *publish({ tarballPath, tag }: PublishInput): EffectGen<void, string> {
    const result = yield* this.dependencies.OSPlatform.spawnProcess({
      command: "bunx",
      args: [NPM_PACKAGE_SPEC, "publish", tarballPath, "--tag", tag],
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) {
      return yield* Effect.fail(`npm publish failed for ${tarballPath} with exit code ${result.exitCode}`);
    }
  }

  *installTarball({ alias, tarballPath }: InstallTarballInput): EffectGen<void, string> {
    // Captured rather than inherited: a hook whose stdout the pipeline parses must stay clean, and
    // `bun add` writes its progress there.
    const result = yield* this.dependencies.OSPlatform.spawnProcess({
      command: "bun",
      args: ["add", "--no-save", `${alias}@${tarballPath}`],
    });
    if (result.exitCode !== 0) {
      return yield* Effect.fail(`bun add failed for ${alias}:\n${[result.stdout, result.stderr].join("\n").trim()}`);
    }
  }
}
