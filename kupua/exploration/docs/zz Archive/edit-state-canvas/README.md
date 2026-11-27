# Edit feedback prototypes

These five local studies informed the November 2026 edit-feedback changes. Open the HTML entries through Kupua's Vite dev server, not directly from disk. The studies use synthetic data. Panels that import production components follow the current checkout; they are not frozen captures of the old UI.

- [Field states](index.html): compare Details and Upload across save and validation states.
- [Pill fields](pills.html): inspect wrapping, pending values and selection feedback.
- [Proposed field interactions](proposed.html): exercise draft, save and dismissal scenarios.
- [Batch warning alternatives](peers.html): compare the batch control and the selected warning treatment. Recovery actions in the proposal are simulated.
- [Whole workflow](workflow.html): replay an automatic preset failure or a manual batch failure alongside the source image.

For screenshots of implemented behavior, see [the feature inventory, section 7.7](<../../00 Architecture and philosophy/00-kupua-vs-kahuna-feature-inventory.md#77-edit-feedback-tells-you-which-image-needs-attention>).