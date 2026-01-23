import fs from "node:fs"

import processor from "./processor.js"

const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")
)

export { processor }

export default {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  processors: {
    html: processor(),
  },
}
