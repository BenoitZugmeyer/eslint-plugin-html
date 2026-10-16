<div align="center">
    <img src="media/logo.svg" width="150" height="150">
    <h1>eslint-plugin-html</h1>
    <a href="https://www.npmjs.com/package/eslint-plugin-html"><img alt="NPM version" src="https://img.shields.io/npm/v/eslint-plugin-html"></a>
    <a href="https://github.com/BenoitZugmeyer/eslint-plugin-html/actions/workflows/tests.yml"><img alt="Tests Status" src="https://img.shields.io/github/actions/workflow/status/BenoitZugmeyer/eslint-plugin-html/tests.yml"></a>
    <p>A <a href="http://eslint.org">ESLint</a> plugin to lint and fix inline scripts contained in HTML files.</p>
</div>

- [Usage](#usage)
- [Processor options](#processor-options)
  - [`rules`](#rules)
  - [`indent`](#indent)
  - [`reportBadIndent`](#reportbadindent)
  - [`xml`](#xml)
  - [`lintMarkup`](#lintmarkup)
- [Disabling ESLint](#disabling-eslint)
- [Linting HTML](#linting-html)
- [Multiple scripts tags in a HTML file](#multiple-scripts-tags-in-a-html-file)
  - [History](#history)
- [XML support](#xml-support)
- [Troubleshooting](#troubleshooting)
  - [My rules don't apply to module scripts](#my-rules-dont-apply-to-module-scripts)
  - [Type-aware linting fails on scripts](#type-aware-linting-fails-on-scripts)
  - [Scripts are not linted with the `Linter` API](#scripts-are-not-linted-with-the-linter-api)
  - [Prettier doesn't format scripts](#prettier-doesnt-format-scripts)
  - [Linting templates (or PHP)](#linting-templates-or-php)
  - [Linting VUE files](#linting-vue-files)
- [Migration from older versions](#migration-from-older-versions)
  - [To v9](#to-v9)
  - [To v4](#to-v4)
  - [To v3](#to-v3)
- [Credits](#credits)

## Usage

Install it with `npm install --save-dev eslint-plugin-html` and add the recommended configuration to
your ESLint configuration:

```javascript
import { defineConfig } from "eslint/config"
import html from "eslint-plugin-html"

export default defineConfig([
  html.configs.recommended,
  // Your other configurations
])
```

The plugin is a [processor](https://eslint.org/docs/latest/use/configure/plugins#specify-a-processor):
it extracts each script of an HTML file as a virtual JavaScript file, named after the HTML file.
For example, the scripts of `index.html` are linted as `index.html/0_part-0.js`,
`index.html/1_part-1.mjs`, and so on. Classic scripts get a `.js` name, and module scripts
(`<script type="module">`) get a `.mjs` name.

ESLint lints those files with the configurations matching their names, so your configurations for
`**/*.js` and `**/*.mjs` files also apply to the scripts. To configure the scripts of HTML files
only, use `**/*.html/*.js` and `**/*.html/*.mjs`:

```javascript
import globals from "globals"

export default defineConfig([
  html.configs.recommended,
  {
    files: ["**/*.html/*.js", "**/*.html/*.mjs"],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
```

The recommended configuration:

- applies the `html/html` processor to `*.html` and `*.htm` files, and the `html/xml` processor to
  `*.xhtml` files ;
- sets the plugin's parser and enables the `html/scope-sharing` rule for their scripts, to
  [share global variables between scripts](#multiple-scripts-tags-in-a-html-file) ;
- sets `sourceType` to `"script"` for classic scripts. Module scripts keep ESLint's default, `"module"`.

To lint files with other extensions, add your own configurations:

```javascript
import html, { parser } from "eslint-plugin-html"

export default defineConfig([
  html.configs.recommended,
  {
    files: ["**/*.php"],
    plugins: { html },
    processor: "html/html",
  },
  {
    files: ["**/*.php/*.js", "**/*.php/*.mjs"],
    plugins: { html },
    languageOptions: { parser },
    rules: { "html/scope-sharing": "error" },
  },
  {
    files: ["**/*.php/*.js"],
    languageOptions: { sourceType: "script" },
  },
])
```

## Processor options

To change how scripts are extracted, create a processor with the `processor` function:

```javascript
import html, { processor } from "eslint-plugin-html"

export default defineConfig([
  html.configs.recommended,
  {
    files: ["**/*.html"],
    processor: processor({ indent: "+2", reportBadIndent: "error" }),
  },
])
```

### `rules`

Which tags contain scripts, and which of them are module scripts. Each rule has a `match` CSS
selector and a `module` flag (`false` by default). The first matching rule wins. Supported
selectors: tag names, `*`, `#id`, `.class`, attributes (with the `i` and `s` flags) and `:not()`.

By default, the content of `<script>` tags without a `src` attribute is linted if they don't have a
`type` attribute, or if it's empty, `module` or matches
`(application|text)/(x-)?(javascript|babel|ecmascript-6)` (case-insensitive). The `rules` option
replaces the default rules, so the examples below restate the ones they keep (with only the
`text/javascript` type, for brevity):

```javascript
// Also lint <customscript> tags as classic scripts
processor({
  rules: [
    { match: 'script[type="module" i]:not([src])', module: true },
    { match: 'script[type="text/javascript" i]:not([src])' },
    { match: "script:not([type]):not([src]), customscript" },
  ],
})

// Skip scripts without a type, like `html/ignore-tags-without-type` in v8
processor({
  rules: [
    { match: 'script[type="module" i]:not([src])', module: true },
    { match: 'script[type="text/javascript" i]:not([src])' },
  ],
})

// Treat scripts without a type as modules too: they don't share global variables anymore
processor({
  rules: [
    { match: 'script[type="module" i]:not([src])', module: true },
    { match: "script:not([type]):not([src])", module: true },
  ],
})
```

### `indent`

By default, the code between `<script>` tags is dedented according to the first non-empty line. The
`indent` option allows to ensure that every script tag follows a uniform indentation. Like the
`indent` rule, you can pass a number of spaces, or `"tab"` to indent with one tab. Prefix this value
with a `+` to be relative to the `<script>` tag indentation. Examples:

```javascript
processor({ indent: 0 }) // code should start at the beginning of the line (no initial indentation).
processor({ indent: "+2" }) // indentation is the <script> indentation plus two spaces.
processor({ indent: "tab" }) // indentation is one tab at the beginning of the line.
```

### `reportBadIndent`

By default, this plugin won't warn if it encounters a problematic indentation (ex: a line is under
indented). If you want to make sure the indentation is correct, use `reportBadIndent` in conjunction
with the `indent` rule. Pass `"warn"` (or `1`) to display warnings, `"error"` (or `2`, `true`) to
display errors.

### `xml`

Parse files as XML. See [XML support](#xml-support). The `html/xml` processor uses this option.

### `lintMarkup`

Also lint the whole file with its own configuration, without this processor. Use it with an HTML
parser or language. See [Linting HTML](#linting-html).

## Disabling ESLint

To temporarily disable ESLint, use the `<!-- eslint-disable -->` HTML comment. Re-enable it with
`<!-- eslint-enable -->`. Example:

```html
<!-- eslint-disable -->
<script>
  var foo = 1
</script>
<!-- eslint-enable -->
```

To disable ESLint for the next script tag only, use the `<!-- eslint-disable-next-script -->` HTML
comment. Example:

```html
<!-- eslint-disable-next-script -->
<script>
  var foo = 1
</script>
```

Disabled script tags are completely ignored: their content will not be parsed as JavaScript. You can
use this to disable script tags containing template syntax.

## Linting HTML

This plugin focuses on applying ESLint rules on inline scripts contained in HTML. It does not
provide any rule related to HTML. For that, you can use other plugins like
[@html-eslint](https://html-eslint.org) or
[@angular-eslint](https://github.com/angular-eslint/angular-eslint).

To lint both the HTML and its scripts, set the `lintMarkup` option: the processor then also returns
the whole file, which ESLint lints with the configuration of the HTML file, `language` and parser
included. For example, with html-eslint:

```javascript
import { defineConfig } from "eslint/config"
import htmlEslint from "@html-eslint/eslint-plugin"
import html, { processor } from "eslint-plugin-html"

export default defineConfig([
  html.configs.recommended,
  {
    files: ["**/*.html"],
    plugins: { "@html-eslint": htmlEslint },
    language: "@html-eslint/html",
    processor: processor({ lintMarkup: true }),
    rules: {
      "@html-eslint/require-img-alt": "error",
    },
  },
])
```

Both plugins use `html` as their default name, so register html-eslint under another name, like
`@html-eslint` (its `flat/recommended` configuration does this).

ESLint also reads the [HTML comments of this plugin](#disabling-eslint) as its own directives when
it lints the HTML. The plugin hides what ESLint reports about them, so they are never reported as
unused or removed by `--fix`.

## Multiple scripts tags in a HTML file

When linting a HTML with multiple script tags, this plugin emulates the browser behavior:

- classic scripts share the global scope: a script can use the global variables declared by the
  previous classic scripts ;
- module scripts (`<script type="module">`) can use the global variables declared by the previous
  classic scripts, but their own declarations stay in their module scope.

To illustrate this behavior, consider this HTML extract:

```html
<script>
  var foo = 1
</script>

<script>
  alert(foo)
</script>
```

This is perfectly valid, and the ESLint rules `no-unused-vars` and `no-undef` shouldn't complain.
But if those scripts were modules, `no-unused-vars` should report an error in the first script, and
`no-undef` should report an error in the second script.

This needs two parts, both enabled by the recommended configuration:

- the plugin's `parser`, which declares the global variables of the previous classic scripts. It
  wraps the parser set in `parserOptions.parser`, or espree by default:

  ```javascript
  {
    files: ["**/*.html/*.js", "**/*.html/*.mjs"],
    languageOptions: {
      parserOptions: { parser: babelParser },
    },
  }
  ```

- the `html/scope-sharing` rule, which marks the global variables used by the next scripts as used.
  It only reports when the plugin's parser is not used.

Configurations that set a parser for all files, like typescript-eslint's, replace the plugin's
parser if they come after the recommended configuration. Put them before it, or set their parser in
`parserOptions.parser`.

Which scripts are modules is decided by the [`rules`](#rules) option, not by the `sourceType`
language option.

### History

In `eslint-plugin-html` v1 and v2, script code were concatenated and linted in a single pass, so
the scope were always shared. This caused [some issues](MIGRATION_TO_V3.md), so in v3 all scripts
were linted separately, and scopes were never shared. In v4, the plugin still lint scripts
separately, but makes sure global variables are declared and used correctly in the non-module case.
In v9, the plugin became a processor, and module scripts are detected for each tag.

## XML support

This plugin parses HTML and XML markup slightly differently, mainly when considering `CDATA`
sections:

- in XML, any data inside a `CDATA` section will be considered as raw text (not XML) and the `CDATA`
  delimiter will be dropped ;
- in HTML, there is no such thing for `<script>` tags: the `CDATA` delimiter is considered as normal
  text and thus, part of the script.

Use the `html/xml` processor (or the `xml` option) for XML files. The recommended configuration
uses it for `*.xhtml` files.

## Troubleshooting

### My rules don't apply to module scripts

Module scripts are linted as `.mjs` files. Make sure that your configurations match
`**/*.mjs` files too, for example with `files: ["**/*.js", "**/*.mjs"]`.

### Type-aware linting fails on scripts

Scripts are virtual files, so they are not part of any TypeScript project. Disable type-aware
linting for them, for example with typescript-eslint:

```javascript
export default defineConfig([
  tseslint.configs.recommendedTypeChecked,
  // After typescript-eslint's configurations, so that its parser doesn't replace the plugin's one
  html.configs.recommended,
  {
    files: ["**/*.html/*.js", "**/*.html/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
```

### Scripts are not linted with the `Linter` API

`Linter#verify()` only lints `.js` code blocks by default, so it skips module scripts (`.mjs`) and
the markup (with `lintMarkup`). Pass a `filterCodeBlock` option that accepts them. The `ESLint`
class and the CLI don't have this limitation.

### Prettier doesn't format scripts

`eslint-plugin-prettier` skips the scripts extracted from HTML files, because Prettier can format the
whole HTML file, scripts included. Run Prettier on your HTML files directly.

### Linting templates (or PHP)

`eslint-plugin-html` won't evaluate or remove your template markup. If you have template markup in
your script tags, the resulting script may not be valid JavaScript, so `ESLint` will fail to parse
it. Here are some workarounds:

- You can use [HTML comments to disable ESLint](#disabling-eslint) for specific script tags.

- For PHP, you can use
  [`eslint-plugin-php-markup`](https://github.com/tengattack/eslint-plugin-php-markup) to lint php
  files, it use a same way to process php markup like `eslint-plugin-html`.

- Another possible hacky workaround to make sure the code is valid JavaScript is to put your
  template markup inside a comment. When the template is rendered, the generated JS code must start
  with a new line, so it will be written below the comment. PHP example:

```html
<script>
  var mydata
  // <?= "\n mydata = " . json_encode($var) . ";" ?>
  console.log(mydata)
</script>
```

### Linting VUE files

Initially, [`eslint-plugin-vue`](https://github.com/vuejs/eslint-plugin-vue) was using
`eslint-plugin-html` to lint code inside script tags. Since v3, `eslint-plugin-vue` is using its
own parser, so it is _incompatible_ with `eslint-plugin-html`. You should use `eslint-plugin-vue`
exclusively and remove `eslint-plugin-html` from your dependencies if you still have it.

## Migration from older versions

### To v9

`eslint-plugin-html` v9 is a processor: it doesn't change ESLint internals anymore. It requires
ESLint 9 or newer and Node.js 20.19 or newer. It's an ES module, but `require("eslint-plugin-html")`
still returns the plugin, with `processor` and `parser` as properties.

- Start from the [recommended configuration](#usage). Adding the plugin to `plugins` is not enough
  anymore.
- Rules set in a configuration for `**/*.html` files don't apply to scripts anymore. Use
  `**/*.html/*.js` and `**/*.html/*.mjs` (or `**/*.js` and `**/*.mjs`) instead.
- Settings are replaced by [processor options](#processor-options):

  | v8 setting                      | v9                                                         |
  | ------------------------------- | ---------------------------------------------------------- |
  | `html/html-extensions`          | `files` of a configuration using the `html/html` processor |
  | `html/xml-extensions`           | `files` of a configuration using the `html/xml` processor  |
  | `html/indent`                   | `indent` option                                            |
  | `html/report-bad-indent`        | `reportBadIndent` option (`true` now means `"error"`)      |
  | `html/javascript-tag-names`     | `rules` option                                             |
  | `html/javascript-mime-types`    | `rules` option                                             |
  | `html/ignore-tags-without-type` | `rules` option                                             |

- `sourceType: "module"` doesn't stop scripts from sharing global variables anymore: use the
  [`rules`](#rules) option to treat scripts as modules.
- Scripts with an empty `src` attribute aren't linted anymore, as browsers don't run them either.
- To lint HTML with html-eslint, use the [`lintMarkup`](#lintmarkup) option.

### To v4

`eslint-plugin-html` v4 requires at least ESLint v4.7. This is because a lot of internal changes
occurred in ESLint v4.7, including a [new API to support autofixing in
preprocessors](https://eslint.org/docs/developer-guide/working-with-plugins#processors-in-plugins).
If you are still using an older version of ESLint, please consider upgrading, or keep using
`eslint-plugin-html` v3.

The big feature (and breaking change) in `eslint-plugin-html` v4 is the ability to choose how [scopes
are shared between script tags in the same HTML file](#multiple-scripts-tags-in-a-html-file).

### To v3

If you are considering upgrading to v3, please read [this guide](MIGRATION_TO_V3.md).

## Credits

A big thank you to [@kuceb](https://github.com/kuceb) for the logo image!
