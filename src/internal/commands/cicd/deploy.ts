import { libraryModules } from "../../modules";
import { makeDeployCommand } from "../../common/command";

export const deploy = makeDeployCommand(
  "deploy",
  "stamp the built packages for this environment and publish them to npm",
  function* ({ environment, context }) {
    yield* (yield* libraryModules.Deployer).deploy({
      environment,
      sourceCommitSha: context.sourceCommitSha,
    });
  },
);
