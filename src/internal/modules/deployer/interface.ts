import type { EffectGen } from "effective-modules";

export interface DeployInput {
  /** Target the build is being released to, e.g. "latest", "preview", or "local". */
  readonly environment: string;
  /** Commit the build came from; only the preview environment puts it in the version. */
  readonly sourceCommitSha: string;
}

export interface IDeployer {
  /**
   * Stamps the built package folders with versions computed for this environment, then distributes
   * them: the local environment installs into the current workspace, every other environment packs
   * and publishes to npm.
   */
  deploy(input: DeployInput): EffectGen<void, string>;
}
