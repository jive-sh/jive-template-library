import { expect, test } from "bun:test";
import { Schema } from "effect";
import { PIPELINE_CONTEXT_EXAMPLE, PipelineContextSchema } from "./pipeline-context";

test("the usage example decodes, so the documented shape cannot drift from the schema", () => {
  expect(() => Schema.decodeUnknownSync(PipelineContextSchema)(PIPELINE_CONTEXT_EXAMPLE)).not.toThrow();
});

test("a pull request carries its id and destination; other events carry neither", () => {
  const pr = Schema.decodeUnknownSync(PipelineContextSchema)({
    ...PIPELINE_CONTEXT_EXAMPLE,
    event: { type: "PULL_REQUEST", id: "42", destinationBranch: "main" },
  });
  expect(pr.event).toEqual({ type: "PULL_REQUEST", id: "42", destinationBranch: "main" });

  expect(() => Schema.decodeUnknownSync(PipelineContextSchema)({
    ...PIPELINE_CONTEXT_EXAMPLE,
    event: { type: "PULL_REQUEST", id: "42" },
  })).toThrow();
});
