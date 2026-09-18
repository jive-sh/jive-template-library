import { expect, test } from "bun:test";
import { baseDistTag, baseVersion, baseVersionOf, platformDistTag, platformVersion } from "./versions";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

test("the base version is recovered from what the build stamped", () => {
  expect(baseVersionOf("0.1.0-local")).toBe("0.1.0");
  expect(baseVersionOf("0.1.0")).toBeUndefined();
});

test("latest drops the prerelease on the base package only", () => {
  expect(baseVersion("0.1.0", "latest", SHA)).toBe("0.1.0");
  expect(platformVersion("0.1.0", "latest", SHA, "darwin-x64")).toBe("0.1.0-latest-darwin-x64");
  expect(baseDistTag("latest", SHA)).toBe("latest");
  expect(platformDistTag("latest", SHA, "darwin-x64")).toBe("latest-darwin-x64");
});

test("preview pins the version to the first 8 characters of the commit", () => {
  expect(baseVersion("0.1.0", "Preview", SHA)).toBe("0.1.0-preview-a1b2c3d4");
  expect(platformVersion("0.1.0", "Preview", SHA, "linux-x64")).toBe("0.1.0-preview-a1b2c3d4-linux-x64");
  expect(baseDistTag("Preview", SHA)).toBe("preview-a1b2c3d4");
});

test("local and any other environment use the environment name verbatim", () => {
  expect(baseVersion("0.1.0", "local", SHA)).toBe("0.1.0-local");
  expect(platformVersion("0.1.0", "local", SHA, "darwin-arm64")).toBe("0.1.0-local-darwin-arm64");
  expect(baseVersion("0.1.0", "beta", SHA)).toBe("0.1.0-beta");
  expect(platformDistTag("beta", SHA, "windows-x64")).toBe("beta-windows-x64");
});
