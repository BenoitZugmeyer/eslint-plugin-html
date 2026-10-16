import fs from "node:fs"

const { name, version } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")
)

export const PACKAGE_META = Object.freeze({ name, version })
