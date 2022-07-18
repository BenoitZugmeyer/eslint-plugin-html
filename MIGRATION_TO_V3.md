# Migrating to eslint-plugin-html v3

`eslint-plugin-html` v3 introduces a new way of linting inline script tags. Previously, all HTML
parts of the file content were replaced by a `/* HTML */` comment. For example, if you had a file
like this:

```html
<!DOCTYPE html>
<html>
  <body>
    <script>
      console.log(1)
    </script>
    <script>
      console.log(2)
    </script>
  </body>
</html>
```

it was first transformed to something like that before being processed by `ESLint`:

```javascript
/* HTML */
console.log(1)
/* HTML */
console.log(2)
/* HTML */
```

This caused many issues:

- Error reported by `ESLint` outside of the JS code [were
  ignored](https://github.com/BenoitZugmeyer/eslint-plugin-html/issues/56), so rules reporting
  issues at the beginning of the file were ignored (like
  [`max-len`](http://eslint.org/docs/rules/max-len))&nbsp;;

- When run in the browser, each inline script gets its own context. Two main issues come from this:

  - If you are using `"use strict"` in an inline script, the strict mode only applies in this
    script. Since the [`strict`](http://eslint.org/docs/rules/strict) rule with the `"global"`
    option is executed only once, [it only applies on the first inline script of the
    file](https://github.com/BenoitZugmeyer/eslint-plugin-html/issues/55)&nbsp;;

  - Each [module scripts](https://html.spec.whatwg.org/#module-script) gets its own variable scope.
    So if you declare a variable directly in the body of a module, it won't be share to other
    inline script, contrary to traditional scripts who are executed in the global scope. By linting
    scripts together, the [`no-undef`](http://eslint.org/docs/rules/no-undef) rule will not warn if
    the variable is used in another script, and the
    [`no-redeclare`](http://eslint.org/docs/rules/no-redeclare) will prevent declaring the same
    variable in multiple module scripts.

- Some other unexpected behaviors occured because of those `/* HTML */` comments, like [breaking
  eslint-disable-line](https://github.com/BenoitZugmeyer/eslint-plugin-html/issues/49) in some
  condition.

So, as of v3, `eslint-plugin-html` will lint inline scripts separately, meaning each script
will be seen as a different file by `ESLint`. This implies backward incompatible changes for some
rules, example:

- [`max-len`](http://eslint.org/docs/rules/max-len) will report _scripts_ with too much lines
  instead of the HTML file being too large&nbsp;;

- [`eol-last`](http://eslint.org/docs/rules/eol-last) will report missing or unnecessary new lines
  at the end of _sripts_ instead of the HTML file (you probably don't want that!)&nbsp;;

- [`no-undef`](http://eslint.org/docs/rules/no-undef) will report undefined variables even if they
  are declared globally in another script (in this case you should use `/*global ...*/` to declare a
  variable as global).

Please report issues you have with this new behavior. If some rules are causing too much trouble, I
may add a setting to ignore messages coming from those in HTML files.

You'll find other (non-breaking) changes in the [changelog](CHANGELOG.md).
