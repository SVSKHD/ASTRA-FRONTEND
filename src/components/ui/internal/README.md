# ui/internal

Parts that components share, not components you use.

`ListboxPanel` is the portalled popover behind `Select`, `MultiSelect` and
`Combobox`. It is here rather than beside them because the library's own guard
test requires every `.vue` in `ui/` to appear on the `/ui` page with a demo, and
a demo of a bare panel with nothing to anchor to would be a page entry that
teaches nobody anything. The rule is worth keeping; this is not a component the
rule is about.
