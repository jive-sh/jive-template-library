import type { EffectGen } from "effective-modules";

export interface IJsonSchema {
  /**
   * Renders the template's PackageJsonSchema as a draft-07 JSON Schema document. Consuming
   * packages point their package.json `$schema` at the rendered file to get editor validation
   * of the same shape the `cicd` commands enforce at runtime.
   */
  renderPackageJsonSchema(): EffectGen<string>;
}
