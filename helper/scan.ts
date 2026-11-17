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
  /** A file field that already holds a file. */
  hasFile?: boolean;
  /** Inside a Workday repeating entry: "work" (work experience), "education", "languages", "websites", or "other" (skills). */
  inSection?: EntryKind | "other";
  /** Date fields: the format a text box wants ("DD/MM/YYYY"), or the separate boxes Workday uses (m, d, y). */
  dateFormat?: string;
  dateParts?: string[];
  /** Workday's search-box lists, which load from the server after a click. */
  prompt?: boolean;
}

export type EntryKind = "work" | "education" | "languages" | "websites";

/**
 * Workday's "Add" buttons for Work Experience, Education and Languages (on My Experience, those
 * sections often start empty). Each is tagged data-jh-add="<kind>" so it can be clicked.
 */
export const ADDS_JS = String.raw`(() => {
  const txt = (el) => (el ? (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return (r.width > 0 || r.height > 0) && getComputedStyle(el).visibility !== "hidden";
  };
  document.querySelectorAll("[data-jh-add]").forEach((b) => b.removeAttribute("data-jh-add"));
  const out = [];
  for (const b of document.querySelectorAll("button, [role=button]")) {
    if (!vis(b) || b.disabled) continue;
    if (b.getAttribute("data-automation-id") !== "add-button" && !/^add( another)?$/i.test(txt(b))) continue;
    // Which section: the group it sits in, or else the nearest heading above it.
    let name = "";
    const g = b.closest("[role=group][aria-labelledby]");
    if (g) {
      const id = g.getAttribute("aria-labelledby");
      name = id + " " + txt(document.getElementById(id));
    }
    if (!/work|education|language|website/i.test(name)) {
      for (let p = b.parentElement; p && p !== document.body; p = p.parentElement) {
        const h = p.querySelector("h2, h3, h4, legend");
        if (h) { name = txt(h); break; }
      }
    }
    const kind = /work/i.test(name) ? "work" : /education/i.test(name) ? "education" : /language/i.test(name) ? "languages" : /website/i.test(name) ? "websites" : "";
    if (!kind || out.includes(kind)) continue;
    b.setAttribute("data-jh-add", kind);
    out.push(kind);
  }
  return out;
})()`;

/**
 * The form reader. Walks every input, textarea, select and dropdown button on the page and returns
 * one FormField per question. Written as a string because it runs inside the web page
 * (page.evaluate), not in Node: the page can see the form's elements, the helper can't.
 */
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
  const BOX = "[data-automation-id^=formField-], .field-wrapper, .eeoc__question__wrapper, .application-question, [data-field-path], fieldset, .form-group, .form-field, .question";
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
  // Words widgets add to their own captions ("Select One Required"): not part of any question.
  const denoise = (t) => clean((t || "").replace(/(\s*\b(select one|choose one|select|required|search|press enter to search)\b\s*)+$/i, ""));
  // A control nobody labelled properly (no <label for>, no aria): climb to the nearest ancestor that
  // holds this control and no other, and take that ancestor's label or heading. Stops as soon as
  // an ancestor holds a second control, so a neighbour's label is never borrowed.
  const controlsIn = (p) => {
    const seen = new Set();
    for (const c of p.querySelectorAll("input:not([type=hidden]), select, textarea, button[aria-haspopup=listbox], [role=combobox]")) {
      seen.add(c.type === "radio" || c.type === "checkbox" ? "group:" + (c.name || "") : c);
    }
    return seen.size;
  };
  const loneLabel = (el) => {
    for (let p = el.parentElement, i = 0; p && p !== document.body && i < 5; p = p.parentElement, i++) {
      if (controlsIn(p) > 1) break;
      for (const c of p.querySelectorAll("label, legend, [class*=label i], [class*=question-title i], h3, h4, h5")) {
        if (c.contains(el)) continue;
        const t = denoise(txt(c));
        if (t) return { text: t, el: c };
      }
      // No label-like element either: the words written around the control are its question
      // (a plain <p> or <div> above a dropdown). The control's own text and any open list are left out.
      const around = [];
      const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const host = n.parentElement;
        if (!host || el.contains(host) || host.closest("[role=listbox], [role=option], [role=menu], select, script, style, [hidden]")) continue;
        around.push(n.nodeValue);
      }
      const said = denoise(clean(around.join(" ")));
      if (said && said.length <= 600) return { text: said, el: { textContent: said + (/[*✱]/.test(around.join("")) ? "*" : "") } };
    }
    return { text: "", el: null };
  };
  // What a dropdown shows before anything is chosen: not an answer, and not a choice.
  const PLACEHOLDER = /^(-+\s*)?(select|choose|please select|please choose|pick one|none selected|no selection)\b.{0,24}$|^[-–—.\s]*$/i;
  const labelOf = (el) => {
    const own = forLabel(el);
    if (own && denoise(txt(own)) && !/^attach$/i.test(txt(own))) return { text: denoise(txt(own)), el: own };
    const by = denoise(byIds(el.getAttribute("aria-labelledby")));
    if (by) return { text: by, el: null };
    const wrap = el.closest("label");
    if (wrap) {
      const inner = wrap.querySelector(".application-label");
      if (inner && txt(inner)) return { text: txt(inner), el: inner };
    }
    // The question box's own heading (only a real question box: a page's first label is not every field's label).
    const t = titleOf(el.closest(BOX));
    if (denoise(t.text)) return { text: denoise(t.text), el: t.el };
    const aria = denoise(el.getAttribute("aria-label"));
    if (aria) return { text: aria, el: null };
    const lone = loneLabel(el);
    if (lone.text) return lone;
    return { text: clean(el.getAttribute("placeholder") || el.name || ""), el: null };
  };
  // Open pop-up lists, page furniture and Workday's chosen-items lists aren't questions.
  const inMenu = (el) =>
    !!el.closest(
      '[role=listbox], [role=menu], .iti__dropdown-content, .select__menu, [data-automation-id=menuItem], [data-automation-id=promptOption], [data-automation-widget=wd-popup], header, nav, footer, [data-automation-id=utilityMenu]',
    );
  // Workday's repeating entries (work history, education…), filled by its resume reader.
  const sectionOf = (el) => {
    const g = el.closest('[role=group][aria-labelledby$="-section"]');
    return g && /work-?experience|education|language|skill|website/i.test(g.getAttribute("aria-labelledby") || "") ? g : null;
  };
  const panelOf = (el) => {
    const p = el.closest('[role=group][aria-labelledby$="-panel"]');
    return p ? txt(p.querySelector("h5, h4, h3")) : "";
  };

  const out = [];
  const doneGroups = new Set();
  for (const el of document.querySelectorAll("input, textarea, select, button[data-option], button[aria-haspopup=listbox], [role=combobox]")) {
    if (inMenu(el)) continue;
    if (el.getAttribute("data-automation-id") === "beecatcher") continue; // Workday's trap for bots
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    // Inside a Workday entry (Work Experience 1, Education 1…): say which, and name the entry in the label.
    const section = type === "file" ? null : sectionOf(el);
    const sectionId = section ? section.getAttribute("aria-labelledby") || "" : "";
    const sectionKind = !section ? "" : /work/i.test(sectionId) ? "work" : /education/i.test(sectionId) ? "education" : /language/i.test(sectionId) ? "languages" : /website/i.test(sectionId) ? "websites" : "other";
    const panel = section ? panelOf(el) : "";
    const add = (o) => out.push(section ? { ...o, inSection: sectionKind, label: (panel ? panel + " › " : "") + o.label } : o);

    // Workday's dates: separate Month / Day / Year boxes, one question.
    const dateId = el.getAttribute("data-automation-id") || "";
    const part = /dateSectionMonth/i.test(dateId) ? "m" : /dateSectionDay/i.test(dateId) ? "d" : /dateSectionYear/i.test(dateId) ? "y" : "";
    if (part) {
      const wrap = el.closest("[data-automation-id=dateInputWrapper], [data-automation-id^=formField-], fieldset") || el.parentElement;
      if (doneGroups.has(wrap)) continue;
      doneGroups.add(wrap);
      const boxes = [...wrap.querySelectorAll("input[data-automation-id*=dateSection]")];
      const parts = boxes.map((b) => {
        const id = b.getAttribute("data-automation-id") || "";
        const p = /Month/i.test(id) ? "m" : /Day/i.test(id) ? "d" : "y";
        b.dataset.jhPart = p;
        return p;
      });
      const t = titleOf(wrap.closest("[data-automation-id^=formField-], fieldset") || wrap);
      const shown = boxes.map((b) => (b.value || "").replace(/^(mm|dd|yyyy)$/i, "")).join("");
      add({ id: tag(wrap), kind: "date", label: t.text || labelOf(el).text, required: boxes.some((b) => b.getAttribute("aria-required") === "true") || starred(t.el), value: shown, dateParts: parts });
      continue;
    }

    // Dropdowns that are a button (or a plain box) opening a list: Workday's, and the
    // role="combobox" kind many design systems use (Microsoft's among them).
    const boxCombo = el.getAttribute("role") === "combobox" && !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && !el.querySelector("input:not([type=hidden]), select, textarea");
    if (el.getAttribute("role") === "combobox" && !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && !boxCombo) continue; // a wrapper around a real input: that input is the field
    if ((el.tagName === "BUTTON" && el.getAttribute("aria-haspopup") === "listbox") || boxCombo) {
      if (!vis(el)) continue;
      const aria = el.getAttribute("aria-label") || "";
      const l = labelOf(el);
      const label = l.text || "(a question without a label: see the form in Chrome)";
      const shown = txt(el);
      add({
        id: tag(el),
        kind: "combobox",
        label,
        required: el.getAttribute("aria-required") === "true" || / required/i.test(aria) || starred(l.el),
        value: PLACEHOLDER.test(shown) ? "" : shown,
      });
      continue;
    }
    // Workday's search boxes ("How did you hear about us?"): what's chosen shows as items next to it.
    if (el.getAttribute("data-automation-id") === "searchBox" || el.getAttribute("data-uxi-widget-type") === "selectinput") {
      if (!vis(el)) continue;
      const l = labelOf(el);
      const holder = el.closest("[data-automation-id^=formField-]") || boxOf(el);
      const chosen = holder ? [...holder.querySelectorAll("[data-automation-id=selectedItemList] [data-automation-id=menuItem], [data-automation-id=selectedItem]")].map(txt) : [];
      add({ id: tag(el), kind: "combobox", label: l.text, required: el.getAttribute("aria-required") === "true" || starred(l.el), value: chosen.join(", "), prompt: true });
      continue;
    }

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
      add({ id, kind: "radio", label: t.text, required: starred(t.el), value: picked ? txt(picked) : "", options: btns.map(txt), buttons: true });
      continue;
    }

    if (["hidden", "submit", "button", "image", "reset", "password"].includes(type)) continue;
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (el.closest("[data-field-path]") && el.closest("[data-field-path]").querySelector("button[data-option]")) continue; // the Yes/No's own checkbox

    if (type === "file") {
      const box = boxOf(el);
      const zone = el.closest("[data-automation-id^=formField-], [data-automation-id*=attachment i], [data-automation-id*=resume i]") || box;
      add({
        id: tag(el),
        kind: "file",
        label: labelOf(el).text,
        required: el.required || el.getAttribute("aria-required") === "true" || starred(labelOf(el).el) || (!!el.closest(BOX) && starred(titleOf(el.closest(BOX)).el)),
        value: "",
        context: clean((box ? box.innerText : "") || "").slice(0, 200),
        hasFile: !!(zone && zone.querySelector("[data-automation-id^=file-upload-item], [data-automation-id=file-upload-successful], [data-automation-id=delete-file]")),
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
        add({ id, kind: "checkbox", label: names[0] || t.text, required, value: opts[0].checked ? "checked" : "" });
      } else {
        add({
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
      const real = (o) => o.value !== "" && txt(o) && !PLACEHOLDER.test(txt(o));
      const options = [...el.options].filter(real).map(txt);
      const chosen = el.selectedOptions[0];
      add({ id: tag(el), kind: "select", label: l.text, required, value: chosen && real(chosen) ? txt(chosen) : "", options });
      continue;
    }
    if (el.getAttribute("role") === "combobox") {
      // A custom dropdown: what's chosen shows next to it (react-select), or in the input itself.
      const shell = el.closest(".select-shell, .select__control, [data-field-path], .field-wrapper") || box;
      const shown = shell && shell.querySelector(".select__single-value, [class*=singleValue], .select__multi-value");
      const multi = shell ? [...shell.querySelectorAll(".select__multi-value__label")].map(txt) : [];
      add({ id: tag(el), kind: "combobox", label: l.text, required, value: multi.length ? multi.join(", ") : shown ? txt(shown) : el.value.trim() });
      continue;
    }
    const placeholder = el.getAttribute("placeholder") || "";
    if (type === "date" || (/\b(dd|mm|yyyy)\b/i.test(placeholder) && /[\/.\-]/.test(placeholder))) {
      add({ id: tag(el), kind: "date", label: l.text, required, value: (el.value || "").trim(), dateFormat: type === "date" ? "YYYY-MM-DD" : placeholder.toUpperCase() });
      continue;
    }
    const kind = el.tagName === "TEXTAREA" ? "textarea" : type === "number" ? "number" : "text";
    add({ id: tag(el), kind, label: l.text, required, value: (el.value || "").trim() });
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
  const SEL = '[data-automation-id=promptOption], [role=option], .select__option, .dropdown-results > div:not(:empty)';
  const ctl = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  const scopes = [ctl && document.getElementById(ctl), el.closest(".select-shell, .application-field, [data-field-path], .field-wrapper"), document];
  for (const scope of scopes) {
    if (!scope) continue;
    const opts = [...scope.querySelectorAll(SEL)].filter((o) => vis(o) && !o.closest(".iti__dropdown-content, [data-automation-id=selectedItemList]"));
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

/**
 * Where a multi-page form is: the step it's on, whether it waits for a sign-in, and any error
 * messages showing.
 *   gate     a sign-in screen: a password or one-time-code box with little else to fill. The
 *            helper waits for you. (A long form that also has a password box is not a gate.)
 *   step     the name of the current step in Workday's progress bar ("" on other sites)
 *   index    that step's position in the bar (-1 when there's no bar)
 *   heading  the page's first visible heading, used when there's no step name
 *   url      the address without ?query or #hash
 */
export interface PageState {
  gate: boolean;
  step: string;
  index: number;
  heading: string;
  url: string;
  errors: string[];
}

/** Reads a PageState off the page (runs inside the page, like SCAN_JS). */
export const STATE_JS = String.raw`(() => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const txt = (e) => ((e && (e.innerText || e.textContent)) || "").replace(/\s+/g, " ").trim();
  const active = document.querySelector("[data-automation-id=progressBarActiveStep]");
  const steps = [...document.querySelectorAll("[data-automation-id=progressBar] li")];
  const heading = [...document.querySelectorAll("main h1, main h2, [data-automation-id=pageHeader], h1, h2")].find(vis);
  const password = [...document.querySelectorAll("input[type=password], input[autocomplete=one-time-code]")].some(vis);
  const body = txt(document.body).slice(0, 3000);
  const inputs = [...document.querySelectorAll("main input, main textarea, form input, form textarea")].filter(vis).length;
  // The boxes a person fills in, other than passwords and codes. A sign-in or sign-up screen has
  // one or two (email, maybe a name). An application form that also asks you to choose a password
  // for an account (SuccessFactors does: Ericsson, SAP, Siemens…) has many: that page is to be
  // filled, with only the password left to you.
  const fillable = [...document.querySelectorAll("input, textarea, select")].filter(
    (e) => vis(e) && !/^(hidden|password|submit|button|image|reset|checkbox|radio|file|search)$/i.test(e.type || "") && e.autocomplete !== "one-time-code" && !e.closest("header, nav, footer"),
  ).length;
  const code = inputs <= 7 && /verification code|enter the code|one[- ]time (pass|code)|verify your (account|email)/i.test(body);
  const errors = [...document.querySelectorAll("[data-automation-id=errorBanner], [data-automation-id=errorMessage], [data-automation-id^=inputAlert], [role=alert]")]
    .filter(vis)
    .map(txt)
    .filter((s) => s && !/success|uploaded|saved/i.test(s))
    .slice(0, 8);
  return {
    gate: (password && fillable <= 4) || code,
    step: txt(active).replace(/^current step \d+ of \d+\s*/i, ""),
    index: active ? steps.indexOf(active.closest("li") || active) : -1,
    heading: txt(heading).slice(0, 80),
    url: location.origin + location.pathname,
    errors,
  };
})()`;

/**
 * The button that moves to the next page, marked data-jh-next. Allow-list only: a button that
 * submits, sends or finishes is reported as "submit" and never clicked.
 */
export const NEXT_JS = String.raw`(() => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const name = (e) => ((e.innerText || e.value || e.getAttribute("aria-label") || "") + "").replace(/\s+/g, " ").trim();
  const NEXT = /^(next|next step|continue|proceed|save (and|&) continue|save (and|&) next)$/i;
  const STOP = /submit|send|finish|complete|^apply/i;
  document.querySelectorAll("[data-jh-next]").forEach((e) => e.removeAttribute("data-jh-next"));
  const all = [...document.querySelectorAll("button, [role=button], input[type=submit], input[type=button]")].filter(
    (e) => vis(e) && !e.closest("header, nav, footer, [role=banner], [role=navigation]"),
  );
  const footer = all.find((e) => ["pageFooterNextButton", "bottom-navigation-next-button"].includes(e.getAttribute("data-automation-id")));
  if (footer && !NEXT.test(name(footer))) return { kind: "submit", text: name(footer) };
  const next = footer || all.find((e) => NEXT.test(name(e)));
  if (next) {
    next.setAttribute("data-jh-next", "1");
    return { kind: "next", text: name(next), disabled: next.disabled || next.getAttribute("aria-disabled") === "true" };
  }
  const stop = all.find((e) => STOP.test(name(e)));
  return stop ? { kind: "submit", text: name(stop) } : { kind: "none", text: "" };
})()`;

/**
 * Before the form: the job page's Apply, then Workday's "how do you want to apply?". Prefers
 * reusing your last application at that company, then letting Workday read your resume.
 * Marks the button data-jh-start and returns its text ("" when there's none).
 */
export const START_JS = String.raw`((hasResume) => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const name = (e) => ((e.innerText || e.getAttribute("aria-label") || "") + "").replace(/\s+/g, " ").trim();
  document.querySelectorAll("[data-jh-start]").forEach((e) => e.removeAttribute("data-jh-start"));
  const all = [...document.querySelectorAll("a, button, [role=button]")].filter((e) => vis(e) && !e.closest("header, nav, footer"));
  const byId = (id) => all.find((e) => e.getAttribute("data-automation-id") === id);
  const order = [
    () => byId("useMyLastApplication") || all.find((e) => /^use my last application$/i.test(name(e))),
    () => (hasResume ? byId("autofillWithResume") || all.find((e) => /^autofill with resume$/i.test(name(e))) : null),
    () => byId("applyManually") || all.find((e) => /^apply manually$/i.test(name(e))),
    () => byId("adventureButton") || byId("applyButton") || all.find((e) => /^apply( now| for this job)?$/i.test(name(e))),
  ];
  for (const pick of order) {
    const b = pick();
    if (b) {
      b.setAttribute("data-jh-start", "1");
      return name(b) || "Apply";
    }
  }
  return "";
})`;
