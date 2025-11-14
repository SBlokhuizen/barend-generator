import * as DOM from "./modules/dom.js";
import { DEFAULT_SETTINGS, ITEMS_PER_PAGE } from "./modules/config.js";
import * as Audio from "./modules/audio.js";
import * as UI from "./modules/ui.js";
import * as WordProcessor from "./modules/word-processor.js";
import { startBouncingAnimation } from "./modules/animation.js";
import * as Visualizer from "./modules/three-visualizer.js";

// --- App State ---
let settings = {};
let wordlist = new Set();
let currentAnalysis = {};
let totalCombinations = 0;
let currentPage = 1;
let combinationOrder = [];
let speaking = false;
let currentPlaybackId = null;
let _pendingSpoilerReveal = null;
let _pendingAnalysis = null;
let _pendingVowelConflict = null;
let definitionsLoaded = false;

// --- Utility Functions ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- Core Functions ---
function saveSettings() {
  settings.enable3d = DOM.enable3dCheckbox.checked;
  settings.enableValidationHighlight =
    DOM.enableValidationHighlightCheckbox.checked;
  settings.language = DOM.languageSelect.value;
  settings.pitch = parseFloat(DOM.pitchSlider.value);
  settings.rate = parseFloat(DOM.rateSlider.value);
  settings.vowelOptionsExpanded = DOM.vowelOptionsDetails.open;
  settings.voiceOptionsExpanded = DOM.voiceOptionsDetails.open;
  const newAllowed = {};
  DOM.vowelGroupGrid.querySelectorAll(".toggle-switch").forEach((toggle) => {
    newAllowed[toggle.dataset.vowelGroup] = toggle.checked;
  });
  settings.allowedVowelGroups = newAllowed;
  localStorage.setItem("barendGenSettings", JSON.stringify(settings));
  DOM.validVowelsList.textContent =
    WordProcessor.getActiveVowelGroups(settings).join(" ");
}

function speakSingle(word, element) {
  currentPlaybackId = Audio.stopSpeech(true);
  speaking = false;
  UI.clearActiveHighlights();

  let highlightClass = "active";
  let highlightMaterial = Visualizer.getMaterials().activeMaterial;

  if (settings.enableValidationHighlight && wordlist.size > 0) {
    const isValid = wordlist.has(word.toLowerCase());
    highlightClass = isValid ? "valid" : "invalid";
    highlightMaterial = isValid
      ? Visualizer.getMaterials().validMaterial
      : Visualizer.getMaterials().invalidMaterial;
  }

  if (element.userData && element.userData.baseMaterial) {
    // 3D Object
    const originalMaterial = element.userData.baseMaterial;
    element.children[0].material = highlightMaterial;
    Audio.speakWord(word, settings, () => {
      if (element && element.children[0]) {
        element.children[0].material = originalMaterial;
      }
    });
  } else {
    // 2D Element
    element.classList.add(highlightClass);
    Audio.speakWord(word, settings, () => {
      element.classList.remove("active", "valid", "invalid");
    });
  }
}

function displayPage(page) {
  const totalPages = Math.ceil(totalCombinations / ITEMS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;

  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalCombinations);
  const pageObjects = [];
  for (let i = startIndex; i < endIndex; i++) {
    const originalIndex = combinationOrder[i];
    pageObjects.push({
      word: WordProcessor.buildNthVariant(originalIndex, currentAnalysis),
      index: i,
    });
  }

  UI.renderGrid(
    pageObjects,
    currentAnalysis.uniqueGroups.length,
    settings,
    speakSingle,
  );
  UI.updatePaginationControls(currentPage, totalCombinations, ITEMS_PER_PAGE);
}

function proceedWithGeneration() {
  currentAnalysis = _pendingAnalysis;
  currentAnalysis.settingsSnapshot = JSON.stringify(
    WordProcessor.getActiveVowelGroups(settings),
  );
  totalCombinations = Math.pow(
    currentAnalysis.uniqueGroups.length,
    currentAnalysis.groups.length,
  );
  combinationOrder = Array.from({ length: totalCombinations }, (_, i) => i);

  const isBarendroom = WordProcessor.checkAllWordsExist(
    currentAnalysis,
    wordlist,
  );

  DOM.outputCard.style.display = "block";
  DOM.paginationControls.style.display =
    totalCombinations > 0 ? "flex" : "none";
  DOM.randomizeBtn.style.display =
    totalCombinations > 1 ? "inline-flex" : "none";

  displayPage(1);

  if (settings.enableValidationHighlight && wordlist.size > 0) {
    playPaginatedTwoPass(isBarendroom);
  } else {
    playCurrentPage(isBarendroom);
  }
  _pendingAnalysis = null;
}

function handleFormSubmit(e) {
  if (e) e.preventDefault();
  const newWord = DOM.input.value.trim();
  const currentActiveVowels = JSON.stringify(
    WordProcessor.getActiveVowelGroups(settings),
  );

  if (
    currentAnalysis.ok &&
    newWord.toLowerCase() === currentAnalysis.word.toLowerCase() &&
    currentAnalysis.settingsSnapshot === currentActiveVowels
  ) {
    if (totalCombinations > 0) {
      const isBarendroom = WordProcessor.checkAllWordsExist(
        currentAnalysis,
        wordlist,
      );
      if (settings.enableValidationHighlight && wordlist.size > 0) {
        playPaginatedTwoPass(isBarendroom);
      } else {
        playCurrentPage(isBarendroom);
      }
    }
  } else {
    const check = WordProcessor.analyzeWord(newWord, settings);
    
    if (!check.ok) {
      if (check.reason === 'single_group_conflict') {
        _pendingVowelConflict = check.conflictingGroup;
        UI.showVowelConflictModal(check.conflictingGroup);
      } else {
        UI.showErrorModal(() => WordProcessor.getActiveVowelGroups(settings));
      }
      return;
    }
    if (settings.enable3d && check.uniqueGroups.length > 3) {
      _pendingAnalysis = check;
      UI.showWarningModal(check);
    } else {
      _pendingAnalysis = check;
      proceedWithGeneration();
    }
  }
}

function playCurrentPage(isBarendroom) {
  currentPlaybackId = Audio.stopSpeech(true);
  const playbackId = Date.now();
  currentPlaybackId = playbackId;
  speaking = true;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const wordsOnPage = [];
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalCombinations);
  for (let i = startIndex; i < endIndex; i++) {
    const originalIndex = combinationOrder[i];
    wordsOnPage.push(
      WordProcessor.buildNthVariant(originalIndex, currentAnalysis),
    );
  }

  const step = (idx) => {
    if (currentPlaybackId !== playbackId || !speaking) {
      UI.clearActiveHighlights();
      if (currentPlaybackId === null) speaking = false;
      return;
    }
    if (idx >= wordsOnPage.length) {
      UI.clearActiveHighlights();
      const totalPages = Math.ceil(totalCombinations / ITEMS_PER_PAGE);
      if (speaking && currentPage < totalPages) {
        currentPage++;
        displayPage(currentPage);
        setTimeout(() => playCurrentPage(isBarendroom), 250);
      } else if (isBarendroom) {
        speaking = false;
        const cellsToBounce = Array.from(DOM.grid.querySelectorAll(".cell"));
        setTimeout(
          () =>
            startBouncingAnimation(cellsToBounce, settings, () => {
              DOM.outputCard.style.display = "block";
              displayPage(1);
            }),
          200,
        );
      } else {
        speaking = false;
      }
      return;
    }

    const word = wordsOnPage[idx];
    const globalIndex = startIndex + idx;
    UI.clearActiveHighlights();

    if (settings.enable3d && DOM.canvasContainer.style.display !== "none") {
      const button = Visualizer.wordButtons.find(
        (b) => b.userData.index === globalIndex,
      );
      if (button)
        button.children[0].material = Visualizer.getMaterials().activeMaterial;
    } else if (DOM.grid.style.display !== "none") {
      if (DOM.grid._scrollToIndex) DOM.grid._scrollToIndex(idx);
      const highlightWhenVisible = (attempt = 0) => {
        if (attempt > 15) return;
        const cell = DOM.grid.querySelector(`[data-index='${globalIndex}']`);
        if (cell) cell.classList.add("active");
        else requestAnimationFrame(() => highlightWhenVisible(attempt + 1));
      };
      highlightWhenVisible();
    }
    Audio.speakWord(word, settings, () => step(idx + 1));
  };
  step(0);
}

function playPaginatedTwoPass(isBarendroom) {
  currentPlaybackId = Audio.stopSpeech(true);
  const playbackId = Date.now();
  currentPlaybackId = playbackId;
  speaking = true;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalCombinations);
  const wordsOnPage = [];
  for (let i = startIndex; i < endIndex; i++) {
    const originalIndex = combinationOrder[i];
    wordsOnPage.push(
      WordProcessor.buildNthVariant(originalIndex, currentAnalysis),
    );
  }

  const is3D =
    settings.enable3d && DOM.canvasContainer.style.display !== "none";

  const executeSpeakingPass = (onComplete) => {
    let index = 0;
    const step = () => {
      if (currentPlaybackId !== playbackId || !speaking) {
        UI.clearActiveHighlights();
        if (currentPlaybackId === null) speaking = false;
        return;
      }
      if (index >= wordsOnPage.length) {
        UI.clearActiveHighlights();
        onComplete();
        return;
      }
      const word = wordsOnPage[index];
      const globalIndex = startIndex + index;
      UI.clearActiveHighlights();

      if (is3D) {
        const button = Visualizer.wordButtons.find(
          (b) => b.userData.index === globalIndex,
        );
        if (button)
          button.children[0].material =
            Visualizer.getMaterials().activeMaterial;
      } else {
        if (DOM.grid._scrollToIndex) DOM.grid._scrollToIndex(index);
        const findAndHighlight = (attempt = 0) => {
          if (attempt > 15) return;
          const cell = DOM.grid.querySelector(`[data-index='${globalIndex}']`);
          if (cell) cell.classList.add("active");
          else requestAnimationFrame(() => findAndHighlight(attempt + 1));
        };
        findAndHighlight();
      }
      Audio.speakWord(word, settings, () => {
        index++;
        step();
      });
    };
    step();
  };

  const executeValidationPass = (onComplete) => {
    let index = 0;
    const step = () => {
      if (currentPlaybackId !== playbackId) return;
      if (index >= wordsOnPage.length) {
        onComplete();
        return;
      }
      const word = wordsOnPage[index];
      const globalIndex = startIndex + index;

      if (is3D) {
        const button = Visualizer.wordButtons.find(
          (b) => b.userData.index === globalIndex,
        );
        if (button)
          button.children[0].material = wordlist.has(word.toLowerCase())
            ? Visualizer.getMaterials().validMaterial
            : Visualizer.getMaterials().invalidMaterial;
      } else {
        if (DOM.grid._scrollToIndex) DOM.grid._scrollToIndex(index);
        const findAndValidate = (attempt = 0) => {
          if (attempt > 15) return;
          const cell = DOM.grid.querySelector(`[data-index='${globalIndex}']`);
          if (cell) {
            const isValid = wordlist.has(word.toLowerCase());
            cell.classList.add(
              isValid ? "valid" : "invalid",
              isValid ? "bounce" : "shake",
            );
            setTimeout(() => cell.classList.remove("bounce", "shake"), 500);
          } else {
            requestAnimationFrame(() => findAndValidate(attempt + 1));
          }
        };
        findAndValidate();
      }
      if (wordlist.has(word.toLowerCase())) Audio.playCorrectSound();
      else Audio.playWrongSound();
      index++;
      setTimeout(step, 500);
    };
    step();
  };

  executeSpeakingPass(() => {
    if (currentPlaybackId !== playbackId) return;
    setTimeout(() => {
      executeValidationPass(() => {
        if (currentPlaybackId !== playbackId) return;
        const totalPages = Math.ceil(totalCombinations / ITEMS_PER_PAGE);
        if (speaking && currentPage < totalPages) {
          currentPage++;
          displayPage(currentPage);
          setTimeout(() => playPaginatedTwoPass(isBarendroom), 250);
        } else if (isBarendroom) {
          speaking = false;
          const cellsToBounce = Array.from(DOM.grid.querySelectorAll(".cell"));
          setTimeout(
            () =>
              startBouncingAnimation(cellsToBounce, settings, () => {
                DOM.outputCard.style.display = "block";
                displayPage(1);
              }),
            200,
          );
        } else {
          speaking = false;
        }
      });
    }, 750);
  });
}

async function loadDefinitions() {
  if (definitionsLoaded) return;
  const container = document.getElementById("definitions-container");
  try {
    const response = await fetch("assets/data/definitions.yaml");
    if (!response.ok)
      throw new Error(`Bestand niet gevonden: ${response.status}`);
    const yamlText = await response.text();
    const data = jsyaml.load(yamlText);
    data.sort((a, b) => a.term.localeCompare(b.term));
    container.innerHTML = "";
    const dl = document.createElement("dl");
    data.forEach((item) => {
      const termId = "def-term-" + item.term.toLowerCase().replace(/\s+/g, "-");
      const dt = document.createElement("dt");
      dt.id = termId;
      dt.textContent = item.term;
      dt.style.fontWeight = "700";
      const dd = document.createElement("dd");
      dd.style.marginLeft = "16px";
      dd.style.marginBottom = "10px";
      const definitionParts = item.definition.split(/(\[\[.*?\]\])/g);
      definitionParts.forEach((part) => {
        const match = part.match(/\[\[(.*?)\]\]/);
        if (match) {
          const link = document.createElement("span");
          link.className = "def-link";
          link.textContent = match[1];
          link.dataset.term = match[1];
          dd.appendChild(link);
        } else {
          dd.appendChild(document.createTextNode(part));
        }
      });
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    container.appendChild(dl);
    definitionsLoaded = true;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--danger);">Kon definities niet laden: ${err.message}</p>`;
  }
}

async function loadLeaderboard() {
  const loading = DOM.leaderboardModal.querySelector("#leaderboard-loading");
  const error = DOM.leaderboardModal.querySelector("#leaderboard-error");
  loading.style.display = "block";
  error.style.display = "none";
  DOM.leaderboardBody.innerHTML = "";
  try {
    const response = await fetch("assets/data/leaderboard.yaml");
    if (!response.ok)
      throw new Error(`Bestand niet gevonden: ${response.status}`);
    const yamlText = await response.text();
    const data = jsyaml.load(yamlText);
    if (!data || data.length === 0) {
      DOM.leaderboardBody.innerHTML =
        '<tr><td colspan="3" style="text-align:center;">Nog geen Barendromen ontdekt!</td></tr>';
      return;
    }
    data.forEach((item) => {
      const row = DOM.leaderboardBody.insertRow();
      row.insertCell(0).textContent = item.date || "N/A";
      row.insertCell(1).textContent = item.discoverer || "Anoniem";
      const wordCell = row.insertCell(2);
      const showBtn = document.createElement("button");
      showBtn.textContent = "Toon";
      showBtn.className = "btn-tiny";
      showBtn.onclick = () => {
        _pendingSpoilerReveal = { cell: wordCell, word: item.word };
        DOM.spoilerWarningModal.showModal();
      };
      wordCell.appendChild(showBtn);
    });
  } catch (err) {
    error.textContent = `Fout bij laden: ${err.message}`;
    error.style.display = "block";
  } finally {
    loading.style.display = "none";
  }
}

async function main() {
  DOM.input.setAttribute("autofocus", "true");
  if (DOM.randomWordBtn) DOM.randomWordBtn.disabled = true;

  UI.morphTitle();
  UI.populateVowelOptions();
  UI.setSpeakSingleCallback(speakSingle);
  Audio.preloadSounds();

  try {
    const response = await fetch("assets/data/wordlist.txt");
    const text = await response.text();
    text.split("\n").forEach((word) => {
      if (word) wordlist.add(word.trim().toLowerCase());
    });
    if (DOM.randomWordBtn) DOM.randomWordBtn.disabled = false;
  } catch (e) {
    console.error("Failed to load wordlist", e);
  }

  const urlSettings = UI.getSettingsFromUrl();
  if (urlSettings) {
    settings = UI.applySettings(urlSettings);
    localStorage.setItem("barendGenSettings", JSON.stringify(settings));
  } else {
    settings = UI.loadSettings();
  }

  UI.populateLanguageOptions(settings);
  speechSynthesis.onvoiceschanged = () => UI.populateLanguageOptions(settings);

  // --- Setup Event Listeners ---
  DOM.form.addEventListener("submit", handleFormSubmit);
  DOM.btnStop.addEventListener("click", () => {
    speaking = false;
    currentPlaybackId = Audio.stopSpeech();
  });
  DOM.randomWordBtn.addEventListener("click", () => {
    if (wordlist.size === 0) return;
    const wordArray = Array.from(wordlist);
    let randomWord,
      attempts = 0;
    while (attempts < 200) {
      const candidate = wordArray[Math.floor(Math.random() * wordArray.length)];
      if (WordProcessor.analyzeWord(candidate, settings).ok) {
        randomWord = candidate;
        break;
      }
      attempts++;
    }
    if (randomWord) {
      DOM.input.value = randomWord;
      handleFormSubmit(new Event("submit"));
    }
  });

  DOM.randomizeBtn.addEventListener("click", () => {
    if (combinationOrder.length > 0) {
      currentPlaybackId = Audio.stopSpeech();
      speaking = false;
      shuffleArray(combinationOrder);
      displayPage(1);
    }
  });

  DOM.prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) displayPage(currentPage - 1);
  });
  DOM.nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(totalCombinations / ITEMS_PER_PAGE);
    if (currentPage < totalPages) displayPage(currentPage + 1);
  });

  DOM.menuToggle.addEventListener("click", () => {
    const isOpen = DOM.controlsContainer.classList.toggle("menu-open");
    DOM.menuToggle.setAttribute("aria-expanded", isOpen);
  });
  document.addEventListener("click", (e) => {
    if (
      !DOM.controlsContainer.contains(e.target) &&
      DOM.controlsContainer.classList.contains("menu-open")
    ) {
      DOM.controlsContainer.classList.remove("menu-open");
      DOM.menuToggle.setAttribute("aria-expanded", false);
    }
  });

  DOM.leaderboardBtn.addEventListener("click", () => {
    DOM.leaderboardModal.showModal();
    if (DOM.leaderboardBody.innerHTML.trim() === "") {
      loadLeaderboard();
    }
  });
  DOM.closeLeaderboardModal.addEventListener("click", () =>
    DOM.leaderboardModal.close(),
  );
  DOM.spoilerCancelBtn.addEventListener("click", () => {
    DOM.spoilerWarningModal.close();
    _pendingSpoilerReveal = null;
  });
  DOM.spoilerConfirmBtn.addEventListener("click", () => {
    if (_pendingSpoilerReveal) {
      const { cell, word } = _pendingSpoilerReveal;
      cell.innerHTML = "";
      const wordSpan = document.createElement("span");
      wordSpan.textContent = word;
      wordSpan.className = "clickable-barendroom";
      wordSpan.onclick = () => {
        DOM.input.value = word;
        DOM.leaderboardModal.close();
        DOM.spoilerWarningModal.close();
        handleFormSubmit();
      };
      cell.appendChild(wordSpan);
    }
    DOM.spoilerWarningModal.close();
    _pendingSpoilerReveal = null;
  });

  DOM.definitionsBtn.addEventListener("click", () => {
    DOM.definitionsModal.showModal();
    loadDefinitions();
  });
  DOM.closeDefinitionsModal.addEventListener("click", () =>
    DOM.definitionsModal.close(),
  );
  document
    .getElementById("definitions-container")
    .addEventListener("click", (e) => {
      if (e.target.classList.contains("def-link")) {
        const term = e.target.dataset.term;
        if (!term) return;
        const targetId = "def-term-" + term.toLowerCase().replace(/\s+/g, "-");
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
          targetElement.classList.add("highlight-def");
          const targetDd = targetElement.nextElementSibling;
          if (targetDd) targetDd.classList.add("highlight-def");
          setTimeout(() => {
            targetElement.classList.remove("highlight-def");
            if (targetDd) targetDd.classList.remove("highlight-def");
          }, 1500);
        }
      }
    });

  DOM.shareBtn.addEventListener("click", async () => {
    const wordToShare = DOM.input.value.trim();

    if (!wordToShare || !currentAnalysis.ok) {
      DOM.input.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-5px)" },
          { transform: "translateX(5px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 300, easing: "ease-in-out" },
      );
      DOM.input.focus();
      return;
    }

    const compressed = UI.compressSettings(settings);
    const baseUrl = window.location.origin + window.location.pathname;
    let shareUrl = `${baseUrl}?word=${encodeURIComponent(wordToShare)}`;
    if (Object.keys(compressed).length > 0) {
      shareUrl += `&s=${encodeURIComponent(btoa(JSON.stringify(compressed)))}`;
    }
    const shareData = {
      title: "Barend Generator",
      text: `Bekijk het Barendogram voor "${wordToShare}"`,
      url: shareUrl,
    };
    try {
      await navigator.share(shareData);
    } catch (err) {
      await navigator.clipboard.writeText(shareUrl);
      const original = DOM.shareBtn.innerHTML;
      DOM.shareBtn.innerHTML = "✅";
      setTimeout(() => (DOM.shareBtn.innerHTML = original), 2000);
    }
  });

  DOM.pageIndicator.addEventListener("click", () => {
    const totalPages = Math.ceil(totalCombinations / ITEMS_PER_PAGE);
    if (totalPages <= 1 || document.getElementById("page-input")) return;
    DOM.pageIndicator.style.display = "none";
    const pageInput = document.createElement("input");
    pageInput.id = "page-input";
    pageInput.type = "number";
    pageInput.value = currentPage;
    pageInput.min = 1;
    pageInput.max = totalPages;
    pageInput.style.cssText = `width: 60px; text-align: center; background: rgba(0,0,0,0.3); border: 1px solid var(--muted); color: var(--text); border-radius: 6px; padding: 2px 4px;`;
    const revert = () => {
      if (pageInput.parentElement)
        pageInput.parentElement.removeChild(pageInput);
      DOM.pageIndicator.style.display = "inline";
    };
    pageInput.onblur = revert;
    pageInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        const newPage = parseInt(pageInput.value);
        if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
          displayPage(newPage);
        }
        revert();
      } else if (e.key === "Escape") {
        revert();
      }
    };
    DOM.paginationControls.insertBefore(pageInput, DOM.randomizeBtn);
    pageInput.focus();
    pageInput.select();
  });

  DOM.optionsBtn.addEventListener("click", () => DOM.optionsModal.showModal());
  DOM.closeOptionsModal.addEventListener("click", () =>
    DOM.optionsModal.close(),
  );
  DOM.helpBtn.addEventListener("click", () =>
    DOM.instructionsModal.showModal(),
  );
  DOM.closeInstructionsModal.addEventListener("click", () =>
    DOM.instructionsModal.close(),
  );
  DOM.closeModal.addEventListener("click", () => DOM.modal.close());

  [
    DOM.enable3dCheckbox,
    DOM.enableValidationHighlightCheckbox,
    DOM.languageSelect,
    DOM.vowelOptionsDetails,
    DOM.voiceOptionsDetails,
  ].forEach((el) => {
    el.addEventListener("change", saveSettings);
    el.addEventListener("toggle", saveSettings);
  });
  [DOM.pitchSlider, DOM.rateSlider].forEach((el) => {
    el.addEventListener("input", () => {
      UI.updateSliderValues();
      saveSettings();
    });
  });
  DOM.resetSettingsBtn.addEventListener("click", () => {
    settings = UI.applySettings({ ...DEFAULT_SETTINGS });
    saveSettings();
  });
  DOM.vowelGroupGrid.addEventListener("change", (e) => {
    if (e.target.matches(".toggle-switch")) saveSettings();
  });
  DOM.vowelsSelectAllBtn.addEventListener("click", () => {
    DOM.vowelGroupGrid
      .querySelectorAll(".toggle-switch")
      .forEach((t) => (t.checked = true));
    saveSettings();
  });
  DOM.vowelsSelectNoneBtn.addEventListener("click", () => {
    DOM.vowelGroupGrid
      .querySelectorAll(".toggle-switch")
      .forEach((t) => (t.checked = false));
    saveSettings();
  });

  DOM.confirmProceedBtn.addEventListener("click", () => {
    DOM.warningModal.close();
    if (_pendingAnalysis) proceedWithGeneration();
  });
  DOM.confirmCancelBtn.addEventListener("click", () => {
    DOM.warningModal.close();
    _pendingAnalysis = null;
  });
  DOM.vowelConflictApplyBtn.addEventListener("click", () => {
    if (_pendingVowelConflict) {
      const toggle = DOM.vowelGroupGrid.querySelector(
        `[data-vowel-group="${_pendingVowelConflict}"]`
      );
      if (toggle) {
        toggle.checked = false;
      }
      
      saveSettings(); 
      _pendingVowelConflict = null;
      DOM.vowelConflictModal.close();
      handleFormSubmit(new Event('submit')); 
    }
  });

  DOM.vowelConflictCancelBtn.addEventListener("click", () => {
    DOM.vowelConflictModal.close();
    _pendingVowelConflict = null;
  });

  const urlParams = new URLSearchParams(window.location.search);
  const wordFromUrl = urlParams.get("word");
  if (wordFromUrl) {
    DOM.input.value = wordFromUrl;
    setTimeout(() => handleFormSubmit(new Event("submit")), 250);
  }
}

main();
