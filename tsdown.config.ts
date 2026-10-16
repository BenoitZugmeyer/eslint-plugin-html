import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    // The runtime entry point, see its comment
    main: "src/main.ts",
  },
  // The package is an ES module, so `.js` files are ES modules too
  fixedExtension: false,
  // Stable names for the code shared by both entries, which can't clash with the entries
  hash: false,
  outputOptions: { chunkFileNames: "shared/[name].js" },
})
