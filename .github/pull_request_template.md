## What changed

<!-- What this does, and why it is the right shape. -->

## Worth a look in review

<!-- The decisions you would defend, and anything you are unsure about. -->

---

## Checklist

Five rules, added after three separate bugs turned out to be the same mistake
in different clothes: an unreadable event chip, an unreadable panel row, and a
zero rendered in alarm-red. Tick what applies; strike through what does not.

- [ ] **Colour carries no information alone, and never lands on body text.**
      It goes on a bar, a dot, a border or a background, with the foreground
      picked to contrast against it. A tinted surface names both halves of its
      pair — `surfacePair()` measures them. A hue on text is a hue that fails
      on some theme you did not open.
- [ ] **A value is coloured by its own sign, never by which metric it is.**
      Positive success, negative danger, zero `--text-primary`. Colouring "In"
      green and "Out" red labels them twice and compares them not at all.
- [ ] **No native form control.** Everything comes from `src/components/ui/`.
      A native `<select>` renders its popup through the OS: every token set on
      an `<option>` is ignored, so it flashes white on a dark theme, and there
      is no CSS fix.
- [ ] **Any container holding text sets `min-width: 0` and an explicit
      overflow behaviour.** A grid or flex child defaults to the width of its
      longest word, which is how a fixed panel gets pushed off its own edge.
      Long text is clamped, and `overflow-wrap: anywhere` handles the pasted
      URL that has no break opportunity in it.
- [ ] **Muted text clears the contrast floor.** If it fails on any theme it is
      not muted enough to be muted — it is unreadable. Labels that carry meaning
      take `--text-secondary`, not `--text-muted`.
- [ ] **Zero and empty states get a sentence, not a grid of zeros.** Four rows
      of ₹0 look like data and are not.

### Before pushing

- [ ] `npm run build` exits **0** — check the exit code, not the test count.
      Vitest fails a run on unhandled errors while still printing every test as
      passing.
- [ ] Exactly one lockfile in the repo. Two competing lockfiles fail a Netlify
      deploy in under ten seconds, with a message that names neither.

<!--
🤖 Generated with [Claude Code](https://claude.com/claude-code)
-->
