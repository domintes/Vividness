// ==UserScript==
// @name Vividness
// @author Domintes
// @namespace https://github.com/Domintes
// @icon https://i.ibb.co/0yMPW52Q/icon-64.png
// @version 1.1
// @license MIT
// @match *://*/*
// @grant none
// @description Vividness is a user script which adds possibility for user changing parameter values of videos and images to adjust brightness, contrast or saturation.
// @downloadURL https://update.greasyfork.org/scripts/602207/Vividness.user.js
// @updateURL https://update.greasyfork.org/scripts/602207/Vividness.meta.js
// ==/UserScript==

(function() {
const STORAGE_KEY = "vividness-settings-v1";
const DEFAULT_SETTINGS = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    temperature: 0,
    sharpness: 0,
    gamma: 1
};
const CONTROL_CONFIG = [
    { key: "brightness", label: "Brightness", min: 0, max: 3, step: 0.1 },
    { key: "contrast", label: "Contrast", min: 0, max: 3, step: 0.1 },
    { key: "saturate", label: "Saturation", min: 0, max: 5, step: 0.1 },
    { key: "temperature", label: "Color temperature", min: -100, max: 100, step: 1 },
    { key: "sharpness", label: "Sharpness", min: 0, max: 5, step: 0.1 },
    { key: "gamma", label: "Gamma", min: 0.1, max: 3, step: 0.1 }
];

let settings = { ...DEFAULT_SETTINGS };
let compatibilityMode = false;
let profiles = { Default: { ...DEFAULT_SETTINGS } };
let currentProfile = "Default";
let panel;
let panelContent;
let filterElement;
let observer;
const observedRoots = new WeakSet();

function loadSavedState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && saved.profiles && typeof saved.profiles === "object") {
            profiles = saved.profiles;
            if (!profiles.Default) profiles.Default = { ...DEFAULT_SETTINGS };
            compatibilityMode = saved.compatibilityMode === true;
            currentProfile = profiles[saved.currentProfile] ? saved.currentProfile : "Default";
            settings = { ...DEFAULT_SETTINGS, ...profiles[currentProfile] };
        }
    } catch (error) {
        profiles = { Default: { ...DEFAULT_SETTINGS } };
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            profiles,
            currentProfile,
            compatibilityMode
        }));
    } catch (error) {
        // Storage can be unavailable on restricted pages.
    }
}

function createSvgFilter() {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";

    const defs = document.createElementNS(svgNamespace, "defs");
    filterElement = document.createElementNS(svgNamespace, "filter");
    filterElement.setAttribute("id", "vividness-filter");
    filterElement.setAttribute("x", "-10%");
    filterElement.setAttribute("y", "-10%");
    filterElement.setAttribute("width", "120%");
    filterElement.setAttribute("height", "120%");

    const temperature = document.createElementNS(svgNamespace, "feColorMatrix");
    temperature.setAttribute("id", "vividness-temperature");
    temperature.setAttribute("type", "matrix");
    filterElement.appendChild(temperature);

    const sharpness = document.createElementNS(svgNamespace, "feConvolveMatrix");
    sharpness.setAttribute("id", "vividness-sharpness");
    sharpness.setAttribute("order", "3");
    sharpness.setAttribute("preserveAlpha", "true");
    filterElement.appendChild(sharpness);

    const gamma = document.createElementNS(svgNamespace, "feComponentTransfer");
    gamma.setAttribute("id", "vividness-gamma");
    ["R", "G", "B"].forEach(channel => {
        const transfer = document.createElementNS(svgNamespace, `feFunc${channel}`);
        transfer.setAttribute("type", "gamma");
        transfer.setAttribute("amplitude", "1");
        transfer.setAttribute("offset", "0");
        gamma.appendChild(transfer);
    });
    filterElement.appendChild(gamma);
    defs.appendChild(filterElement);
    svg.appendChild(defs);
    document.body.appendChild(svg);
}

function updateSvgFilter() {
    const warmth = settings.temperature / 100 * 0.2;
    filterElement.querySelector("#vividness-temperature").setAttribute("values",
        `${1 + warmth} 0 0 0 0  0 1 0 0 0  0 0 ${1 - warmth} 0 0  0 0 0 1 0`);

    const amount = settings.sharpness / 5;
    filterElement.querySelector("#vividness-sharpness").setAttribute("kernelMatrix",
        `${-amount} ${-amount} ${-amount} ${-amount} ${1 + amount * 8} ${-amount} ${-amount} ${-amount} ${-amount}`);
    filterElement.querySelectorAll("#vividness-gamma feFuncR, #vividness-gamma feFuncG, #vividness-gamma feFuncB")
        .forEach(transfer => transfer.setAttribute("exponent", settings.gamma));
}

function setElementFilter(element) {
    const filter = `brightness(${settings.brightness}) contrast(${settings.contrast}) saturate(${settings.saturate}) url(#vividness-filter)`;
    const priority = compatibilityMode ? "important" : "";
    if (element.style.getPropertyValue("filter") !== filter || element.style.getPropertyPriority("filter") !== priority) {
        element.style.setProperty("filter", filter, priority);
    }
    if (element.style.getPropertyValue("-webkit-filter") !== filter || element.style.getPropertyPriority("-webkit-filter") !== priority) {
        element.style.setProperty("-webkit-filter", filter, priority);
    }
}

function scanMedia(root, includeShadowRoots = compatibilityMode) {
    if (root.matches && root.matches("video, img")) setElementFilter(root);
    if (!root.querySelectorAll) return;
    root.querySelectorAll("video, img").forEach(setElementFilter);
    if (includeShadowRoots) {
        root.querySelectorAll("*").forEach(element => {
            if (element.shadowRoot) {
                observeRoot(element.shadowRoot);
                scanMedia(element.shadowRoot, true);
            }
        });
    }
}

function applyFilters() {
    updateSvgFilter();
    scanMedia(document);
}

function observeRoot(root) {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
}

function updateControlValues() {
    CONTROL_CONFIG.forEach(({ key }) => {
        panelContent.querySelector(`#${key}-range`).value = settings[key];
        panelContent.querySelector(`#${key}-number`).value = settings[key];
    });
}

function updateProfileOptions() {
    const select = panelContent.querySelector("#vividness-profile");
    select.replaceChildren(...Object.keys(profiles).map(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        return option;
    }));
    select.value = currentProfile;
    panelContent.querySelector("#vividness-delete-profile").disabled = currentProfile === "Default";
}

function buildPanel() {
    panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:20px;right:20px;z-index:2147483647;display:none";
    const shadow = panel.attachShadow({ mode: "open" });
    const rows = CONTROL_CONFIG.map(({ key, label, min, max, step }) => `
        <label class="control" for="${key}-range">
            <span class="label">${label}</span>
            <input id="${key}-range" type="range" min="${min}" max="${max}" step="${step}">
            <input id="${key}-number" type="number" min="${min}" max="${max}" step="${step}" aria-label="${label} value">
        </label>`).join("");

    shadow.innerHTML = `
        <style>
            :host { color-scheme: dark; font: 13px/1.35 system-ui, sans-serif; }
            * { box-sizing: border-box; }
            .panel { width: 360px; max-width: calc(100vw - 32px); padding: 14px; color: #f4f4f2; background: #202523; border: 1px solid #59615c; border-radius: 8px; box-shadow: 0 8px 28px #0008; }
            header, .profiles, .profile-actions { display: flex; align-items: center; gap: 8px; }
            header { justify-content: space-between; margin-bottom: 12px; font-size: 15px; font-weight: 650; }
            button, select, input[type=number], input[type=text] { min-height: 28px; color: inherit; background: #303733; border: 1px solid #606963; border-radius: 4px; font: inherit; }
            button { padding: 4px 8px; cursor: pointer; }
            button:disabled { opacity: .45; cursor: default; }
            .close { width: 30px; padding: 3px; font-size: 18px; }
            .control { display: grid; grid-template-columns: 118px minmax(70px, 1fr) 68px; align-items: center; gap: 8px; min-height: 32px; }
            input[type=range] { width: 100%; accent-color: #b6d47c; }
            input[type=number] { width: 68px; padding: 3px 5px; }
            .compatibility { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-top: 1px solid #4a524d; margin-top: 8px; }
            .compatibility input { accent-color: #b6d47c; }
            .profiles { border-top: 1px solid #4a524d; padding-top: 10px; }
            select { min-width: 0; flex: 1; padding: 3px 6px; }
            .profile-actions { margin-top: 8px; }
            input[type=text] { min-width: 0; flex: 1; padding: 4px 7px; }
            @media (max-width: 420px) { .panel { width: calc(100vw - 24px); } .control { grid-template-columns: 102px minmax(55px, 1fr) 64px; gap: 6px; } input[type=number] { width: 64px; } }
        </style>
        <section class="panel" aria-label="Vividness controls">
            <header><span>Vividness</span><button class="close" id="vividness-close" type="button" aria-label="Close" title="Close">×</button></header>
            <div>${rows}</div>
            <label class="compatibility"><input id="vividness-compatibility" type="checkbox"> Compatibility Mode</label>
            <div class="profiles">
                <select id="vividness-profile" aria-label="Profile"></select>
                <button id="vividness-delete-profile" type="button" title="Delete profile" aria-label="Delete profile">Delete</button>
            </div>
            <div class="profile-actions">
                <input id="vividness-profile-name" type="text" maxlength="40" placeholder="Profile name" aria-label="Profile name">
                <button id="vividness-save-profile" type="button">Save</button>
            </div>
        </section>`;
    panelContent = shadow;
    document.body.appendChild(panel);

    CONTROL_CONFIG.forEach(({ key, min, max }) => {
        const range = shadow.querySelector(`#${key}-range`);
        const number = shadow.querySelector(`#${key}-number`);
        const update = value => {
            if (value === "") return;
            const numericValue = Number(value);
            if (!Number.isFinite(numericValue)) return;
            settings[key] = Math.min(max, Math.max(min, numericValue));
            range.value = settings[key];
            number.value = settings[key];
            applyFilters();
            saveState();
        };
        range.addEventListener("input", () => update(range.value));
        number.addEventListener("input", () => update(number.value));
        number.addEventListener("change", () => {
            if (number.value === "") number.value = settings[key];
            else update(number.value);
        });
    });

    shadow.querySelector("#vividness-compatibility").addEventListener("change", event => {
        compatibilityMode = event.target.checked;
        applyFilters();
        saveState();
        scanMedia(document, true);
    });
    shadow.querySelector("#vividness-profile").addEventListener("change", event => loadProfile(event.target.value));
    shadow.querySelector("#vividness-save-profile").addEventListener("click", saveProfile);
    shadow.querySelector("#vividness-delete-profile").addEventListener("click", deleteProfile);
    shadow.querySelector("#vividness-close").addEventListener("click", togglePanel);
    shadow.querySelector("#vividness-compatibility").checked = compatibilityMode;
    updateControlValues();
    updateProfileOptions();
}

function loadProfile(name) {
    if (!profiles[name]) return;
    currentProfile = name;
    settings = { ...DEFAULT_SETTINGS, ...profiles[name] };
    updateControlValues();
    updateProfileOptions();
    applyFilters();
    saveState();
}

function saveProfile() {
    const nameInput = panelContent.querySelector("#vividness-profile-name");
    const name = nameInput.value.trim() || currentProfile;
    profiles[name] = { ...settings };
    currentProfile = name;
    nameInput.value = "";
    updateProfileOptions();
    saveState();
}

function deleteProfile() {
    if (currentProfile === "Default") return;
    delete profiles[currentProfile];
    currentProfile = "Default";
    settings = { ...DEFAULT_SETTINGS, ...profiles.Default };
    updateControlValues();
    updateProfileOptions();
    applyFilters();
    saveState();
}

function togglePanel() {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function cycleProfile(direction) {
    const names = Object.keys(profiles);
    const index = names.indexOf(currentProfile);
    loadProfile(names[(index + direction + names.length) % names.length]);
}

function initialize() {
    loadSavedState();
    createSvgFilter();
    buildPanel();
    observer = new MutationObserver(records => {
        records.forEach(record => {
            if (record.type === "attributes" && record.target.matches("video, img")) {
                setElementFilter(record.target);
            }
            record.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) scanMedia(node);
            });
        });
    });
    observeRoot(document.documentElement);
    scanMedia(document);
    applyFilters();

    window.addEventListener("keydown", event => {
        if (event.key === "F8" || (event.altKey && event.key === "?")) {
            event.preventDefault();
            togglePanel();
        } else if (event.altKey && event.key === ">") {
            event.preventDefault();
            cycleProfile(1);
        } else if (event.altKey && event.key === "<") {
            event.preventDefault();
            cycleProfile(-1);
        }
    });
}

if (document.body) initialize();
else document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();