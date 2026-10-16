// The entry point at runtime. Types come from the main module, as the export below would be a syntax
// error before TypeScript 5.6.
import plugin from "./index.ts"

export * from "./index.ts"
export default plugin
// `require()` returns the plugin instead of the module namespace
export { plugin as "module.exports" }
