const linkUrl = document.getElementById("link-url");
const wifiSsid = document.getElementById("wifi-ssid");
const wifiSec = document.getElementById("wifi-sec");
const wifiPass = document.getElementById("wifi-pass");
const wifiShow = document.getElementById("wifi-show");
const signupUrl = document.getElementById("su-url");

// other types
const emTo = document.getElementById("em-to");
const emSubject = document.getElementById("em-subject");
const emBody = document.getElementById("em-body");
const phNumber = document.getElementById("ph-number");

// style controls
const shapeOptions = document.getElementById("shape-options");
const fgSwatches = document.getElementById("fg-swatches");
const bgSwatches = document.getElementById("bg-swatches");
const fgSv = document.getElementById("fg-sv");
const fgSvHandle = document.getElementById("fg-sv-handle");
const fgHue = document.getElementById("fg-hue");
const fgPreview = document.getElementById("fg-preview");
const fgHexInput = document.getElementById("fg-hex-input");
const bgCustom = document.getElementById("bg-custom");
const bgHex = document.getElementById("bg-hex");
const colorWarning = document.getElementById("color-warning");
const logoFile = document.getElementById("logo-file");
const logoDrop = document.getElementById("logo-drop");
const logoNote = document.getElementById("logo-note");
const logoRemove = document.getElementById("logo-remove");
const logoSizeWrap = document.getElementById("logo-size-wrap");
const logoSizeInput = document.getElementById("logo-size");

const qrImage = document.getElementById("qr");
const emptyState = document.getElementById("empty");
const downloadButton = document.getElementById("btn-png");
const message = document.getElementById("msg");

const typeOptions = document.querySelectorAll('input[name="qtype"]');
const formFields = document.querySelectorAll(".form-fields");

// Use UTF-8 so emojis and non-English letters scan correctly
if (typeof qrcode !== "undefined" && qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["UTF-8"]) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
}

// Look of the QR code (shape, colors, logo size)
const style = {
    shape: "square",
    fg: "#000000",
    bg: "#ffffff",
    logoScale: 0.22
};

const SHAPES = [
    { id: "square", name: "Square" },
    { id: "rounded", name: "Rounded" },
    { id: "dots", name: "Dots" },
    { id: "drop", name: "Drop" },
    { id: "leaf", name: "Leaf" }
];

const FG_COLORS = ["#000000", "#4c1d95", "#2563eb", "#16a34a", "#dc2626", "#ec4899"];
const BG_COLORS = ["#ffffff", "#fff7d6", "#e0f2fe", "#fce7f3", "#dcfce7", "#f3e8ff", "#111827"];

// Logo uploaded by the user (it replaces the automatic website logo)
let uploadedLogo = null;
let uploadedUrl = "";

let currentCanvas = null;

// Logo shown in the middle of the QR code.
// It stays empty while you are still typing, then the website's logo is added.
let siteLogo = null;
let siteInfo = null;
let siteIsLetter = false;
let siteKey = "";
let siteTimer = 0;
const logoCache = new Map();

// How long to wait after you stop typing before the logo is added (milliseconds)
const LOGO_DELAY = 700;

function getType() {
    const selected = document.querySelector('input[name="qtype"]:checked');
    return selected ? selected.value : "link";
}

// Fixes links typed in a hurry:
// "facebook.com"            -> "https://facebook.com"
// "https/www.youtube.com"   -> "https://www.youtube.com"
function normalizeUrl(value) {
    const text = value.trim();
    if (!text) return "";

    const loose = text.match(/^(https?)(?::\/{0,2}|\/{1,2})/i);

    if (loose) {
        const rest = text.slice(loose[0].length).trim();
        if (!rest) return "";
        return loose[1].toLowerCase() + "://" + rest;
    }

    if (/^[a-z][a-z0-9+.\-]*:/i.test(text)) return text;

    return "https://" + text;
}

function getContent() {
    const type = getType();

    if (type === "link") {
        return normalizeUrl(linkUrl.value);
    }

    if (type === "signup") {
        return normalizeUrl(signupUrl.value);
    }

    if (type === "wifi") {
        const ssid = wifiSsid.value.trim();
        const security = wifiSec.value;
        const password = wifiPass.value;

        if (!ssid) return "";
        if (security !== "nopass" && !password) return "";

        const safeSSID = ssid.replace(/([\\;,:"])/g, "\\$1");
        const safePassword = password.replace(/([\\;,:"])/g, "\\$1");

        return `WIFI:T:${security};S:${safeSSID};P:${security === "nopass" ? "" : safePassword};;`;
    }

    if (type === "email") {
        const to = emTo.value.trim();
        if (!to || !to.includes("@")) return "";

        const parts = [];
        if (emSubject.value.trim()) parts.push("subject=" + encodeURIComponent(emSubject.value.trim()));
        if (emBody.value.trim()) parts.push("body=" + encodeURIComponent(emBody.value.trim()));

        return "mailto:" + to + (parts.length ? "?" + parts.join("&") : "");
    }

    if (type === "phone") {
        const number = cleanPhone(phNumber.value);
        return number ? "tel:" + number : "";
    }

    return "";
}

// "+63 912-345 6789" -> "+639123456789" (needs at least 3 digits)
function cleanPhone(value) {
    const text = value.trim();
    const cleaned = (text.startsWith("+") ? "+" : "") + text.replace(/\D/g, "");
    return cleaned.replace(/\D/g, "").length >= 3 ? cleaned : "";
}

/* ---------- website logo ---------- */

// Websites whose logo name is different from their web address
const SITE_NAMES = {
    "youtu.be": "youtube",
    "fb.com": "facebook",
    "fb.watch": "facebook",
    "fb.me": "facebook",
    "m.me": "messenger",
    "wa.me": "whatsapp",
    "t.me": "telegram",
    "forms.gle": "googleforms",
    "chrome.com": "googlechrome",
    "gmail.com": "gmail",
    "mail.google.com": "gmail",
    "drive.google.com": "googledrive",
    "meet.google.com": "googlemeet",
    "classroom.google.com": "googleclassroom",
    "maps.google.com": "googlemaps",
    "sheets.google.com": "googlesheets",
    "play.google.com": "googleplay",
    "twitter.com": "x",
    "x.com": "x"
};

// For addresses like bbc.co.uk or tcgc.edu.ph, the name is before these parts
const SECOND_LEVEL = ["co", "com", "net", "org", "edu", "gov", "ac"];

function getSite(text) {
    try {
        const url = new URL(text);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;

        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const valid = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && /\.[a-z]{2,}$/.test(host);

        if (!valid) return null;

        const parts = host.split(".");
        let name = parts[parts.length - 2];

        if (parts.length >= 3 && SECOND_LEVEL.includes(name)) {
            name = parts[parts.length - 3];
        }

        // the name people recognize (chrome for chrome.com), used for the first-letter logo
        const label = name;

        if (SITE_NAMES[host]) name = SITE_NAMES[host];
        if (host === "docs.google.com") {
            name = url.pathname.startsWith("/forms") ? "googleforms" : "googledocs";
        }

        return { host: host, name: name, label: label };
    } catch (error) {
        return null;
    }
}

function logoSources(site) {
    return [
        `https://cdn.simpleicons.org/${site.name}`,
        `https://icon.horse/icon/${site.host}`,
        `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(site.host)}`,
        `https://icons.duckduckgo.com/ip3/${site.host}.ico`
    ];
}

function loadImage(url) {
    return new Promise(resolve => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
    });
}

async function findSiteLogo(site) {
    const key = site.host + "|" + site.name;

    if (logoCache.has(key)) return logoCache.get(key);

    for (const url of logoSources(site)) {
        const image = await loadImage(url);
        if (image) {
            logoCache.set(key, image);
            return image;
        }
    }

    logoCache.set(key, null);
    return null;
}

// Used when the website's own logo cannot be loaded:
// a colored square with the first letter of the website (C for chrome.com)
function makeLetterLogo(site) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;

    const ctx = canvas.getContext("2d");
    const colors = ["#6d4aff", "#d6336c", "#0f9d8a", "#e8710a", "#2b6cb0", "#7b3fb8", "#c0392b", "#2f855a"];

    let hash = 0;
    for (const ch of site.label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

    ctx.fillStyle = colors[hash % colors.length];
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 150px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(site.label.charAt(0).toUpperCase(), 128, 138);

    return canvas;
}

function syncSiteLogo() {
    const type = getType();
    const site = (type === "link" || type === "signup") ? getSite(getContent()) : null;
    const key = site ? site.host + "|" + site.name : "";

    // nothing changed in the website part of the link
    if (key === siteKey) return;

    // the website changed (or you are still typing): remove the logo and wait
    siteKey = key;
    siteInfo = site;
    siteLogo = null;
    siteIsLetter = false;
    clearTimeout(siteTimer);

    if (!site) return;

    // add the logo only after you stop typing
    siteTimer = setTimeout(async () => {
        const found = await findSiteLogo(site);

        if (key !== siteKey) return;

        siteLogo = found || makeLetterLogo(site);
        siteIsLetter = !found;
        generateQR();

        if (siteIsLetter) {
            message.textContent = "Your QR code is ready! (This website's own logo could not be loaded, so its first letter is shown.)";
        }
    }, LOGO_DELAY);
}

/* ---------- drawing ---------- */

// Adds a rounded rectangle to the current path.
// r can be one number or [topLeft, topRight, bottomRight, bottomLeft]
function addRoundedRect(ctx, x, y, w, h, r) {
    const max = Math.min(w, h) / 2;
    const radii = (Array.isArray(r) ? r : [r, r, r, r]).map(value => Math.min(value, max));
    const [tl, tr, br, bl] = radii;

    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    addRoundedRect(ctx, x, y, w, h, r);
}

// One small square of the QR code, drawn in the chosen shape
function drawModule(ctx, shape, x, y, u) {
    if (shape === "rounded") {
        roundedRect(ctx, x, y, u, u, u * 0.34);
        ctx.fill();
    } else if (shape === "dots") {
        ctx.beginPath();
        // slightly bigger than the square so neighbouring dots touch (scans better)
        ctx.arc(x + u / 2, y + u / 2, u * 0.58, 0, Math.PI * 2);
        ctx.fill();
    } else if (shape === "drop") {
        roundedRect(ctx, x - u * 0.03, y - u * 0.03, u * 1.06, u * 1.06, [u * 0.4, u * 0.4, 0, u * 0.4]);
        ctx.fill();
    } else if (shape === "leaf") {
        roundedRect(ctx, x - u * 0.03, y - u * 0.03, u * 1.06, u * 1.06, [u * 0.38, 0, u * 0.38, 0]);
        ctx.fill();
    } else {
        ctx.fillRect(x, y, u, u);
    }
}

// Corner radius for the three big corner squares of the QR code
function cornerRadius(shape, size) {
    if (shape === "rounded") return size * 0.26;
    if (shape === "dots") return size / 2;
    if (shape === "drop") return [size * 0.35, size * 0.35, 0, size * 0.35];
    if (shape === "leaf") return [size * 0.4, 0, size * 0.4, 0];
    return 0;
}

function drawFinder(ctx, shape, x, y, u) {
    ctx.beginPath();
    addRoundedRect(ctx, x, y, 7 * u, 7 * u, cornerRadius(shape, 7 * u));
    addRoundedRect(ctx, x + u, y + u, 5 * u, 5 * u, cornerRadius(shape, 5 * u));
    ctx.fill("evenodd");

    roundedRect(ctx, x + 2 * u, y + 2 * u, 3 * u, 3 * u, cornerRadius(shape, 3 * u));
    ctx.fill();
}

function inFinder(row, col, count) {
    return (row < 7 && col < 7) ||
           (row < 7 && col >= count - 7) ||
           (row >= count - 7 && col < 7);
}

function generateQR() {
    const text = getContent();

    syncSiteLogo();
    updateColorWarning();

    if (!text) {
        qrImage.hidden = true;
        emptyState.hidden = false;
        downloadButton.disabled = true;
        currentCanvas = null;
        message.textContent = "Please enter your details.";
        return;
    }

    if (typeof qrcode === "undefined") {
        message.textContent = "QR library not loaded. Check your internet connection.";
        return;
    }

    // An uploaded logo is used first. Otherwise the website's logo is used (links only).
    const logo = uploadedLogo || siteLogo;

    try {
        const qr = qrcode(0, "H");
        qr.addData(text);
        qr.make();

        const count = qr.getModuleCount();
        const quiet = 4;
        const total = count + quiet * 2;
        const unit = Math.max(4, Math.floor(1024 / total));
        const size = unit * total;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = size;
        canvas.height = size;

        ctx.fillStyle = style.bg;
        ctx.fillRect(0, 0, size, size);

        const center = size / 2;
        const logoSize = style.logoScale * count * unit;
        const backing = logoSize + 1.6 * unit;

        ctx.fillStyle = style.fg;

        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (!qr.isDark(row, col)) continue;
                if (inFinder(row, col, count)) continue;

                const x = (quiet + col) * unit;
                const y = (quiet + row) * unit;

                if (logo) {
                    const cx = x + unit / 2;
                    const cy = y + unit / 2;
                    if (Math.abs(cx - center) < backing / 2 && Math.abs(cy - center) < backing / 2) {
                        continue;
                    }
                }

                drawModule(ctx, style.shape, x, y, unit);
            }
        }

        // the three big corner squares
        drawFinder(ctx, style.shape, quiet * unit, quiet * unit, unit);
        drawFinder(ctx, style.shape, (quiet + count - 7) * unit, quiet * unit, unit);
        drawFinder(ctx, style.shape, quiet * unit, (quiet + count - 7) * unit, unit);

        if (logo) {
            ctx.fillStyle = style.bg;
            roundedRect(ctx, center - backing / 2, center - backing / 2, backing, backing, backing * 0.2);
            ctx.fill();

            ctx.save();
            roundedRect(ctx, center - logoSize / 2, center - logoSize / 2, logoSize, logoSize, logoSize * 0.2);
            ctx.clip();

            const imageWidth = logo.naturalWidth || logo.width || 1;
            const imageHeight = logo.naturalHeight || logo.height || 1;
            const scale = Math.min(logoSize / imageWidth, logoSize / imageHeight);
            const w = imageWidth * scale;
            const h = imageHeight * scale;

            ctx.drawImage(logo, center - w / 2, center - h / 2, w, h);
            ctx.restore();
        }

        const dataUrl = canvas.toDataURL("image/png");

        currentCanvas = canvas;

        qrImage.src = dataUrl;
        qrImage.hidden = false;
        emptyState.hidden = true;
        downloadButton.disabled = false;

        message.textContent = "Your QR code is ready!";

    } catch (error) {
        console.error(error);

        // Too much text for one QR code
        const reason = typeof error === "string" ? error : String((error && error.message) || "");
        if (/overflow/i.test(reason)) {
            message.textContent = "That is too long for one QR code. Please use shorter text.";
            return;
        }

        // If the website's logo can't be used, use the first-letter logo instead
        if (!uploadedLogo && siteLogo && !siteIsLetter && siteInfo) {
            logoCache.set(siteKey, null);
            siteLogo = makeLetterLogo(siteInfo);
            siteIsLetter = true;
            generateQR();
            return;
        }

        message.textContent = "Unable to generate QR code. Please try again.";
    }
}

/* ---------- style controls ---------- */

function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
}

function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map(channel => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function updateColorWarning() {
    const ratio = contrastRatio(style.fg, style.bg);

    if (ratio < 3) {
        colorWarning.textContent = "These two colors are too close, so the QR code may not scan. Pick a darker QR color or a lighter background.";
        colorWarning.hidden = false;
    } else if (luminance(style.fg) > luminance(style.bg)) {
        colorWarning.textContent = "Light-on-dark QR codes work on most phones, but some older scanners cannot read them.";
        colorWarning.hidden = false;
    } else {
        colorWarning.hidden = true;
    }
}

function shapeIcon(shape) {
    const cells = [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]];
    const u = 9;
    let parts = "";

    for (const [cx, cy] of cells) {
        const x = 3 + cx * u;
        const y = 3 + cy * u;

        if (shape === "rounded") parts += `<rect x="${x}" y="${y}" width="${u}" height="${u}" rx="3"/>`;
        else if (shape === "dots") parts += `<circle cx="${x + u / 2}" cy="${y + u / 2}" r="${u * 0.47}"/>`;
        else if (shape === "drop") parts += `<path d="M${x + 3.6} ${y}H${x + u - 3.6}A3.6 3.6 0 0 1 ${x + u} ${y + 3.6}V${y + u}H${x + 3.6}A3.6 3.6 0 0 1 ${x} ${y + u - 3.6}V${y + 3.6}A3.6 3.6 0 0 1 ${x + 3.6} ${y}Z"/>`;
        else if (shape === "leaf") parts += `<path d="M${x + 4.5} ${y}H${x + u}V${y + 4.5}A4.5 4.5 0 0 1 ${x + 4.5} ${y + u}H${x}V${y + 4.5}A4.5 4.5 0 0 1 ${x + 4.5} ${y}Z"/>`;
        else parts += `<rect x="${x}" y="${y}" width="${u}" height="${u}"/>`;
    }

    return `<svg viewBox="0 0 36 36" width="34" height="34" fill="currentColor" aria-hidden="true">${parts}</svg>`;
}

function buildShapeOptions() {
    shapeOptions.innerHTML = "";

    SHAPES.forEach(shape => {
        const wrap = document.createElement("div");
        wrap.className = "shape-option";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = "qshape";
        input.id = "shape-" + shape.id;
        input.value = shape.id;
        input.checked = shape.id === style.shape;

        const label = document.createElement("label");
        label.htmlFor = input.id;
        label.innerHTML = shapeIcon(shape.id) + `<span>${shape.name}</span>`;

        input.addEventListener("change", () => {
            style.shape = shape.id;
            generateQR();
        });

        wrap.append(input, label);
        shapeOptions.appendChild(wrap);
    });
}

function buildSwatches(container, colors, key, customInput, hexLabel) {
    function refresh() {
        container.querySelectorAll(".swatch").forEach(button => {
            const active = button.dataset.color === style[key].toLowerCase();
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
        customInput.value = style[key];
        hexLabel.textContent = style[key].toUpperCase();
    }

    colors.forEach(color => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "swatch";
        button.dataset.color = color;
        button.style.background = color;
        button.setAttribute("aria-label", color);
        button.addEventListener("click", () => {
            style[key] = color;
            refresh();
            generateQR();
        });
        container.appendChild(button);
    });

    customInput.addEventListener("input", () => {
        style[key] = customInput.value.toLowerCase();
        refresh();
        generateQR();
    });

    refresh();
}

/* ---------- QR color picker (shade box + hue slider + hex + presets) ---------- */

const pick = { h: 0, s: 0, v: 0 };   // hue 0-360, saturation 0-1, brightness 0-1

function hsvToHex(h, s, v) {
    const f = n => {
        const k = (n + h / 60) % 6;
        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return "#" + [f(5), f(3), f(1)]
        .map(x => Math.round(x * 255).toString(16).padStart(2, "0"))
        .join("");
}

function hexToHsv(hex) {
    const [r, g, b] = hexToRgb(hex).map(x => x / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;

    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }

    return { h: h, s: max === 0 ? 0 : d / max, v: max };
}

function normalizeHex(text) {
    let value = text.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(value)) value = value.split("").map(c => c + c).join("");
    return /^[0-9a-f]{6}$/i.test(value) ? "#" + value.toLowerCase() : "";
}

// Updates everything on screen from pick, then the QR code
function applyPick(skipHexBox) {
    const hex = hsvToHex(pick.h, pick.s, pick.v);
    style.fg = hex;

    fgSv.style.backgroundColor = "hsl(" + pick.h + ", 100%, 50%)";
    fgSvHandle.style.left = pick.s * 100 + "%";
    fgSvHandle.style.top = (1 - pick.v) * 100 + "%";
    fgHue.value = Math.round(pick.h);
    fgPreview.style.background = hex;
    if (!skipHexBox) fgHexInput.value = hex.toUpperCase();

    fgSwatches.querySelectorAll(".swatch").forEach(button => {
        const active = button.dataset.color === hex;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    generateQR();
}

function setPickFromHex(hex) {
    const next = hexToHsv(hex);
    // keep the hue when the color is black, white or gray (the hue is not defined there)
    pick.h = next.s === 0 || next.v === 0 ? pick.h : next.h;
    pick.s = next.s;
    pick.v = next.v;
}

function buildColorPicker() {
    // preset circles
    FG_COLORS.forEach(color => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "swatch";
        button.dataset.color = color;
        button.style.background = color;
        button.setAttribute("aria-label", color);
        button.addEventListener("click", () => {
            setPickFromHex(color);
            applyPick(false);
        });
        fgSwatches.appendChild(button);
    });

    // drag on the shade box
    function moveFromPointer(event) {
        const box = fgSv.getBoundingClientRect();
        if (!box.width || !box.height) return;
        pick.s = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        pick.v = 1 - Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
        applyPick(false);
    }

    fgSv.addEventListener("pointerdown", event => {
        event.preventDefault();
        fgSv.focus();
        if (fgSv.setPointerCapture) fgSv.setPointerCapture(event.pointerId);
        fgSv.dragging = true;
        moveFromPointer(event);
    });
    fgSv.addEventListener("pointermove", event => {
        if (fgSv.dragging) moveFromPointer(event);
    });
    ["pointerup", "pointercancel"].forEach(name => {
        fgSv.addEventListener(name, () => { fgSv.dragging = false; });
    });

    // arrow keys on the shade box
    fgSv.addEventListener("keydown", event => {
        const step = event.shiftKey ? 0.1 : 0.02;
        if (event.key === "ArrowLeft") pick.s = Math.max(0, pick.s - step);
        else if (event.key === "ArrowRight") pick.s = Math.min(1, pick.s + step);
        else if (event.key === "ArrowUp") pick.v = Math.min(1, pick.v + step);
        else if (event.key === "ArrowDown") pick.v = Math.max(0, pick.v - step);
        else return;
        event.preventDefault();
        applyPick(false);
    });

    // hue slider
    fgHue.addEventListener("input", () => {
        pick.h = Number(fgHue.value);
        applyPick(false);
    });

    // hex box: updates while you type a full color, fixes the text when you leave the box
    fgHexInput.addEventListener("input", () => {
        const hex = normalizeHex(fgHexInput.value);
        fgHexInput.classList.toggle("is-invalid", !hex && fgHexInput.value.trim() !== "");
        if (!hex) return;
        setPickFromHex(hex);
        applyPick(true);
    });
    fgHexInput.addEventListener("blur", () => {
        fgHexInput.classList.remove("is-invalid");
        fgHexInput.value = style.fg.toUpperCase();
    });

    setPickFromHex(style.fg);
    applyPick(false);
}

/* ---------- logo upload ---------- */

function setUploadedLogo(file) {
    if (!file) return;

    const okTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!okTypes.includes(file.type)) {
        message.textContent = "Please upload a PNG, JPG, SVG or WebP image.";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        message.textContent = "That image is too big. Please use one under 5 MB.";
        return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
        uploadedUrl = url;
        uploadedLogo = image;

        logoNote.textContent = "Logo added: " + file.name;
        logoRemove.hidden = false;
        logoSizeWrap.hidden = false;
        generateQR();
    };

    image.onerror = () => {
        URL.revokeObjectURL(url);
        message.textContent = "That image could not be opened. Please try another file.";
    };

    image.src = url;
}

function removeUploadedLogo() {
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    uploadedUrl = "";
    uploadedLogo = null;
    logoFile.value = "";

    logoNote.textContent = "No logo yet. Upload one to put it in the middle of the code.";
    logoRemove.hidden = true;
    logoSizeWrap.hidden = true;
    generateQR();
}

/* ---------- events ---------- */

typeOptions.forEach(option => {
    option.addEventListener("change", () => {
        formFields.forEach(field => {
            field.hidden = field.dataset.type !== option.value;
        });

        generateQR();
    });
});

[
    linkUrl, wifiSsid, wifiSec, wifiPass, signupUrl,
    emTo, emSubject, emBody, phNumber
].forEach(input => {
    if (input) {
        input.addEventListener("input", generateQR);
        input.addEventListener("change", generateQR);
    }
});

if (wifiShow) {
    wifiShow.addEventListener("change", () => {
        wifiPass.type = wifiShow.checked ? "text" : "password";
    });
}

downloadButton.addEventListener("click", () => {
    if (!currentCanvas) {
        message.textContent = "Please generate a QR code first.";
        return;
    }

    const link = document.createElement("a");
    link.download = "QR-Studio.png";
    link.href = currentCanvas.toDataURL("image/png");
    link.click();

    message.textContent = "QR code downloaded!";
});

formFields.forEach(field => {
    field.hidden = field.dataset.type !== "link";
});

/* logo upload events */
logoFile.addEventListener("change", () => setUploadedLogo(logoFile.files[0]));
logoRemove.addEventListener("click", removeUploadedLogo);

["dragenter", "dragover"].forEach(name => {
    logoDrop.addEventListener(name, event => {
        event.preventDefault();
        logoDrop.classList.add("is-dragging");
    });
});

["dragleave", "drop"].forEach(name => {
    logoDrop.addEventListener(name, event => {
        event.preventDefault();
        logoDrop.classList.remove("is-dragging");
    });
});

logoDrop.addEventListener("drop", event => {
    const file = event.dataTransfer && event.dataTransfer.files[0];
    setUploadedLogo(file);
});

logoSizeInput.addEventListener("input", () => {
    style.logoScale = Number(logoSizeInput.value) / 100;
    generateQR();
});

buildShapeOptions();
buildColorPicker();
buildSwatches(bgSwatches, BG_COLORS, "bg", bgCustom, bgHex);
updateColorWarning();

message.textContent = "Enter your details to create a QR code.";