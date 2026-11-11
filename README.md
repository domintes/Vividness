# Vividness

Vividness is a userscript that lets you adjust brightness, contrast, saturation, color temperature, sharpness, and gamma for videos and (optionally) images.

## Keyboard shortcuts

- `F8` or `Alt+/`: show or hide the controls.
- `Alt+,`: switch to the next saved profile.
- `Alt+.`: switch to the previous saved profile.
- `Shift+Alt+F8`: switch to the Default profile, or reset adjustments to their default values if that profile is unavailable.

The shortcuts are ignored while typing in editable fields. The panel's `Compatibility Mode` and `Show GUI on Fullscreen Video Mode` options can help with sites that apply their own media styles or use fullscreen video.

When the fullscreen GUI is enabled, it opens as a modal overlay so the controls can receive clicks and keyboard focus above a fullscreen video. Close it with the × button or `Esc` before using the underlying video controls.

`Work on Images` is enabled by default. Turn it off to apply Vividness to videos only.

Adjustment controls use zero-centered values from -100 to 100 (Gamma uses 0.00 to 3.00). Enable `Extend default limits` to expand the standard controls to -500 through 500 and Gamma to 0.00 through 10.00. Saved profile names in the profile list include a summary of their property values.
