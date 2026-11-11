// ==UserScript==
// @name Vividness
// @author Domintes
// @namespace https://github.com/Domintes
// @icon https://i.ibb.co/0yMPW52Q/icon-64.png
// @version 1.3
// @license MIT
// @match *://*/*
// @grant none
// @description Vividness is a user script which adds possibility for user changing parameter values of videos and images to adjust brightness, contrast or saturation.
// @downloadURL https://update.greasyfork.org/scripts/602207/Vividness.user.js
// @updateURL https://update.greasyfork.org/scripts/602207/Vividness.meta.js
// ==/UserScript==

(function() {
const STORAGE_KEY = "vividness-settings-v1";
const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = {
    brightness: 0,
    contrast: 0,
    saturate: 0,
    temperature: 0,
    sharpness: 0,
    gamma: 1
};
const CONTROL_CONFIG = [
    { key: "brightness", symbol: "☀", label: "Brightness", step: 1 },
    { key: "contrast", symbol: "◑", label: "Contrast", step: 1 },
    { key: "saturate", symbol: "🎨︎", label: "Saturation", step: 1 },
    { key: "temperature", symbol: "🌡︎", label: "Temperature", step: 1 },
    { key: "gamma", symbol: "☣︎", label: "Gamma", step: 0.01 },
    { key: "sharpness", symbol: "⛆", label: "Sharpness", step: 1 }
];
const BUILT_IN_PROFILES = {
    Default: { ...DEFAULT_SETTINGS },
    "Vivid Cool": { ...DEFAULT_SETTINGS, contrast: 0, saturate: 75, temperature: -50 },
    "Low Gamma": { ...DEFAULT_SETTINGS, contrast: 0, saturate: 50, gamma: 0.85 },
    "High Contrast": { ...DEFAULT_SETTINGS, contrast: 35, saturate: 50, temperature: -50, gamma: 0.75 },
    Grayscale: { ...DEFAULT_SETTINGS, contrast: 0, saturate: -100, temperature: -50, gamma: 1.00 }
};

let settings = { ...DEFAULT_SETTINGS };
let compatibilityMode = false;
let showFullscreenGUI = false;
let workOnImages = true;
let extendedLimits = false;
let profiles = cloneBuiltInProfiles();
let currentProfile = "Default";
let panel;
let panelContent;
let panelOpen = false;
let panelModal = false;
let filterElement;
let observer;
const observedRoots = new WeakSet();

function loadSavedState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && saved.profiles && typeof saved.profiles === "object") {
            const storedProfiles = saved.profiles;
            extendedLimits = saved.extendedLimits === true;
            profiles = cloneBuiltInProfiles();
            Object.entries(storedProfiles).forEach(([name, profile]) => {
                if (!profile || typeof profile !== "object") return;
                const loadedProfile = saved.settingsVersion === SETTINGS_VERSION
                    ? { ...DEFAULT_SETTINGS, ...profile }
                    : migrateLegacyProfile(profile);
                profiles[name] = clampSettings(loadedProfile);
            });
            profiles.Default = { ...DEFAULT_SETTINGS };
            compatibilityMode = saved.compatibilityMode === true;
            showFullscreenGUI = saved.showFullscreenGUI === true;
            workOnImages = saved.workOnImages !== false;
            currentProfile = profiles[saved.currentProfile] ? saved.currentProfile : "Default";
            settings = clampSettings(profiles[currentProfile]);
        }
    } catch (error) {
        profiles = cloneBuiltInProfiles();
    }
}

function cloneBuiltInProfiles() {
    return Object.fromEntries(Object.entries(BUILT_IN_PROFILES)
        .map(([name, profile]) => [name, { ...profile }]));
}

function migrateLegacyProfile(profile) {
    return {
        ...DEFAULT_SETTINGS,
        ...profile,
        brightness: (Number(profile.brightness ?? 1) - 1) * 100,
        contrast: (Number(profile.contrast ?? 1) - 1) * 100,
        saturate: (Number(profile.saturate ?? 1) - 1) * 100,
        sharpness: Number(profile.sharpness ?? 0) * 20
    };
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            settingsVersion: SETTINGS_VERSION,
            profiles,
            currentProfile,
            compatibilityMode,
            showFullscreenGUI,
            workOnImages,
            extendedLimits
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

    const amount = settings.sharpness / 100;
    filterElement.querySelector("#vividness-sharpness").setAttribute("kernelMatrix",
        `${-amount} ${-amount} ${-amount} ${-amount} ${1 + amount * 8} ${-amount} ${-amount} ${-amount} ${-amount}`);
    filterElement.querySelectorAll("#vividness-gamma feFuncR, #vividness-gamma feFuncG, #vividness-gamma feFuncB")
        .forEach(transfer => transfer.setAttribute("exponent", settings.gamma));
}

function setElementFilter(element) {
    const filter = `brightness(${Math.max(0, 1 + settings.brightness / 100)}) contrast(${Math.max(0, 1 + settings.contrast / 100)}) saturate(${Math.max(0, 1 + settings.saturate / 100)}) url(#vividness-filter)`;
    const priority = compatibilityMode ? "important" : "";
    if (element.style.getPropertyValue("filter") !== filter || element.style.getPropertyPriority("filter") !== priority) {
        element.style.setProperty("filter", filter, priority);
    }
    if (element.style.getPropertyValue("-webkit-filter") !== filter || element.style.getPropertyPriority("-webkit-filter") !== priority) {
        element.style.setProperty("-webkit-filter", filter, priority);
    }
}

function mediaSelector() {
    return workOnImages ? "video, img" : "video";
}

function removeImageFilters(root = document, includeShadowRoots = compatibilityMode) {
    const removeFilter = image => {
        const filter = `brightness(${Math.max(0, 1 + settings.brightness / 100)}) contrast(${Math.max(0, 1 + settings.contrast / 100)}) saturate(${Math.max(0, 1 + settings.saturate / 100)}) url(#vividness-filter)`;
        if (image.style.getPropertyValue("filter") === filter) image.style.removeProperty("filter");
        if (image.style.getPropertyValue("-webkit-filter") === filter) image.style.removeProperty("-webkit-filter");
    };
    if (root.matches && root.matches("img")) removeFilter(root);
    if (!root.querySelectorAll) return;
    root.querySelectorAll("img").forEach(removeFilter);
    if (includeShadowRoots) {
        root.querySelectorAll("*").forEach(element => {
            if (element.shadowRoot) removeImageFilters(element.shadowRoot, true);
        });
    }
}

function scanMedia(root, includeShadowRoots = compatibilityMode) {
    const selector = mediaSelector();
    if (root.matches && root.matches(selector)) setElementFilter(root);
    if (!root.querySelectorAll) return;
    root.querySelectorAll(selector).forEach(setElementFilter);
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
        panelContent.querySelector(`#${key}-number`).value = formatSettingValue(key, settings[key]);
    });
}

function formatSettingValue(key, value) {
    return key === "gamma" ? Number(value).toFixed(2) : String(value);
}

function getControlLimits(key) {
    if (key === "gamma") return { min: 0, max: extendedLimits ? 10 : 3 };
    return { min: extendedLimits ? -500 : -100, max: extendedLimits ? 500 : 100 };
}

function clampSettings(values) {
    const result = { ...DEFAULT_SETTINGS, ...values };
    CONTROL_CONFIG.forEach(({ key }) => {
        const { min, max } = getControlLimits(key);
        const value = Number(result[key]);
        result[key] = Number.isFinite(value)
            ? Math.min(max, Math.max(min, value))
            : DEFAULT_SETTINGS[key];
    });
    return result;
}

function updateControlLimits(clampValues = false) {
    CONTROL_CONFIG.forEach(({ key }) => {
        const { min, max } = getControlLimits(key);
        const range = panelContent.querySelector(`#${key}-range`);
        const number = panelContent.querySelector(`#${key}-number`);
        range.min = number.min = min;
        range.max = number.max = max;
    });
    if (clampValues) settings = clampSettings(settings);
    updateControlValues();
}

function formatProfile(name, profile) {
    const properties = CONTROL_CONFIG.map(({ key, symbol }) =>
        `${symbol}∶ ${formatSettingValue(key, profile[key] ?? DEFAULT_SETTINGS[key])}`).join(" │");
    return `${name} ┃ ${properties}`;
}

function updateProfileOptions() {
    const select = panelContent.querySelector("#vividness-profile");
    select.replaceChildren(...Object.keys(profiles).map(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = formatProfile(name, profiles[name]);
        return option;
    }));
    select.value = currentProfile;
    panelContent.querySelector("#vividness-delete-profile").disabled = currentProfile === "Default";
}

const vividnessPolicy = window.trustedTypes && window.trustedTypes.createPolicy
    ? window.trustedTypes.createPolicy('vividnessHtmlPolicy', { createHTML: (string) => string })
    : { createHTML: (string) => string };

function buildPanel() {
    panel = document.createElement("dialog");
    panel.id = "vividness-dialog";
    panel.style.cssText = "position:fixed;inset:auto;margin:0;top:20px;right:20px;z-index:2147483647;padding:0;border:0;background:transparent;color:inherit;max-width:none;max-height:none;overflow:visible";
    panel.style.setProperty("pointer-events", "auto", "important");
    panel.style.setProperty("user-select", "auto", "important");
    panel.tabIndex = -1;
    const shadowHost = document.createElement("div");
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const rows = CONTROL_CONFIG.map(({ key, symbol, label, step }) => {
        const { min, max } = getControlLimits(key);
        return `
        <label class="control" for="${key}-range">
            <span class="label">${symbol} ${label}</span>
            <input id="${key}-range" type="range" min="${min}" max="${max}" step="${step}">
            <input id="${key}-number" type="number" min="${min}" max="${max}" step="${step}" aria-label="${label} value">
            <button class="reset" id="${key}-reset" type="button" aria-label="Reset ${label} to default" title="Reset ${label} to default">⭯</button>
        </label>`;
    }).join("");

    shadow.innerHTML = vividnessPolicy.createHTML(`
        <style>
            :host { color-scheme: dark; font: 13px/1.35 system-ui, sans-serif; pointer-events: auto !important; }
            * { box-sizing: border-box; }
            .panel { width: 360px; max-width: calc(100vw - 32px); padding: 14px; color: #f4f4f2; background: #202523; border: 1px solid #59615c; border-radius: 8px; box-shadow: 0 8px 28px #0008; }
            header, .profiles, .profile-actions { display: flex; align-items: center; gap: 8px; }
            header { justify-content: space-between; margin-bottom: 12px; font-size: 15px; font-weight: 650; }
            button, select, input[type=number], input[type=text] { min-height: 28px; color: inherit; background: #303733; border: 1px solid #606963; border-radius: 4px; font: inherit; }
            button { padding: 4px 8px; cursor: pointer; }
            button:disabled { opacity: .45; cursor: default; }
            .close { width: 30px; padding: 3px; font-size: 18px; }
            .control { display: grid; grid-template-columns: 118px minmax(50px, 1fr) 68px 28px; align-items: center; gap: 8px; min-height: 32px; }
            input[type=range] { width: 100%; accent-color: #b6d47c; }
            input[type=number] { width: 68px; padding: 3px 5px; }
            .reset { width: 28px; padding: 3px 0; }
            .compatibility { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-top: 1px solid #4a524d; margin-top: 8px; }
            .compatibility input { accent-color: #b6d47c; }
            .profiles { border-top: 1px solid #4a524d; padding-top: 10px; }
            select { min-width: 0; flex: 1; padding: 3px 6px; }
            .profile-actions { margin-top: 8px; }
            input[type=text] { min-width: 0; flex: 1; padding: 4px 7px; }
            @media (max-width: 420px) { .panel { width: calc(100vw - 24px); } .control { grid-template-columns: 102px minmax(40px, 1fr) 64px 28px; gap: 6px; } input[type=number] { width: 64px; } }
        </style>
        <section class="panel" aria-label="Vividness controls">
            <header><span>Vividness</span><button class="close" id="vividness-close" type="button" aria-label="Close" title="Close">×</button></header>
            <div>${rows}</div>
            <label class="compatibility"><input id="vividness-compatibility" type="checkbox"> Compatibility Mode</label>
            <label class="compatibility"><input id="vividness-fullscreen" type="checkbox"> Show GUI on Fullscreen Video Mode</label>
            <label class="compatibility"><input id="vividness-images" type="checkbox"> Work on Images</label>
            <label class="compatibility"><input id="vividness-extended-limits" type="checkbox"> Extend default limits</label>
            <div class="profiles">
                <select id="vividness-profile" aria-label="Profile"></select>
                <button id="vividness-delete-profile" type="button" title="Delete profile" aria-label="Delete profile">Delete</button>
            </div>
            <div class="profile-actions">
                <input id="vividness-profile-name" type="text" maxlength="40" placeholder="Profile name" aria-label="Profile name">
                <button id="vividness-save-profile" type="button">Save</button>
            </div>
        </section>`);

    panel.appendChild(shadowHost);
    const backdropStyle = document.createElement("style");
    backdropStyle.textContent = "#vividness-dialog::backdrop { background: transparent; }";
    document.head.appendChild(backdropStyle);
    panelContent = shadow;
    document.body.appendChild(panel);
    panel.addEventListener("cancel", event => {
        event.preventDefault();
        panelOpen = false;
        updatePanelVisibility();
    });

    CONTROL_CONFIG.forEach(({ key }) => {
        const range = shadow.querySelector(`#${key}-range`);
        const number = shadow.querySelector(`#${key}-number`);
        shadow.querySelector(`#${key}-reset`).addEventListener("click", () => {
            settings[key] = DEFAULT_SETTINGS[key];
            updateControlValues();
            applyFilters();
            saveState();
        });
        const update = value => {
            if (value === "") return;
            const numericValue = Number(value);
            if (!Number.isFinite(numericValue)) return;
            const { min, max } = getControlLimits(key);
            settings[key] = Math.min(max, Math.max(min, numericValue));
            range.value = settings[key];
            number.value = formatSettingValue(key, settings[key]);
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
    shadow.querySelector("#vividness-fullscreen").addEventListener("change", event => {
        showFullscreenGUI = event.target.checked;
        updatePanelVisibility();
        saveState();
    });
    shadow.querySelector("#vividness-images").addEventListener("change", event => {
        workOnImages = event.target.checked;
        if (!workOnImages) removeImageFilters();
        applyFilters();
        saveState();
    });
    shadow.querySelector("#vividness-extended-limits").addEventListener("change", event => {
        extendedLimits = event.target.checked;
        Object.keys(profiles).forEach(name => {
            profiles[name] = clampSettings(profiles[name]);
        });
        updateControlLimits(true);
        updateProfileOptions();
        applyFilters();
        saveState();
    });
    shadow.querySelector("#vividness-profile").addEventListener("change", event => loadProfile(event.target.value));
    shadow.querySelector("#vividness-save-profile").addEventListener("click", saveProfile);
    shadow.querySelector("#vividness-delete-profile").addEventListener("click", deleteProfile);
    shadow.querySelector("#vividness-close").addEventListener("click", togglePanel);
    shadow.querySelector("#vividness-compatibility").checked = compatibilityMode;
    shadow.querySelector("#vividness-fullscreen").checked = showFullscreenGUI;
    shadow.querySelector("#vividness-images").checked = workOnImages;
    shadow.querySelector("#vividness-extended-limits").checked = extendedLimits;
    updateControlLimits();
    updateControlValues();
    updateProfileOptions();
}

function loadProfile(name) {
    if (!profiles[name]) return;
    currentProfile = name;
    settings = clampSettings(profiles[name]);
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
    if (isFullscreen() && !showFullscreenGUI) return;
    panelOpen = !panelOpen;
    updatePanelVisibility();
    if (panelOpen && isFullscreen() && showFullscreenGUI) {
        panelContent.querySelector("#brightness-range").focus({ preventScroll: true });
    }
}

function isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function updatePanelVisibility() {
    const fullscreen = isFullscreen();
    const visible = panelOpen && (!fullscreen || showFullscreenGUI);
    const modal = visible && fullscreen;
    if (panel.open && panelModal !== modal) {
        panel.close();
        panelModal = false;
    }
    if (visible && !panel.open) {
        if (modal) panel.showModal();
        else panel.show();
        panelModal = modal;
    } else if (!visible && panel.open) {
        panel.close();
        panelModal = false;
    }
    if (visible && modal && panelContent.activeElement === null) {
        panelContent.querySelector("#brightness-range").focus({ preventScroll: true });
    }
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
            if (record.type === "attributes" && record.target.matches(mediaSelector())) {
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

    document.addEventListener("fullscreenchange", updatePanelVisibility);
    document.addEventListener("webkitfullscreenchange", updatePanelVisibility);

    window.addEventListener("keydown", event => {
        const path = event.composedPath();
        const target = path[0];
        const isPanelToggle = !event.isComposing && (
            (event.code === "F8" && !event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) ||
            (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey &&
                (event.code === "Slash" || event.key === "/"))
        );
        if (isPanelToggle) {
            event.preventDefault();
            event.stopImmediatePropagation();
            togglePanel();
            return;
        }
        if (path.includes(panel)) return;
        if (event.isComposing || (target instanceof HTMLElement &&
            (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return;

        let action;
        if (event.code === "F8" && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
            action = () => loadDefaultProfile();
        } else if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey &&
            (event.code === "Period" || event.key === ".")) {
            action = () => cycleProfile(-1);
        } else if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey &&
            (event.code === "Comma" || event.key === ",")) {
            action = () => cycleProfile(1);
        }

        if (action) {
            event.preventDefault();
            event.stopImmediatePropagation();
            action();
        }
    }, true);
}

function loadDefaultProfile() {
    if (profiles.Default && typeof profiles.Default === "object") {
        loadProfile("Default");
    } else {
        profiles.Default = { ...DEFAULT_SETTINGS };
        currentProfile = "Default";
        settings = { ...DEFAULT_SETTINGS };
        updateControlValues();
        updateProfileOptions();
        applyFilters();
        saveState();
    }
}

if (document.body) initialize();
else document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();