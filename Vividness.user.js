// ==UserScript==
// @name Vividness
// @author Domintes
// @namespace https://github.com/Domintes
// @icon https://i.ibb.co/0yMPW52Q/icon-64.png
// @version 1.0
// @license MIT
// @match *://*/*
// @grant none
// @description Vividness is a user script which adds possibility for user changing parameter values of videos and images to adjust brightness, contrast or saturation.
// @downloadURL https://update.greasyfork.org/scripts/602207/Vividness.user.js
// @updateURL https://update.greasyfork.org/scripts/602207/Vividness.meta.js
// ==/UserScript==

(function() {

let settings = {
    brightness: 1,
    contrast: 1,
    saturate: 1
};

function applyFilters() {
    document.querySelectorAll('video').forEach(v => {
        v.style.filter =
            `brightness(${settings.brightness})
             contrast(${settings.contrast})
             saturate(${settings.saturate})`;
    });
}

const panel = document.createElement("div");
panel.innerHTML = `
<div style="
position:fixed;
top:20px;
right:20px;
background:#111;
color:white;
padding:15px;
z-index:999999;
border-radius:10px;
display:none;
font-family:sans-serif;">
Brightness
<input id="b" type="range" min="0" max="3" step="0.1" value="1"><br>
Contrast
<input id="c" type="range" min="0" max="3" step="0.1" value="1"><br>
Saturation
<input id="s" type="range" min="0" max="5" step="0.1" value="1">
</div>`;

document.body.appendChild(panel);

["b","c","s"].forEach(id=>{
    panel.querySelector("#"+id).addEventListener("input",()=>{
        settings.brightness = +panel.querySelector("#b").value;
        settings.contrast = +panel.querySelector("#c").value;
        settings.saturate = +panel.querySelector("#s").value;
        applyFilters();
    });
});

window.addEventListener("keydown", e => {
    if (e.key === "F8") {
        panel.firstElementChild.style.display =
            panel.firstElementChild.style.display === "none" ? "block" : "none";
    }
});

})();