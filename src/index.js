import fs from "node:fs"
import path from "node:path"

import { createHtmlProcessor } from "./processor.js"

const pkg = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8")
)

export { createHtmlProcessor }

export default {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  processors: {
    html: createHtmlProcessor(),
  },
}
