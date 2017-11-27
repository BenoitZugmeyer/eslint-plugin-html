eslint-plugin-html
==================

[![NPM version](https://img.shields.io/npm/v/eslint-plugin-html.svg)](https://www.npmjs.com/package/eslint-plugin-html)
[![Build Status](https://travis-ci.org/BenoitZugmeyer/eslint-plugin-html.svg?branch=master)](https://travis-ci.org/BenoitZugmeyer/eslint-plugin-html)


This [`ESLint`](http://eslint.org) plugin allows linting and fixing inline scripts contained in HTML
files.

Migration to v4
---------------

`eslint-plugin-html` v4 requires at least ESLint v4.7.  This is because a lot of internal changes
occured in ESLint v4.7, including a [new API to support autofixing in
preprocessors](https://eslint.org/docs/developer-guide/working-with-plugins#processors-in-plugins).
If you are still using an older version of ESLint, please consider upgrading, or keep using
`eslint-plugin-html` v3.

The big feature (and breaking change) in `eslint-plugin-html` v4 is the ability to chose how [scopes
are shared between script tags in the same HTML file](#multiple-scripts-tags-in-a-html-file).


Migration to v3
---------------

If you are considering upgrading to v3, please read [this guide](MIGRATION_TO_V3.md).

Usage
-----

Simply install via `npm install --save-dev eslint-plugin-isml` and add the plugin to your ESLint
configuration. See
[ESLint documentation](http://eslint.org/docs/user-guide/configuring#configuring-plugins).

Example:

```javascript
{
    "plugins": [
        "isml"
    ]
}
```

Note: by default, when executing the `eslint` command on a directory, only `.js` files will be
linted. You will have to specify extra extensions with the `--ext` option. Example: `eslint --ext
.html,.js src` will lint both `.html` and `.js` files in the `src` directory. See [ESLint
documentation](http://eslint.org/docs/user-guide/command-line-interface#ext).

Multiple scripts tags in a HTML file
------------------------------------

When linting a HTML with multiple script tags, this plugin tries to emulate the browser behavior by
sharing the global scope between scripts by default.  This behavior doesn't apply to "module"
scripts (ie: `<script type="module">` and most transpiled code), where [each script tag gets its own
top-level scope](http://exploringjs.com/es6/ch_modules.html#_modules).

ESLint has already [an
option](https://eslint.org/docs/user-guide/configuring#specifying-parser-options) to tell the parser
if the script are modules.  `eslint-plugin-html` will use this option as well to know if the scopes
should be shared (the default) or not.  To change this, just set it in your ESLint configuration:

```
{
  "parserOptions": {
    "sourceType": "module"
  }
}
```

To illustrate this behavior, consider this HTML extract:

```html
<isscript>
var foo = 1;
</isscript>

<script>
alert(foo);
</script>
```

This is perfectly valid by default, and the ESLint rules `no-unused-vars` and `no-undef` shouldn't
complain.  But if those scripts are considerated as ES modules, `no-unused-vars` should report an
error in the first script, and `no-undef` should report an error in the second script.

### History

In `eslint-plugin-isml` v1 and v2, script code were concatenated and linted in a single pass, so
the scope were always shared.  This caused [some issues](MIGRATION_TO_V3.md), so in v3 all scripts
were linted separately, and scopes were never shared.  In v4, the plugin still lint scripts
separately, but makes sure global variables are declared and used correctly in the non-module case.


XML support
-----------

This plugin parses HTML and XML markup slightly differently, mainly when considering `CDATA`
sections:
* in XML, any data inside a `CDATA` section will be considered as raw text (not XML) and the `CDATA`
  delimiter will be droped ;
* in HTML, there is no such thing for `<script>` tags: the `CDATA` delimiter is considered as normal
  text and thus, part of the script.


Settings
--------

> Note: all settings can be written either as `"html/key": value` or in a nested object `"html": {
> "key": value }`

### `siml/html-extensions`

By default, this plugin will only consider files ending with those extensions as HTML: `.erb`,
`.handlebars`, `.hbs`, `.htm`, `.html`, `.mustache`, `.nunjucks`, `.php`, `.tag`, `.twig`, `.vue`,
`.we`. You can set your own list of HTML extensions by using this setting. Example:

```javascript
{
    "plugins": [ "isml" ],
    "settings": {
        "isml/html-extensions": [".html", ".isml"],  // consider .html and .we files as HTML
    }
}
```


### `isml/xml-extensions`

By default, this plugin will only consider files ending with those extensions as XML: `.xhtml`,
`.xml`. You can set your own list of XML extensions by using this setting. Example:

```javascript
{
    "plugins": [ "html" ],
    "settings": {
        "html/xml-extensions": [".isml"],  // consider .html files as XML
    }
}
```


### `isml/indent`

By default, the code between `<script>` tags is dedented according to the first non-empty line. The
setting `html/indent` allows to ensure that every script tags follow an uniform indentation. Like
the `indent` rule, you can pass a number of spaces, or `"tab"` to indent with one tab. Prefix this
value with a `+` to be relative to the `<script>` tag indentation. Example:

```javascript
{
    "plugins": [ "html" ],
    "settings": {
        "html/indent": "0",   // code should start at the beginning of the line (no initial indentation).
        "html/indent": "+2",  // indentation is the <script> indentation plus two spaces.
        "html/indent": "+tab",// indentation is the <script> indentation plus one tab.
        "html/indent": "tab", // indentation is one tab at the beginning of the line.
    }
}
```


### `isml/report-bad-indent`

By default, this plugin won't warn if it encounters a problematic indentation (ex: a line is under
indented). If you want to make sure the indentation is correct, use the `html/report-bad-indent` in
conjunction with the `indent` rule. Pass `"warn"` or `1` to display warnings, `"error"` or `2` to
display errors. Example:

```javascript
{
    "plugins": [ "html" ],
    "settings": {
        "html/report-bad-indent": "error",
    }
}
```


### `isml/javascript-mime-types`

By default, the code between `<script>` tags is considered as JavaScript code only if there is no
`type` attribute or if its value matches the pattern
`(application|text)/(x-)?(javascript|babel|ecmascript-6)` or `module` (case insensitive). You can
customize the types that should be considered as JavaScript by providing one or multiple MIME types.
If a MIME type starts with a `/`, it will be considered as a regular expression. Example:

```javascript
{
    "plugins": [ "isml" ],
    "settings": {
        "isml/javascript-mime-types": ["text/javascript", "text/jsx"],  // also use script tags with a "text/jsx" type attribute
        "isml/javascript-mime-types": "/^text\\/(javascript|jsx)$/",    // same thing
    }
}
```

Troubleshooting
---------------

### Linting templates (or PHP)

`eslint-plugin-html` won't evaluate or remove your template markup.  If you have template markup in
your script tags, the resulting script may not be valid JavaScript, so `ESLint` will fail to parse
it.

One possible hacky workaround to make sure the code is valid JavaScript is to put your template
markup inside a comment.  When the template is rendered, the generated JS code must start with a new
line, so it will be written below the comment.  PHP example:

```html
<script>
var mydata;
// <?= "\n mydata = " . json_encode($var) . ";" ?>
console.log(mydata);
</script>
```


### Linting VUE files

Initially, [`eslint-plugin-vue`](https://github.com/vuejs/eslint-plugin-vue) was using
`eslint-plugin-html` to lint code inside script tags.  Since v3, `eslint-plugin-vue` is using its
own parser, so it is *incompatible* with `eslint-plugin-html`.  You should remove
`eslint-plugin-html` from your dependencies if you still have this.
