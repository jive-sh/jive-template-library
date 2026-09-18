import { Effect } from "effect";
import { NPM_WEBSITE_URL } from "../../common/constants";
import { libraryModules } from "../../modules";
import { makeDeployCommand } from "../../common/command";

export const deployUrl = makeDeployCommand(
  "deploy-url",
  "print the npm page the published package will be reachable at",
  function* ({ environment, context }) {
    const { name } = yield* (yield* libraryModules.Package).load();
    yield* Effect.log(`Resolving the ${environment} URL for ${name} at ${context.sourceCommitSha}`);
    process.stdout.write(`${NPM_WEBSITE_URL}/package/${name}\n`);
  },
);
