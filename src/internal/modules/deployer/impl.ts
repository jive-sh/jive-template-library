import { Effect, FileSystem, pipe } from "effect";
import { effunct, implementing, type EffectGen } from "effective-modules";
import { resolve } from "node:path";
import { isEnvironment, LOCAL_ENVIRONMENT } from "../../../index";
import { LOCAL_ALIAS_SUFFIX, OUTDIR } from "../../common/constants";
import { libraryModules } from "../index";
import { BASE_PACKAGE_DIR, PLATFORMS } from "../builder/interface";
import type { DeployInput, IDeployer } from "./interface";
import { baseDistTag, baseVersion, baseVersionOf, platformDistTag, platformVersion } from "./versions";

interface PlatformPackage {
  readonly platform: string;
  readonly packageDir: string;
  readonly version: string;
  readonly distTag: string;
}

export class DeployerImpl extends implementing(libraryModules.Deployer)
  .uses(libraryModules.OSPlatform, libraryModules.Npm, FileSystem.FileSystem)
  implements IDeployer {

  *deploy({ environment, sourceCommitSha }: DeployInput): EffectGen<void, string> {
    const outDir = resolve(yield* this.dependencies.OSPlatform.getCurrentDirectory(), OUTDIR);
    const { name, version } = yield* this.readBuiltBase(outDir);
    const local = isEnvironment(environment, LOCAL_ENVIRONMENT);

    const platformPackages: PlatformPackage[] = [];
    for (const platform of yield* this.builtPlatforms(outDir)) {
      const stamped = platformVersion(version, environment, sourceCommitSha, platform);
      yield* this.updateManifest(resolve(outDir, platform), { version: stamped });
      platformPackages.push({
        platform,
        packageDir: resolve(outDir, platform),
        version: stamped,
        distTag: platformDistTag(environment, sourceCommitSha, platform),
      });
    }

    // Everything this run resolved, stated before any of it is acted on: the lines below arrive in
    // completion order, so the plan has to be readable on its own.
    const stampedBase = baseVersion(version, environment, sourceCommitSha);
    const baseTag = baseDistTag(environment, sourceCommitSha);
    yield* Effect.log(`${local ? "Installing" : "Publishing"} ${name}`);
    yield* Effect.log(`Commit ${sourceCommitSha.slice(0, 8) || "unknown"}, built from version ${version} in ${OUTDIR}`);
    yield* Effect.log(local ? "Packages (local-only, no tags):" : "Packages:");
    yield* Effect.log(`  - ${BASE_PACKAGE_DIR}: ${stampedBase}${local ? "" : ` (tag ${baseTag})`}`);
    for (const platformPackage of local ? yield* this.localOnly(platformPackages) : platformPackages) {
      yield* Effect.log(`  - ${platformPackage.platform}: ${platformPackage.version}${local ? "" : ` (tag ${platformPackage.distTag})`}`);
    }

    yield* Effect.log(`Installing npm ${yield* this.dependencies.Npm.ensureAvailable()}`);

    if (local) {
      yield* this.installLocally({ outDir, name, stampedBase, platformPackages });
      return;
    }
    yield* this.publishRelease({ outDir, name, stampedBase, baseTag, platformPackages });
  }

  /**
   * A release publishes the platform packages together first: the base package's optional
   * dependencies name their exact versions, so none of them may be missing once the base is
   * installable. Packing has no such ordering, so all of it happens at once.
   */
  private *publishRelease(input: {
    outDir: string; name: string; stampedBase: string; baseTag: string;
    platformPackages: ReadonlyArray<PlatformPackage>;
  }): EffectGen<void, string> {
    const { outDir, name, stampedBase, baseTag, platformPackages } = input;

    const baseDir = resolve(outDir, BASE_PACKAGE_DIR);
    yield* this.updateManifest(baseDir, {
      version: stampedBase,
      ...(platformPackages.length > 0
        ? {
          optionalDependencies: Object.fromEntries(platformPackages.map((platformPackage) => [
            `${name}-${platformPackage.platform}`,
            `npm:${name}@${platformPackage.version}`,
          ])),
        }
        : {}),
    });

    const toPack = [
      { label: BASE_PACKAGE_DIR, packageDir: baseDir, distTag: baseTag },
      ...platformPackages.map((p) => ({ label: p.platform, packageDir: p.packageDir, distTag: p.distTag })),
    ];
    yield* Effect.log(`Packing ${toPack.length} packages in parallel`);
    const tarballs = yield* Effect.all(
      toPack.map((target) => effunct(this.packOne.bind(this))(outDir, target.label, target.packageDir)),
      { concurrency: toPack.length },
    );
    const tarballOf = new Map(toPack.map((target, index) => [target.label, tarballs[index] as string]));

    if (platformPackages.length > 0) {
      yield* Effect.log(`Publishing ${platformPackages.length} platform packages in parallel`);
      yield* Effect.all(
        platformPackages.map((platformPackage) => effunct(this.publishOne.bind(this))(
          platformPackage.platform,
          tarballOf.get(platformPackage.platform) as string,
          platformPackage.distTag,
        )),
        { concurrency: platformPackages.length },
      );
    }

    yield* Effect.log("Publishing base package");
    yield* this.publishOne(BASE_PACKAGE_DIR, tarballOf.get(BASE_PACKAGE_DIR) as string, baseTag);
    yield* Effect.log(`Published ${toPack.length} packages`);
  }

  private *packOne(outDir: string, label: string, packageDir: string): EffectGen<string, string> {
    const tarballPath = yield* this.dependencies.Npm.pack(packageDir, outDir);
    yield* Effect.log(`  - ${label} packed`);
    return tarballPath;
  }

  private *publishOne(label: string, tarballPath: string, distTag: string): EffectGen<void, string> {
    yield* this.dependencies.Npm.publish({ tarballPath, tag: distTag });
    yield* Effect.log(`  - ${label} published`);
  }

  /**
   * The local environment installs instead of publishing, and only this machine's platform package
   * is worth packing. Its tarball path goes into the base manifest, so it must exist before the base
   * package is stamped — which is why these two pack in sequence.
   */
  private *installLocally(input: {
    outDir: string; name: string; stampedBase: string; platformPackages: ReadonlyArray<PlatformPackage>;
  }): EffectGen<void, string> {
    const { outDir, name, stampedBase, platformPackages } = input;
    const local = yield* this.localOnly(platformPackages);

    yield* Effect.log(`Packing ${local.length + 1} packages`);
    const optionalDependencies: Record<string, string> = {};
    for (const platformPackage of local) {
      const tarballPath = yield* this.packOne(outDir, platformPackage.platform, platformPackage.packageDir);
      optionalDependencies[`${name}-${platformPackage.platform}`] = `file:${tarballPath}`;
    }

    const baseDir = resolve(outDir, BASE_PACKAGE_DIR);
    yield* this.updateManifest(baseDir, {
      version: stampedBase,
      ...(local.length > 0 ? { optionalDependencies } : {}),
    });
    const baseTarball = yield* this.packOne(outDir, BASE_PACKAGE_DIR, baseDir);

    const alias = `${name}${LOCAL_ALIAS_SUFFIX}`;
    yield* this.dependencies.Npm.installTarball({ alias, tarballPath: baseTarball });
    yield* Effect.log(`Installed ${alias}@${stampedBase} locally`);

    const fs = this.getDependency(FileSystem.FileSystem);
    for (const tarball of [...Object.values(optionalDependencies).map((spec) => spec.slice("file:".length)), baseTarball]) {
      yield* pipe(fs.remove(tarball, { force: true }), Effect.mapError((e) => `Cannot remove ${tarball}: ${e.message}`));
    }
  }

  /** The one platform package this machine can actually install, if the build produced it. */
  private *localOnly(
    platformPackages: ReadonlyArray<PlatformPackage>,
  ): EffectGen<ReadonlyArray<PlatformPackage>, string> {
    if (platformPackages.length === 0) return [];
    const { os, cpu } = yield* this.dependencies.OSPlatform.getCurrentPlatform();
    const platform = PLATFORMS.find((candidate) => candidate.os === os && candidate.cpu === cpu);
    const built = platform && platformPackages.find((candidate) => candidate.platform === platform.id);
    if (!built) {
      return yield* Effect.fail(`No platform package was built for this machine (${os}-${cpu}) — nothing to install`);
    }
    return [built];
  }

  /** Recovers the name and clean X.Y.Z the build stamped, failing loudly if dist/ is not a build. */
  private *readBuiltBase(outDir: string): EffectGen<{ name: string; version: string }, string> {
    const manifest = yield* this.readManifest(resolve(outDir, BASE_PACKAGE_DIR));
    const name = manifest["name"];
    const stamped = manifest["version"];
    if (typeof name !== "string" || typeof stamped !== "string") {
      return yield* Effect.fail(`${OUTDIR}/${BASE_PACKAGE_DIR}/package.json has no name or version — run the build first`);
    }
    const version = baseVersionOf(stamped);
    if (version === undefined) {
      return yield* Effect.fail(`${OUTDIR}/${BASE_PACKAGE_DIR}/package.json version "${stamped}" is not a local build — run the build first`);
    }
    return { name, version };
  }

  private *builtPlatforms(outDir: string): EffectGen<ReadonlyArray<string>, string> {
    const children = yield* pipe(
      this.getDependency(FileSystem.FileSystem).readDirectory(outDir),
      Effect.mapError((e) => `Cannot read ${OUTDIR}: ${e.message}`),
    );
    const known = new Set<string>(PLATFORMS.map((platform) => platform.id));
    return children.filter((child) => known.has(child)).sort();
  }

  private *readManifest(packageDir: string): EffectGen<Record<string, unknown>, string> {
    const text = yield* pipe(
      this.getDependency(FileSystem.FileSystem).readFileString(resolve(packageDir, "package.json")),
      Effect.mapError((e) => `Cannot read ${packageDir}/package.json: ${e.message}`),
    );
    return yield* Effect.try({
      try: () => JSON.parse(text) as Record<string, unknown>,
      catch: (e) => `${packageDir}/package.json is not valid JSON: ${(e as Error).message}`,
    });
  }

  private *updateManifest(packageDir: string, fields: Record<string, unknown>): EffectGen<void, string> {
    const manifest = yield* this.readManifest(packageDir);
    yield* pipe(
      this.getDependency(FileSystem.FileSystem).writeFileString(
        resolve(packageDir, "package.json"),
        `${JSON.stringify({ ...manifest, ...fields }, null, 2)}\n`,
      ),
      Effect.mapError((e) => `Cannot write ${packageDir}/package.json: ${e.message}`),
    );
  }
}
