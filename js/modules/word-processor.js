import {
    VOWEL_GROUPS,
    ONE_LETTER_VOWELS
} from "./config.js";

export function getActiveVowelGroups(settings) {
    const allowed = Object.entries(settings.allowedVowelGroups || {})
        .filter(([, isAllowed]) => isAllowed)
        .map(([vg]) => vg);
    return [...allowed, ...ONE_LETTER_VOWELS].sort((a, b) => b.length - a.length);
}

function findVowelGroups(word, settings) {
    const activeVowelGroups = getActiveVowelGroups(settings);
    const lower = word.toLowerCase();
    const matches = [];
    let i = 0;
    while (i < lower.length) {
        let found = null;
        for (const vg of activeVowelGroups) {
            if (lower.startsWith(vg, i)) {
                found = vg;
                break;
            }
        }
        if (found) {
            matches.push({
                group: found,
                index: i,
                length: found.length
            });
            i += found.length;
        } else {
            i++;
        }
    }
    return matches;
}

export function analyzeWord(raw, settings) {
    const word = (raw || "").trim();

    // Easter Egg Logic
    if (word.toLowerCase() === "echt he") {
        return {
            ok: true,
            word: "nee nep",
            groups: [],
            uniqueGroups: [],
        };
    }

    if (!/^[A-Za-z\s]+$/.test(word)) return {
        ok: false,
        reason: 'invalid_chars'
    };

    const groups = findVowelGroups(word, settings);
    const uniqueGroups = [...new Set(groups.map((g) => g.group))];

    if (uniqueGroups.length < 2) {
        if (uniqueGroups.length === 0) {
            return {
                ok: false,
                reason: 'no_groups'
            };
        }
        const singleGroup = uniqueGroups[0];

        if (singleGroup.length > 1 && settings.allowedVowelGroups[singleGroup]) {

            const components = singleGroup.split('');
            const allComponentsAreVowels = components.every(char => ONE_LETTER_VOWELS.includes(char));

            if (allComponentsAreVowels) {
                return {
                    ok: false,
                    reason: 'single_group_conflict',
                    conflictingGroup: singleGroup
                };
            }
        }

        return {
            ok: false,
            reason: 'insufficient_groups'
        };
    }

    return {
        ok: true,
        word,
        groups,
        uniqueGroups
    };
}

export function buildNthVariant(n, analysis) {
    const {
        word,
        groups,
        uniqueGroups
    } = analysis;
    if (groups.length === 0) {
        return word;
    }
    const base = uniqueGroups.length;
    let comboVowels = [];
    let tempN = n;
    for (let i = 0; i < groups.length; i++) {
        comboVowels.push(uniqueGroups[tempN % base]);
        tempN = Math.floor(tempN / base);
    }
    let result = "",
        pos = 0;
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        result += word.slice(pos, group.index) + comboVowels[i];
        pos = group.index + group.length;
    }
    result += word.slice(pos);
    return result;
}

export function checkAllWordsExist(analysis, wordlist) {
    if (!wordlist || wordlist.size === 0) return false;
    const count = Math.pow(analysis.uniqueGroups.length, analysis.groups.length);
    if (count > 50000) return false; // Safety check
    for (let i = 0; i < count; i++) {
        const variant = buildNthVariant(i, analysis);
        if (!wordlist.has(variant.toLowerCase())) {
            return false;
        }
    }
    return true;
}