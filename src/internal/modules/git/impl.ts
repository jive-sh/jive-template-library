import { Effect, Option } from "effect";
import { implementing, type EffectGen } from "effective-modules";
import { libraryModules } from "../index";
import type { IGit, Remote } from "./interface";

const REMOTE_PATTERNS = [
  /^git@(?<host>[^:]+):(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/,
  /^ssh:\/\/git@(?<host>[^/]+)\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/,
  /^https?:\/\/(?:[^@]+@)?(?<host>[^/]+)\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/,
];

export class GitImpl extends implementing(libraryModules.Git).uses(libraryModules.OSPlatform) implements IGit {
  *getRemoteOrigin(): EffectGen<Option.Option<Remote>, string> {
    const result = yield* this.dependencies.OSPlatform.spawnProcess({
      command: "git",
      args: ["config", "--get", "remote.origin.url"],
    });
    if (result.exitCode !== 0) return Option.none();

    const raw = result.stdout.trim();
    if (raw.length === 0) return Option.none();

    for (const pattern of REMOTE_PATTERNS) {
      const groups = pattern.exec(raw)?.groups;
      if (!groups?.["host"] || !groups["owner"] || !groups["repo"]) continue;
      const { host, owner, repo } = groups as { host: string; owner: string; repo: string };
      return Option.some({
        owner,
        repo,
        packageJsonUrl: `git+https://${host}/${owner}/${repo}.git`,
      });
    }

    return yield* Effect.fail(`Cannot parse remote.origin.url "${raw}" as an owner/repo pair`);
  }
}
