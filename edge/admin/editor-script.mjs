function setupEditor() {
  for (const block of document.querySelectorAll("[data-copy-body]")) {
    const text = block.querySelector("textarea");
    block.addEventListener("click", (event) => {
      const mark = event.target.closest("[data-copy-heading]")?.dataset.copyHeading;
      if (!mark) return;
      const start = text.selectionStart, end = text.selectionEnd;
      const heading = text.value.slice(start,end).trim().replace(/\s+/g, " ") || "New Heading";
      const before = start && !text.value.slice(0,start).endsWith("\n\n") ? "\n\n" : "";
      const prefix = `${before}${mark} `;
      text.setRangeText(`${prefix}${heading}\n\n`,start,end);
      text.focus();
      text.setSelectionRange(start + prefix.length,start + prefix.length + heading.length);
    });
  }
  for (const fieldset of document.querySelectorAll("[data-related-editor]")) {
    fieldset.addEventListener("click", (event) => {
      const all = event.target.closest("[data-related-all]");
      if (!all && !event.target.closest("[data-related-clear]")) return;
      for (const choice of fieldset.querySelectorAll('input[name="related"]:not(:disabled)')) choice.checked = !!all;
    });
  }
  const gallery = document.querySelector("[data-photo-editor]");
  if (!gallery) return;
  const cards = gallery.querySelector("[data-photo-cards]");
  const status = gallery.querySelector("[data-photo-status]");
  const form = gallery.closest("form");
  const queued = new Map();
  const parts = () => [...cards.querySelectorAll("[data-photo]")];
  const field = (card, key) => card.querySelector(`[data-field="${key}"]`);
  let dragged;

  function arrange() {
    const selected = parts().filter((card) => field(card, "photo").value);
    for (const [index, card] of parts().entries()) {
      for (const input of card.querySelectorAll("[data-field]")) input.name = `${input.dataset.field}-${index + 1}`;
      const position = selected.indexOf(card);
      card.querySelector("[data-number]").textContent = position < 0 ? "Add a Photograph" : `Photograph ${position + 1}`;
      card.querySelector("[data-up]").disabled = position <= 0;
      card.querySelector("[data-down]").disabled = position < 0 || position === selected.length - 1;
      card.querySelector("[data-remove]").hidden = position < 0;
      field(card, "pair").disabled = position <= 0;
      if (position <= 0) field(card, "pair").checked = false;
    }
  }

  function preview(card, reset = false) {
    const path = field(card, "photo").value;
    const image = card.querySelector("img");
    if (!path) { image.hidden = true; image.removeAttribute("src"); return; }
    if (reset) { field(card, "width").value = ""; field(card, "height").value = ""; }
    image.hidden = false;
    const local = queued.get(path);
    image.onload = () => {
      if (!field(card, "width").value) field(card, "width").value = image.naturalWidth;
      if (!field(card, "height").value) field(card, "height").value = image.naturalHeight;
    };
    image.src = local || new URL(path, "https://ashtonmilton.net").href;
  }

  gallery.addEventListener("change", (event) => {
    const card = event.target.closest("[data-photo]");
    if (card && event.target.dataset.field === "photo") { preview(card, true); arrange(); }
  });
  gallery.addEventListener("click", (event) => {
    const card = event.target.closest("[data-photo]");
    if (!card) return;
    const selected = parts().filter((item) => field(item, "photo").value);
    const index = selected.indexOf(card);
    if (event.target.closest("[data-remove]")) {
      for (const input of card.querySelectorAll("[data-field]")) {
        if (input.type === "checkbox") input.checked = false;
        else input.value = "";
      }
      preview(card);
      cards.append(card);
      card.open = false;
      status.textContent = "Photograph removed from this essay. The uploaded file is unchanged.";
    } else if (event.target.closest("[data-up]") && index > 0) {
      selected[index - 1].before(card);
      status.textContent = `Moved to photograph ${index}.`;
    } else if (event.target.closest("[data-down]") && index >= 0 && index < selected.length - 1) {
      selected[index + 1].after(card);
      status.textContent = `Moved to photograph ${index + 2}.`;
    } else return;
    arrange();
  });
  gallery.addEventListener("dragstart", (event) => {
    if (!event.target.closest?.("[data-drag]")) return;
    dragged = event.target.closest("[data-photo]");
    event.dataTransfer.setData("text/plain", "photo");
  });
  gallery.addEventListener("dragover", (event) => { if (dragged && event.target.closest?.("[data-photo]")) event.preventDefault(); });
  gallery.addEventListener("drop", (event) => {
    const target = event.target.closest?.("[data-photo]");
    if (!target || !dragged || dragged === target) return;
    event.preventDefault();
    if (parts().indexOf(dragged) < parts().indexOf(target)) target.after(dragged);
    else target.before(dragged);
    dragged = null;
    arrange();
    status.textContent = "Photo order updated.";
  });
  gallery.addEventListener("dragend", () => { dragged = null; });
  gallery.querySelector("[data-upload-images]").addEventListener("click", async (event) => {
    const input = gallery.querySelector("[data-new-images]");
    if (!input.files.length) { status.textContent = "Choose one or more images first."; return; }
    if (!gallery.querySelector("[data-approve-images]").checked) { status.textContent = "Confirm that the selected images may go in the public repository."; return; }
    event.target.disabled = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      for (const file of input.files) {
        status.textContent = `Uploading ${file.name}…`;
        const payload = new FormData();
        payload.append("file", file);
        payload.append("confirm", "yes");
        const response = await fetch("/upload", {method: "POST", body: payload, headers: {Accept: "application/json"}});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload not confirmed.");
        queued.set(result.path, URL.createObjectURL(file));
        for (const card of parts()) field(card, "photo").add(new Option(file.name, result.path));
        const slot = parts().find((card) => !field(card, "photo").value);
        if (slot) {
          field(slot, "photo").value = result.path;
          slot.open = true;
          preview(slot, true);
        }
      }
      input.value = "";
      status.textContent = "Files uploaded. Add the captions and descriptions before publishing the essay.";
      arrange();
    } catch (error) {
      status.textContent = `${error.message} Any earlier successful uploads remain in the public files list.`;
    } finally {
      event.target.disabled = false;
      submit.disabled = false;
    }
  });

  for (const card of parts()) preview(card);
  arrange();
}

export const editorScript = `(${setupEditor.toString()})();`;
