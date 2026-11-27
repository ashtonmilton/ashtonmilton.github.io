function setupEditor() {
  const hasPhotoPost = location.pathname === "/photos" && new URL(location.href).searchParams.has("post");
  const section = hasPhotoPost ? "/edit" : location.pathname === "/upload" ? "/media" : location.pathname;
  for (const link of document.querySelectorAll(".admin-nav a")) {
    if (link.getAttribute("href") === section) link.setAttribute("aria-current","page");
  }
  const draftPrefix = "ashton-admin-draft:";
  for (const form of document.querySelectorAll("form[data-draft]")) {
    const tools = form.querySelector("[data-draft-tools]");
    if (!tools) continue;
    const key = draftPrefix + location.pathname + ":" + form.dataset.draft;
    const version = form.querySelector('[name="previous"]')?.value || "";
    const receipt = new URL(location.href).searchParams.get("commit") || "";
    const status = tools.querySelector("[role=status]");
    const discard = tools.querySelector("[data-draft-discard]");
    const restore = tools.querySelector("[data-draft-restore]");
    const fields = () => [...form.elements].filter((field) => field.name && !field.disabled &&
      field.name !== "confirm" && !["file","hidden","submit","button"].includes(field.type));
    let draft;
    function update() {
      discard.hidden = !draft;
      restore.hidden = !draft || draft.version !== version;
      if (draft && draft.version !== version) status.textContent = "A draft belongs to an older version of this item. It cannot replace newer changes.";
    }
    function save() {
      const next = {version, receipt, fields: fields().map((field) => field.type === "checkbox" ? [field.name,field.value,field.checked] : [field.name,field.value])};
      try {
        sessionStorage.setItem(key,JSON.stringify(next));
        draft = next;
        update();
        status.textContent = "Draft saved in this tab. Files are not saved with drafts.";
      } catch { status.textContent = "The browser could not save a draft."; }
    }
    try {
      draft = JSON.parse(sessionStorage.getItem(key));
      if (draft && /^[a-f0-9]{40}$/.test(receipt) && draft.receipt !== receipt) {
        sessionStorage.removeItem(key);
        draft = null;
      }
      if (draft && !Array.isArray(draft.fields)) draft = null;
      tools.hidden = false;
      update();
    } catch { continue; }
    tools.querySelector("[data-draft-save]").addEventListener("click",save);
    form.addEventListener("submit",save);
    discard.addEventListener("click",() => {
      sessionStorage.removeItem(key);
      draft = null;
      update();
      status.textContent = "Saved draft discarded.";
    });
    restore.addEventListener("click",() => {
      if (!draft || draft.version !== version) return;
      const saved = new Map(draft.fields.map(([name,value,checked]) => [checked === undefined ? name : name + "\n" + value, {value,checked}]));
      for (const field of fields()) {
        const entry = saved.get(field.type === "checkbox" ? field.name + "\n" + field.value : field.name);
        if (!entry) continue;
        if (field.type === "checkbox") field.checked = entry.checked;
        else if (!field.options || [...field.options].some((item) => item.value === entry.value)) field.value = entry.value;
      }
      status.textContent = "Draft restored. No changes have been published.";
    });
  }
  document.querySelector('form[action="/logout"]')?.addEventListener("submit", () => {
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(draftPrefix)) sessionStorage.removeItem(key); } catch {}
  });
  for (const library of document.querySelectorAll("[data-work-library]")) {
    const input = library.querySelector("[data-find-work]");
    const status = library.querySelector("[data-work-status]");
    const entries = [...library.querySelectorAll("[data-entry-status]")];
    const report = library.querySelector("[role=status]");
    const normalise = (value) => value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("en-GB").replace(/[^\p{L}\p{N}]+/gu," ").trim();
    const title = new Map(entries.map((entry) => [entry,normalise(entry.querySelector("a").textContent)]));
    function filter() {
      const words = normalise(input.value).split(" ").filter(Boolean);
      for (const entry of entries) entry.hidden = !!status?.value && entry.dataset.entryStatus !== status.value || !words.every((word) => title.get(entry).includes(word));
      const visible = entries.filter((entry) => !entry.hidden).length;
      report.textContent = `${visible} of ${entries.length} pieces`;
    }
    library.querySelector(".list-tools").hidden = false;
    input.addEventListener("input",filter);
    status?.addEventListener("change",filter);
    filter();
  }
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
