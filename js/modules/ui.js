import * as DOM from "./dom.js";
import {
    VOWEL_GROUPS,
    DEFAULT_SETTINGS,
    DEFAULT_VOWEL_MASK,
    ITEMS_PER_PAGE,
} from "./config.js";
import * as Visualizer from "./three-visualizer.js";

let onSpeakSingleCallback;

export function setSpeakSingleCallback(callback) {
    onSpeakSingleCallback = callback;
}

export function morphTitle() {
    const morphStates = [
        "morph-state-barend",
        "morph-state-barand",
        "morph-state-berand",
        "morph-state-berend",
    ];
    let currentMorphState = 0;
    DOM.title.classList.add(morphStates[currentMorphState]);
    setInterval(() => {
        DOM.title.classList.remove(morphStates[currentMorphState]);
        currentMorphState = (currentMorphState + 1) % morphStates.length;
        DOM.title.classList.add(morphStates[currentMorphState]);
    }, 2000);
}

export function showErrorModal(getActiveVowelGroups) {
    DOM.validVowelsList.textContent = getActiveVowelGroups().join(" ");
    if (!DOM.modal.open) DOM.modal.showModal();
    const u = new SpeechSynthesisUtterance("Neehee");
    const voices = speechSynthesis.getVoices() || [];
    const dutchVoice =
        voices.find((v) => /^nl(-|$)/i.test(v.lang)) ||
        voices.find((v) => /dutch|nederlands/i.test(v.name));
    if (dutchVoice) u.voice = dutchVoice;
    u.lang = "nl-NL";
    u.rate = 1;
    u.pitch = 0.9;
    speechSynthesis.speak(u);
}

export function showWarningModal(check) {
    const numGroups = check.uniqueGroups.length;
    const estimatedTotal = Math.pow(numGroups, check.groups.length);
    DOM.warningModalText.textContent = `Je staat op het punt een ${numGroups}D hyperkubus te genereren met ${estimatedTotal.toLocaleString("nl-NL")} combinaties in 3D-modus. Dit kan erg traag zijn of de browser laten crashen. Weet je het zeker?`;
    DOM.warningModal.showModal();
}

export function clearActiveHighlights() {
    document
        .querySelectorAll(".cell.active, .cell.valid, .cell.invalid")
        .forEach((el) => el.classList.remove("active", "valid", "invalid"));
    document
        .querySelectorAll(".grid-item-container.show-def-btn")
        .forEach((el) => el.classList.remove("show-def-btn"));
    Visualizer.wordButtons.forEach((button) => {
        if (button.userData && button.userData.baseMaterial) {
            button.children[0].material = button.userData.baseMaterial;
        }
    });
}

function fitText(el) {
    const maxFontSize = 32;
    const minFontSize = 10;
    let fontSize = maxFontSize;
    el.style.fontSize = fontSize + "px";
    el.style.whiteSpace = "nowrap";
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
    const parentWidth = el.clientWidth;
    const parentHeight = el.clientHeight;
    while (
        (el.scrollWidth > parentWidth || el.scrollHeight > parentHeight) &&
        fontSize > minFontSize
    ) {
        fontSize -= 1;
        el.style.fontSize = fontSize + "px";
    }
}

function renderVirtualizedGrid(wordObjects) {
    const columns = 2,
        gap = 14,
        rowHeight = 72,
        buffer = 4;
    DOM.canvasContainer.style.display = "none";
    DOM.grid.style.display = "block";
    DOM.grid.innerHTML = "";
    const gridWidth = DOM.grid.clientWidth;
    const cellWidth = (gridWidth - (columns - 1) * gap) / columns;
    const totalRows = Math.ceil(wordObjects.length / columns);
    DOM.grid.style.position = "relative";
    DOM.grid.style.height = `${totalRows * rowHeight + (totalRows - 1) * gap}px`;
    const pool = {};

    function renderVisible() {
        const scrollTop = DOM.grid.scrollTop;
        const clientHeight = DOM.grid.clientHeight;
        const rowSize = rowHeight + gap;
        const firstRow = Math.max(0, Math.floor(scrollTop / rowSize) - buffer);
        const lastRow = Math.min(
            totalRows,
            Math.ceil((scrollTop + clientHeight) / rowSize) + buffer,
        );
        const newStart = firstRow * columns;
        const newEnd = Math.min(wordObjects.length, lastRow * columns);

        for (let k in pool) {
            const i = parseInt(k);
            if (i < newStart || i >= newEnd) {
                if (DOM.grid.contains(pool[i])) DOM.grid.removeChild(pool[i]);
                delete pool[i];
            }
        }
        for (let i = newStart; i < newEnd; i++) {
            if (!pool[i]) {
                const wordObject = wordObjects[i];
                if (!wordObject) continue;
                const row = Math.floor(i / columns),
                    col = i % columns;

                // 1. Create a container for the cell and button
                const container = document.createElement("div");
                container.className = "grid-item-container";
                container.dataset.index = wordObject.index; // --- MODIFIED ---
                container.style.position = "absolute";
                container.style.top = `${row * (rowHeight + gap)}px`;
                container.style.left = `${col * (cellWidth + gap)}px`;
                container.style.width = `${cellWidth}px`;
                container.style.height = `${rowHeight}px`;

                // 2. Create the original cell
                const cell = document.createElement("div");
                cell.className = "cell";
                cell.dataset.index = wordObject.index; // Keep this for the click listener logic
                cell.dataset.word = wordObject.word; // Add word data
                cell.textContent = wordObject.word;
                // (Note: no positioning styles on the cell itself anymore)

                // 3. Create the definition button
                const defBtn = document.createElement("button");
                defBtn.className = "btn-tiny def-btn";
                defBtn.textContent = "i";
                defBtn.title = "Toon betekenis";
                defBtn.dataset.word = wordObject.word;

                // 4. Add cell and button to the container
                container.appendChild(cell);
                container.appendChild(defBtn);

                // 5. Add ONE click listener to the container (event delegation)
                container.addEventListener("click", (e) => {
                    const word = cell.dataset.word; // Get word from cell

                    if (e.target.classList.contains('def-btn')) {
                        // Clicked the 'i' button
                        e.stopPropagation(); // Stop it from triggering the speak
                        if (window.handleDefinitionClick) {
                            window.handleDefinitionClick(word);
                        }
                    } else {
                        // Clicked the cell itself
                        onSpeakSingleCallback(word, cell);
                    }
                });

                DOM.grid.appendChild(container); // Add container to grid
                fitText(cell);
                pool[i] = container; // Add container to pool
            }
        }
    }
    DOM.grid.onscroll = renderVisible;
    renderVisible();
    DOM.grid._scrollToIndex = (localPageIndex) => {
        const targetRow = Math.floor(localPageIndex / columns);
        const rowSize = rowHeight + gap;
        const y = targetRow * rowSize;
        const offset = DOM.grid.clientHeight / 2 - rowHeight / 2;
        DOM.grid.scrollTo({
            top: y - offset,
            behavior: "smooth"
        });
    };
}

export function renderGrid(wordObjects, N, settings, on3DClick) {
    if (settings.enable3d && N >= 3 && wordObjects.length <= ITEMS_PER_PAGE) {
        DOM.grid.style.display = "none";
        DOM.canvasContainer.style.display = "block";
        Visualizer.render3DVisualization(wordObjects, N, on3DClick);
    } else {
        DOM.grid.style.display = "block";
        renderVirtualizedGrid(wordObjects);
    }
}

export function updatePaginationControls(
    currentPage,
    totalCombinations,
    itemsPerPage,
) {
    const totalPages = Math.ceil(totalCombinations / itemsPerPage);
    DOM.prevPageBtn.disabled = currentPage <= 1;
    DOM.nextPageBtn.disabled = currentPage >= totalPages;
    DOM.prevPageBtn.style.opacity = DOM.prevPageBtn.disabled ? 0.4 : 1;
    DOM.nextPageBtn.style.opacity = DOM.nextPageBtn.disabled ? 0.4 : 1;

    DOM.comboCount.textContent = `${totalCombinations.toLocaleString("nl-NL")} combinaties`;
    DOM.pageIndicator.textContent = `Pagina ${currentPage} / ${totalPages.toLocaleString("nl-NL")}`;

    const showPaginationElements = totalPages > 1;
    DOM.pageIndicator.style.display = showPaginationElements ? "inline" : "none";
    DOM.prevPageBtn.style.display = showPaginationElements ?
        "inline-flex" :
        "none";
    DOM.nextPageBtn.style.display = showPaginationElements ?
        "inline-flex" :
        "none";
}

export function populateVowelOptions() {
    DOM.vowelGroupGrid.innerHTML = "";
    VOWEL_GROUPS.forEach((vg) => {
        const id = `vowel-toggle-${vg}`;
        const item = document.createElement("div");
        item.className = "vowel-group-item";
        item.innerHTML = `<label for="${id}">${vg}</label><input type="checkbox" id="${id}" data-vowel-group="${vg}" class="toggle-switch">`;
        DOM.vowelGroupGrid.appendChild(item);
    });
}

export function populateLanguageOptions(settings) {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const langDisplayNames = new Intl.DisplayNames(["nl"], {
        type: "language"
    });
    const uniqueLangs = [
        ...new Map(voices.map((v) => [v.lang, v])).values(),
    ].sort((a, b) => a.lang.localeCompare(b.lang));
    const savedLang = settings.language;
    DOM.languageSelect.innerHTML = "";
    uniqueLangs.forEach((voice) => {
        if (!voice || !voice.lang) return;
        const option = document.createElement("option");
        option.value = voice.lang;
        try {
            option.textContent = `${langDisplayNames.of(voice.lang.split("-")[0])} (${voice.lang})`;
        } catch (e) {
            option.textContent = voice.lang;
        }
        DOM.languageSelect.appendChild(option);
    });
    if ([...DOM.languageSelect.options].some((o) => o.value === savedLang)) {
        DOM.languageSelect.value = savedLang;
    } else {
        const dutchVoice = uniqueLangs.find((v) => v.lang.startsWith("nl"));
        if (dutchVoice) DOM.languageSelect.value = dutchVoice.lang;
    }
    settings.language = DOM.languageSelect.value;
}

export function applySettings(newSettings) {
    const settings = {
        ...DEFAULT_SETTINGS,
        ...newSettings
    };
    settings.allowedVowelGroups = {
        ...DEFAULT_SETTINGS.allowedVowelGroups,
        ...(settings.allowedVowelGroups || {}),
    };
    DOM.enable3dCheckbox.checked = settings.enable3d;
    DOM.enableValidationHighlightCheckbox.checked =
        settings.enableValidationHighlight;

    if (DOM.languageSelect.options.length > 0) {
        const targetLang = settings.language;
        const optionExists = [...DOM.languageSelect.options].some(
            (o) => o.value === targetLang,
        );

        if (optionExists) {
            DOM.languageSelect.value = targetLang;
        } else {
            const dutchOption = [...DOM.languageSelect.options].find((o) =>
                o.value.startsWith("nl"),
            );
            if (dutchOption) {
                DOM.languageSelect.value = dutchOption.value;
            }
        }
    }
    settings.language = DOM.languageSelect.value;

    DOM.pitchSlider.value = settings.pitch;
    DOM.rateSlider.value = settings.rate;
    DOM.vowelOptionsDetails.open = settings.vowelOptionsExpanded;
    DOM.voiceOptionsDetails.open = settings.voiceOptionsExpanded;
    Object.entries(settings.allowedVowelGroups).forEach(([vg, isAllowed]) => {
        const toggle = document.getElementById(`vowel-toggle-${vg}`);
        if (toggle) toggle.checked = isAllowed;
    });
    updateSliderValues();
    return settings;
}

export function loadSettings() {
    const saved = localStorage.getItem("barendGenSettings");
    const loadedSettings = saved ? JSON.parse(saved) : {
        ...DEFAULT_SETTINGS
    };
    return applySettings(loadedSettings);
}

export function updateSliderValues() {
    DOM.pitchValueSpan.textContent = parseFloat(DOM.pitchSlider.value).toFixed(2);
    DOM.rateValueSpan.textContent = parseFloat(DOM.rateSlider.value).toFixed(2);
}

export function compressSettings(settings) {
    const compressed = {};
    if (settings.enable3d !== DEFAULT_SETTINGS.enable3d)
        compressed.d = settings.enable3d ? 1 : 0;
    if (settings.enableValidationHighlight) compressed.h = 1;
    if (settings.vowelOptionsExpanded !== DEFAULT_SETTINGS.vowelOptionsExpanded)
        compressed.e = settings.vowelOptionsExpanded ? 1 : 0;
    if (settings.voiceOptionsExpanded !== DEFAULT_SETTINGS.voiceOptionsExpanded)
        compressed.o = settings.voiceOptionsExpanded ? 1 : 0;
    if (settings.pitch !== DEFAULT_SETTINGS.pitch) compressed.p = settings.pitch;
    if (settings.rate !== DEFAULT_SETTINGS.rate) compressed.r = settings.rate;
    if (settings.language !== DEFAULT_SETTINGS.language)
        compressed.l = settings.language;
    let mask = 0;
    VOWEL_GROUPS.forEach((vowel, index) => {
        if (settings.allowedVowelGroups[vowel]) mask |= 1 << index;
    });
    if (mask !== DEFAULT_VOWEL_MASK) compressed.v = mask;
    return compressed;
}

export function decompressSettings(compressed) {
    const decompressed = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (compressed.d !== undefined) decompressed.enable3d = compressed.d === 1;
    if (compressed.h !== undefined)
        decompressed.enableValidationHighlight = compressed.h === 1;
    if (compressed.e !== undefined)
        decompressed.vowelOptionsExpanded = compressed.e === 1;
    if (compressed.o !== undefined)
        decompressed.voiceOptionsExpanded = compressed.o === 1;
    if (compressed.p !== undefined) decompressed.pitch = compressed.p;
    if (compressed.r !== undefined) decompressed.rate = compressed.r;
    if (compressed.l !== undefined) decompressed.language = compressed.l;
    const mask = compressed.v !== undefined ? compressed.v : DEFAULT_VOWEL_MASK;
    const allowed = {};
    VOWEL_GROUPS.forEach((vowel, index) => {
        allowed[vowel] = (mask & (1 << index)) !== 0;
    });
    decompressed.allowedVowelGroups = allowed;
    return decompressed;
}

export function getSettingsFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const settingsFromUrl = urlParams.get("s");
    if (settingsFromUrl) {
        try {
            const decodedSettings = atob(decodeURIComponent(settingsFromUrl));
            const compressed = JSON.parse(decodedSettings);
            return decompressSettings(compressed);
        } catch (e) {
            console.error("Failed to parse settings from URL.", e);
            return null;
        }
    }
    return null;
}

export function showVowelConflictModal(group) {
    const components = group.split('');
    DOM.vowelConflictModalText.innerHTML = `Het woord bevat de klinkergroep "<b>${group}</b>". <br><br>Wil je de klinkergroep "<b>${group}</b>" als losse klinkers behandelen (bijv. "<b>${components.join('</b>" en "<b>')}</b>")? Je kunt dit in the instellingen terugveranderen.`;
    if (!DOM.vowelConflictModal.open) {
        DOM.vowelConflictModal.showModal();
    }
}
export function showDefinitionModal(word) {
    DOM.definitionModalTitle.textContent = `Betekenis: "${word}"`;
    DOM.definitionContent.innerHTML = ""; // Clear old content
    DOM.definitionLoading.style.display = "block";
    if (!DOM.definitionModal.open) {
        DOM.definitionModal.showModal();
    }
}

export function setDefinitionLoading(isLoading) {
    DOM.definitionLoading.style.display = isLoading ? "block" : "none";
}

export function displayDefinition(htmlContent) {
    DOM.definitionContent.innerHTML = htmlContent;
}