// Reading an application form: every question on the page, what kind of field it is, its
// label, whether it's required, and what it holds now. Runs inside the page (as plain JavaScript
// text, so nothing the TypeScript compiler adds can break it there).
//
// Each field gets a data-jh="f<n>" mark so the filler can find it again. Groups of radio buttons
// or checkboxes, and Ashby's Yes/No buttons, are one field; their choices get data-jh-opt="<i>".

import type { FieldKind } from "../src/shared/autofill";

export interface FormField {
  id: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  /** What it holds now: text, the chosen option(s), "checked" for a ticked box. */
  value: string;
  options?: string[];
  /** For file fields: the text around it ("Resume/CV", "Cover letter", "Autofill from resume"). */
  context?: string;
  /** Ashby's Yes/No buttons, chosen by clicking a button rather than an input. */
  buttons?: boolean;
}

export const SCAN_JS = String.raw`(() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").replace(/[\s*✱]+$/, "").trim();
  const txt = (el) => (el ? clean(el.innerText || el.textContent || "") : "");
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none";
  };
  const starred = (el) => !!el && /[*✱]/.test(el.textContent || "");
  const BOX = ".field-wrapper, .eeoc__question__wrapper, .application-question, [data-field-path], fieldset, .form-group, .form-field, .question";
  const boxOf = (el) => el.closest(BOX) || (el.parentElement && el.parentElement.parentElement) || el.parentElement;
  let next = Number(document.body.dataset.jhNext || 0);
  const tag = (el) => {
    if (!el.dataset.jh) el.dataset.jh = "f" + next++;
    document.body.dataset.jhNext = String(next);
    return el.dataset.jh;
  };
  const forLabel = (el) => (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
  const byIds = (ids) =>
    (ids || "")
      .split(/\s+/)
      .map((i) => i && document.getElementById(i))
      .filter(Boolean)
      .map(txt)
      .join(" ");
  // The question a box asks: its legend or heading, else its first label that isn't one of the choices.
  const titleOf = (box, skip) => {
    if (!box) return { text: "", el: null };
    for (const c of box.querySelectorAll("legend, .application-label, label, .label, h3, h4")) {
      if (skip && skip.has(c)) continue;
      const t = txt(c);
      if (t) return { text: t, el: c };
    }
    return { text: "", el: null };
  };
  // A text field's label: <label for>, aria-labelledby, the label it sits in (Lever), or its box's title.
  const labelOf = (el) => {
    const own = forLabel(el);
    if (own && txt(own) && !/^attach$/i.test(txt(own))) return { text: txt(own), el: own };
    const by = byIds(el.getAttribute("aria-labelledby"));
    if (by) return { text: by, el: null };
    const wrap = el.closest("label");
    if (wrap) {
      const inner = wrap.querySelector(".application-label");
      if (inner && txt(inner)) return { text: txt(inner), el: inner };
    }
    const t = titleOf(boxOf(el));
    if (t.text) return t;
    return { text: clean(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || ""), el: null };
  };
  const inMenu = (el) => !!el.closest('[role=listbox], [role=menu], .iti__dropdown-content, .select__menu');

  const out = [];
  const doneGroups = new Set();
  for (const el of document.querySelectorAll("input, textarea, select, button[data-option]")) {
    if (inMenu(el)) continue;
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();

    // Ashby's Yes/No: two buttons (and a hidden checkbox) in one question box.
    if (el.tagName === "BUTTON") {
      const box = boxOf(el);
      if (!box || doneGroups.has(box)) continue;
      doneGroups.add(box);
      const btns = [...box.querySelectorAll("button[data-option]")].filter(vis);
      if (!btns.length) continue;
      const id = tag(box);
      btns.forEach((b, i) => (b.dataset.jhOpt = String(i)));
      const t = titleOf(box);
      const picked = btns.find((b) => b.getAttribute("aria-pressed") === "true");
      out.push({ id, kind: "radio", label: t.text, required: starred(t.el), value: picked ? txt(picked) : "", options: btns.map(txt), buttons: true });
      continue;
    }

    if (["hidden", "submit", "button", "image", "reset", "password"].includes(type)) continue;
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (el.closest("[data-field-path]") && el.closest("[data-field-path]").querySelector("button[data-option]")) continue; // the Yes/No's own checkbox

    if (type === "file") {
      const box = boxOf(el);
      out.push({
        id: tag(el),
        kind: "file",
        label: labelOf(el).text,
        required: el.required || el.getAttribute("aria-required") === "true" || starred(titleOf(box).el),
        value: "",
        context: clean((box ? box.innerText : "") || "").slice(0, 200),
      });
      continue;
    }
    if (el.getAttribute("tabindex") === "-1" && type !== "radio" && type !== "checkbox") continue; // helper inputs behind custom widgets

    if (type === "radio" || type === "checkbox") {
      const box = boxOf(el);
      const key = el.name ? "name:" + el.name : box;
      if (doneGroups.has(key)) continue;
      doneGroups.add(key);
      const opts = (el.name ? [...document.querySelectorAll('input[name="' + CSS.escape(el.name) + '"]')] : [...box.querySelectorAll('input[type="' + type + '"]')])
        .filter((o) => vis(o) || vis(forLabel(o)) || vis(o.closest("label")));
      if (!opts.length) continue;
      const optLabel = (o) => forLabel(o) || o.closest("label");
      const skip = new Set(opts.map(optLabel).filter(Boolean));
      const id = tag(opts[0]);
      opts.forEach((o, i) => {
        o.dataset.jhGroup = id;
        o.dataset.jhOpt = String(i);
      });
      const names = opts.map((o) => txt(optLabel(o)) || o.value);
      const t = titleOf(box, skip);
      const required = opts.some((o) => o.required || o.getAttribute("aria-required") === "true") || starred(t.el);
      if (type === "checkbox" && opts.length === 1) {
        // A single box to tick: its own text is the question ("I agree to…", "Yes, contact me").
        out.push({ id, kind: "checkbox", label: names[0] || t.text, required, value: opts[0].checked ? "checked" : "" });
      } else {
        out.push({
          id,
          kind: type,
          label: t.text || names.join(" / "),
          required,
          value: opts.filter((o) => o.checked).map((o) => names[opts.indexOf(o)]).join(", "),
          options: names,
        });
      }
      continue;
    }

    if (!vis(el)) continue;
    const l = labelOf(el);
    const box = boxOf(el);
    const required = el.required || el.getAttribute("aria-required") === "true" || starred(l.el) || (!l.el && starred(titleOf(box).el));
    if (el.tagName === "SELECT") {
      const options = [...el.options].filter((o) => o.value !== "" && txt(o)).map(txt);
      const chosen = el.selectedOptions[0];
      out.push({ id: tag(el), kind: "select", label: l.text, required, value: chosen && chosen.value !== "" ? txt(chosen) : "", options });
      continue;
    }
    if (el.getAttribute("role") === "combobox") {
      // A custom dropdown: what's chosen shows next to it (react-select), or in the input itself.
      const shell = el.closest(".select-shell, .select__control, [data-field-path], .field-wrapper") || box;
      const shown = shell && shell.querySelector(".select__single-value, [class*=singleValue], .select__multi-value");
      const multi = shell ? [...shell.querySelectorAll(".select__multi-value__label")].map(txt) : [];
      out.push({ id: tag(el), kind: "combobox", label: l.text, required, value: multi.length ? multi.join(", ") : shown ? txt(shown) : el.value.trim() });
      continue;
    }
    const kind = el.tagName === "TEXTAREA" ? "textarea" : type === "number" ? "number" : "text";
    out.push({ id: tag(el), kind, label: l.text, required, value: (el.value || "").trim() });
  }
  return out;
})()`;

/** The choices of an open custom dropdown, marked data-jh-pick="<i>" so one can be clicked. */
export const OPTIONS_JS = String.raw`((id) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none";
  };
  const el = document.querySelector('[data-jh="' + id + '"]');
  if (!el) return [];
  document.querySelectorAll("[data-jh-pick]").forEach((o) => o.removeAttribute("data-jh-pick"));
  const SEL = '[role=option], .select__option, .dropdown-results > div:not(:empty)';
  const ctl = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  const scopes = [ctl && document.getElementById(ctl), el.closest(".select-shell, .application-field, [data-field-path], .field-wrapper"), document];
  for (const scope of scopes) {
    if (!scope) continue;
    const opts = [...scope.querySelectorAll(SEL)].filter((o) => vis(o) && !o.closest(".iti__dropdown-content"));
    if (!opts.length) continue;
    return opts.slice(0, 200).map((o, i) => {
      o.setAttribute("data-jh-pick", String(i));
      return (o.innerText || o.textContent || "").replace(/\s+/g, " ").trim();
    });
  }
  return [];
})`;

/** Words on the page once an application has gone through. */
export const SUBMITTED_TEXT =
  /application (has been |was )?(successfully )?(submitted|received)|thank(s| you) for (applying|your application|submitting)|we('ve| have) received your application|successfully (applied|submitted)/i;
export const SUBMITTED_URL = /\/(confirmation|thanks|thank-you|thank_you|submitted|application_confirmation)(\/|\?|$)/i;
