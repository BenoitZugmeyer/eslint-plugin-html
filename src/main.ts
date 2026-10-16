// The entry point at runtime. Types come from `index.ts`, as the export below is a syntax error
// before TypeScript 5.6
import plugin from "./index.ts"

export * from "./index.ts"
export default plugin
// `require()` returns the plugin instead of the module namespace
export { plugin as "module.exports" }
