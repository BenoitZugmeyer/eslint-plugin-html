eslint-plugin-html
==================

[![Build Status](https://travis-ci.org/BenoitZugmeyer/eslint-plugin-html.svg?branch=master)](https://travis-ci.org/BenoitZugmeyer/eslint-plugin-html)

This [`ESLint`](http://eslint.org) plugin extracts and lints scripts from HTML files.

Supported HTML extensions: `.html`, `.xhtml`, `.htm`, `.vue`, `.hbs`, `.mustache`, `.php`

Only script tags with no type attribute, with a type attribute containing a standard JavaScript MIME type such as `text/javascript` or `application/javascript`, or `text/babel` will be linted.

Usage
-----

Simply add the plugin to your ESLint configuration. See
[ESLint documentation](http://eslint.org/docs/user-guide/configuring#configuring-plugins).

Example:

```javascript
{
    "plugins": [
        "html"
    ]
}
```

Settings
--------

By default, the code between `<script>` tags is dedented according to the first non-empty line. The
setting `html/indent` allows to ensure every script tags follows an uniform indentation. Like the
`indent` rule, you can pass a number of spaces, or `"tab"` to indent with one tab. Prefix this value
with a `+` to be relative to the `<script>` tag indentation. Example:

```javascript
{
    "plugins": [ "html" ],
    "settings": {
      "html/indent": "0",   // code should start at the beginning of the line (no initial indentation).
      "html/indent": "+2",  // indentation is the <script> indentation plus two spaces.
      "html/indent": "tab", // indentation is one tab at the beginning of the line.
    }
}
```

By default, this plugin won't warn if it encounter a problematic indentation (ex: a line is under
indented). If you want to make sure the indentation is correct, use the `html/report-bad-indent` in
conjonction with the `indent` rule. Pass `1` to display warnings, or `2` to display errors. Example:

```javascript
{
    "plugins": [ "html" ],
    "settings": {
      "html/report-bad-indent": 2,
    }
}
```
