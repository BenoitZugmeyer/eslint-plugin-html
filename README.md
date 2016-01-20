eslint-plugin-html
==================

[![Build Status](https://travis-ci.org/BenoitZugmeyer/eslint-plugin-html.svg?branch=master)](https://travis-ci.org/BenoitZugmeyer/eslint-plugin-html)

This [`ESLint`](http://eslint.org) plugin extracts and lints scripts from HTML files.

Supported HTML extensions: `.html`, `.xhtml`, `.htm`, `.vue`, `.hbs`, `.mustache`

Only script tags with no type attribute, with a type attribute containing a standard JavaScript MIME type such as `text/javascript` or `application/javascript`, or `text/babel` will be linted.

Usage
-----

Simply add the plugin to your ESLint configuration. See
[ESLint documentation](http://eslint.org/docs/user-guide/configuring#configuring-plugins).

Example:

```json
{
    "plugins": [
        "html"
    ]
}
```
