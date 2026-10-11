# Lucide icons

Full Lucide library: 2,141 icons vendored from the official `lucide-static` npm package, version 1.55.0. License and attribution are in `lucide.LICENSE`.

Use the official kebab-case icon names with the shared component:

```vue
<Icon name="arrow-up" />
<Icon name="arrow-down" />
<Icon name="air-vent" />
```

Browse icons at https://lucide.dev/icons/. `ICON_NAMES` includes the full catalog and existing app aliases. Existing app symbols are available immediately; additional geometry loads in a separate chunk on first use and only requested symbols are mounted. Generated files contain trusted official SVG geometry with presentation controlled by `IconSprite.vue`.
