import type { Option } from "effect";
import type { EffectGen } from "effective-modules";

export interface Remote {
  readonly owner: string;
  readonly repo: string;
  /** npm `repository.url` form, e.g. git+https://github.com/owner/repo.git */
  readonly packageJsonUrl: string;
}

export interface IGit {
  /**
   * Reads and parses remote.origin.url. Returns None when the directory is not a git repository
   * or has no origin configured; a configured but unparseable remote fails instead.
   */
  getRemoteOrigin(): EffectGen<Option.Option<Remote>, string>;
}
