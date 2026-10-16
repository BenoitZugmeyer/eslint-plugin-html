import packageJson from "../package.json" with { type: "json" }

export const PACKAGE_META = Object.freeze({
  name: packageJson.name,
  version: packageJson.version,
})
