import { Effect } from "effect";
import { makeCicdCommand } from "../../common/command";

export const audit = makeCicdCommand(
  "audit",
  "no-op: this package has no checks to run yet",
  function* () {
    yield* Effect.log("Nothing to audit");
  },
);
