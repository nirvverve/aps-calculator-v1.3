// State-specific "golden numbers"
const GOLDEN_NUMBERS = {
    arizona: { alkalinity: 120, calcium: 400, ph: 7.5, cya: 80, salt: 3200 },
    texas:   { alkalinity: 120, calcium: 400, ph: 7.5, cya: 80, salt: 3200 },
    florida: { alkalinity: 80, calcium: 300, ph: 7.6, cya: 50, salt: 3200 }
};

const FL_THRESHOLDS = { alkalinity: 60, calcium: 200, cya: 30 };

const ALKALINITY_FACTORS = [
    { ppm: 5, factor: 0.7 }, { ppm: 25, factor: 1.4 }, { ppm: 50, factor: 1.7 },
    { ppm: 75, factor: 1.9 }, { ppm: 100, factor: 2.0 }, { ppm: 125, factor: 2.1 },
    { ppm: 150, factor: 2.2 }, { ppm: 200, factor: 2.3 }, { ppm: 250, factor: 2.4 },
    { ppm: 300, factor: 2.5 }, { ppm: 400, factor: 2.6 }, { ppm: 800, factor: 2.9 },
    { ppm: 1000, factor: 3.0 }
];

const CALCIUM_FACTORS = [
    { ppm: 5, factor: 0.3 }, { ppm: 25, factor: 1.0 }, { ppm: 50, factor: 1.3 },
    { ppm: 75, factor: 1.5 }, { ppm: 100, factor: 1.6 }, { ppm: 125, factor: 1.7 },
    { ppm: 150, factor: 1.8 }, { ppm: 200, factor: 1.9 }, { ppm: 250, factor: 2.0 },
    { ppm: 300, factor: 2.1 }, { ppm: 400, factor: 2.2 }, { ppm: 800, factor: 2.5 },
    { ppm: 1000, factor: 2.6 }
];

const TEMP_FACTORS = [
    { temp: 32, factor: 0.1 }, { temp: 37, factor: 0.1 }, { temp: 46, factor: 0.2 },
    { temp: 53, factor: 0.3 }, { temp: 60, factor: 0.4 }, { temp: 66, factor: 0.5 },
    { temp: 76, factor: 0.6 }, { temp: 84, factor: 0.7 }, { temp: 94, factor: 0.8 },
    { temp: 104, factor: 0.9 }, { temp: 128, factor: 1.0 }
];

function getTDSFactor(tds) {
    if (tds <= 800) return 12.1;
    if (tds <= 1500) return 12.2;
    if (tds <= 2900) return 12.3;
    if (tds <= 5500) return 12.4;
    return 12.5;
}

function getFactor(value, table, key = 'ppm') {
    for (let i = 0; i < table.length; i++) {
        if (value <= table[i][key]) return table[i].factor;
    }
    return table[table.length - 1].factor;
}

function formatAmountOzLb(amountOz) {
    if (amountOz > 16) {
        return `${(amountOz / 16).toFixed(2)} lbs`;
    } else {
        return `${amountOz.toFixed(2)} oz`;
    }
}

function formatLbsOz(ounces) {
    const lbs = Math.floor(ounces / 16);
    const oz = ounces % 16;
    let result = '';
    if (lbs > 0) result += `${lbs} lb${lbs > 1 ? 's' : ''}`;
    if (oz > 0 || lbs === 0) {
        if (result) result += ' ';
        result += `${oz.toFixed(2)} oz`;
    }
    return result;
}

function acidDoseFlOzGallons(currentPh, targetPh, poolGallons, alkalinity) {
    if (currentPh <= targetPh) return null;
    const poolFactor = 76 * (poolGallons / 10000);
    const alkFactor = alkalinity / 100;
    const acidFlOz = (currentPh - targetPh) * poolFactor * alkFactor;
    if (acidFlOz <= 0) return null;
    if (acidFlOz < 128) {
        return `${acidFlOz.toFixed(1)} fl oz of 31.45% muriatic acid`;
    } else {
        return `${(acidFlOz / 128).toFixed(2)} gallons (${acidFlOz.toFixed(1)} fl oz) of 31.45% muriatic acid`;
    }
}

function getChlorinePPMDose(freeChlorine, cya) {
    const minFC = cya * 0.05;
    const month = new Date().getMonth();
    let lossFactor;
    if ([10, 11, 0].includes(month)) { // Nov, Dec, Jan
        lossFactor = 1.5;
    } else if ([1, 2].includes(month)) { // Feb, Mar
        lossFactor = 2.0;
    } else if ([3, 4, 8, 9].includes(month)) { // Apr, May, Sep, Oct
        lossFactor = 2.5;
    } else { // Jun, Jul, Aug
        lossFactor = 3.0;
    }
    const uvLoss = lossFactor * 6;
    const calculatedDose = minFC + uvLoss;
    let toBeDosed = calculatedDose - freeChlorine;
    if (toBeDosed < 0) toBeDosed = 0;
    return {
        minFC: minFC,
        lossFactor: lossFactor,
        uvLoss: uvLoss,
        calculatedDose: calculatedDose,
        toBeDosed: toBeDosed
    };
}

function getLiquidChlorineDose(chlorinePPM, poolGallons) {
    const gallons = (chlorinePPM * poolGallons) / (12 * 10000);
    const flOz = gallons * 128;
    return { gallons, flOz };
}

function getCalHypoOunces(chlorinePPM, poolGallons) {
    return chlorinePPM * 2.0 * (poolGallons / 10000);
}

// Helper to bold the quantity and units in a dosing sentence
function boldQuantity(sentence) {
    // This regex matches "Add <quantity and units> of"
    return sentence.replace(/(Add\s+)([\d.,\s\(\)a-zA-Z%]+)(\s+of)/i, function(match, p1, p2, p3) {
        return p1 + '<strong>' + p2.trim() + '</strong>' + p3;
    });
}

// Salt dosing calculation (183 lbs raises 1,000 ppm in 10,000 gallons)
function getSaltDose(current, desired, poolGallons) {
    if (desired <= current) return null;
    const ppmNeeded = desired - current;
    // 183 lbs per 1,000 ppm per 10,000 gal
    const lbsNeeded = (ppmNeeded * poolGallons * 183) / (1000 * 10000);
    const bags = Math.ceil(lbsNeeded / 40);
    return { lbsNeeded, bags };
}

function getDosingAdvice(userValue, targetValue, poolGallons, chemType, alkalinity, state) {
    let advice = "";
    let amount = 0;
    let diff = targetValue - userValue;

    // Florida-specific logic
    if (state === "florida") {
        if (chemType === "alkalinity" && userValue < FL_THRESHOLDS.alkalinity) {
            amount = ((targetValue - userValue) / 10) * 1.5 * (poolGallons / 10000);
            advice = `Add ${amount.toFixed(2)} lbs of sodium bicarbonate to raise alkalinity to ${targetValue} ppm.`;
        }
        if (chemType === "calcium" && userValue < FL_THRESHOLDS.calcium) {
            amount = ((targetValue - userValue) / 10) * 1.25 * (poolGallons / 10000);
            advice = `Add ${amount.toFixed(2)} lbs of calcium chloride to raise calcium hardness to ${targetValue} ppm.`;
        }
        if (chemType === "ph" && Math.abs(diff) >= 0.01) {
            if (diff > 0) {
                amount = (diff / 0.2) * 6 * (poolGallons / 10000);
                advice = `Add ${formatAmountOzLb(amount)} of soda ash to raise pH to ${targetValue}.`;
            } else if (diff < 0) {
                const acidDose = acidDoseFlOzGallons(userValue, targetValue, poolGallons, alkalinity);
                if (acidDose) {
                    advice = `Add ${acidDose} to lower pH to ${targetValue}.`;
                }
            }
        }
        if (chemType === "cya" && userValue <= FL_THRESHOLDS.cya) {
            amount = ((targetValue - userValue) / 10) * 13 * (poolGallons / 10000);
            advice = `Add ${formatAmountOzLb(amount)} of cyanuric acid (stabilizer) to raise CYA to ${targetValue} ppm.`;
        }
        return advice;
    }

    // Default logic for other states
    if (chemType === "alkalinity" && diff > 0) {
        amount = (diff / 10) * 1.5 * (poolGallons / 10000);
        advice = `Add ${amount.toFixed(2)} lbs of sodium bicarbonate to raise alkalinity to ${targetValue} ppm.`;
    }
    if (chemType === "calcium" && diff > 0) {
        amount = (diff / 10) * 1.25 * (poolGallons / 10000);
        advice = `Add ${amount.toFixed(2)} lbs of calcium chloride to raise calcium hardness to ${targetValue} ppm.`;
    }
    if (chemType === "ph") {
        if (diff > 0) {
            amount = (diff / 0.2) * 6 * (poolGallons / 10000);
            advice = `Add ${formatAmountOzLb(amount)} of soda ash to raise pH to ${targetValue}.`;
        } else if (diff < 0) {
            const acidDose = acidDoseFlOzGallons(userValue, targetValue, poolGallons, alkalinity);
            if (acidDose) {
                advice = `Add ${acidDose} to lower pH to ${targetValue}.`;
            }
        }
    }
    if (chemType === "cya" && diff > 0) {
        amount = (diff / 10) * 13 * (poolGallons / 10000);
        advice = `Add ${formatAmountOzLb(amount)} of cyanuric acid (stabilizer) to raise CYA to ${targetValue} ppm.`;
    }
    return advice;
}

function calculateLSI() {
    const state = document.getElementById('state').value;
    const poolGallons = parseFloat(document.getElementById('capacity').value);
    const ph = parseFloat(document.getElementById('ph').value);
    const alkalinity = parseFloat(document.getElementById('alkalinity').value);
    const calcium = parseFloat(document.getElementById('calcium').value);
    const temperature = parseFloat(document.getElementById('temperature').value);
    const tds = parseFloat(document.getElementById('tds').value) || 0;
    const cyanuric = parseFloat(document.getElementById('cyanuric').value) || 0;
    const freeChlorine = parseFloat(document.getElementById('freechlorine').value);

    // Salt generator fields
    const saltCurrent = parseFloat(document.getElementById('salt-current').value) || 0;
    const saltDesired = parseFloat(document.getElementById('salt-desired').value) || 0;

    const resultsElement = document.getElementById('results');

    if (
        isNaN(poolGallons) || isNaN(ph) || isNaN(alkalinity) || isNaN(calcium) || isNaN(temperature) || isNaN(cyanuric) || isNaN(freeChlorine)
    ) {
        resultsElement.innerHTML = '<p class="error">Please fill in all required fields.</p>';
        return;
    }

    let correctedAlkalinity = alkalinity - (cyanuric / 3);
    if (correctedAlkalinity < 0) correctedAlkalinity = 0;

    const alkalinityFactor = getFactor(correctedAlkalinity, ALKALINITY_FACTORS);
    const calciumFactor = getFactor(calcium, CALCIUM_FACTORS);
    const tempFactor = getFactor(temperature, TEMP_FACTORS, 'temp');
    const tdsFactor = getTDSFactor(tds);

    const lsi = ph + calciumFactor + alkalinityFactor + tempFactor - tdsFactor;

    let golden = GOLDEN_NUMBERS[state];

    const dosing = {
        ph: getDosingAdvice(ph, golden.ph, poolGallons, "ph", alkalinity, state),
        alkalinity: getDosingAdvice(correctedAlkalinity, golden.alkalinity, poolGallons, "alkalinity", alkalinity, state),
        cya: getDosingAdvice(cyanuric, golden.cya, poolGallons, "cya", alkalinity, state),
        calcium: getDosingAdvice(calcium, golden.calcium, poolGallons, "calcium", alkalinity, state)
    };

    let weeks = [[], [], []];
    if (ph < 7.5 && correctedAlkalinity <= 80 && dosing.alkalinity) {
        weeks[0].push('alkalinity');
        let nc = [];
        if (
            (state === "florida" && cyanuric <= FL_THRESHOLDS.cya) ||
            (state !== "florida" && cyanuric < golden.cya - 10)
        ) nc.push('cya');
        if (
            (state === "florida" && calcium < FL_THRESHOLDS.calcium) ||
            (state !== "florida" && calcium < 200)
        ) nc.push('calcium');
        if (nc[0]) weeks[1].push(nc[0]);
        if (nc[1]) weeks[2].push(nc[1]);
    } else {
        let nonCritical = [];
        if (
            (state === "florida" && correctedAlkalinity < FL_THRESHOLDS.alkalinity) ||
            (state !== "florida" && (correctedAlkalinity < 80 || correctedAlkalinity > 140))
        ) nonCritical.push('alkalinity');
        if (
            (state === "florida" && cyanuric <= FL_THRESHOLDS.cya) ||
            (state !== "florida" && cyanuric < golden.cya - 10)
        ) nonCritical.push('cya');
        if (
            (state === "florida" && calcium < FL_THRESHOLDS.calcium) ||
            (state !== "florida" && calcium < 200)
        ) nonCritical.push('calcium');
        if (ph < 7.2 || ph > 7.8) weeks[0].push('ph');
        if (nonCritical[0]) weeks[0].push(nonCritical[0]);
        if (nonCritical[1]) weeks[1].push(nonCritical[1]);
        if (nonCritical[2]) weeks[2].push(nonCritical[2]);
    }

    let adjustNow = [];
    let nextVisit = [];

    weeks.forEach((params, idx) => {
        if (idx === 0 && params.length > 0) {
            params.forEach(param => {
                if (dosing[param]) adjustNow.push(dosing[param]);
            });
        }
        if (idx > 0 && params.length > 0) {
            params.forEach(param => {
                if (dosing[param]) nextVisit.push(dosing[param]);
            });
        }
    });

    let lsiStatus;
    if (lsi < -0.5) {
        lsiStatus = "Very Corrosive";
    } else if (lsi >= -0.5 && lsi < -0.2) {
        lsiStatus = "Corrosive";
    } else if (lsi >= -0.2 && lsi < -0.05) {
        lsiStatus = "Slightly Corrosive";
    } else if (lsi >= -0.05 && lsi <= 0.3) {
        lsiStatus = "Balanced";
    } else if (lsi > 0.3 && lsi <= 0.5) {
        lsiStatus = "Slightly Scale Forming";
    } else {
        lsiStatus = "Scale Forming";
    }

    const chlorineInfo = getChlorinePPMDose(freeChlorine, cyanuric);

    // Salt dosing
    let saltDose = null;
    if (saltDesired > 0 && saltCurrent >= 0 && saltDesired > saltCurrent) {
        saltDose = getSaltDose(saltCurrent, saltDesired, poolGallons);
    }

    // --- Build summary of chemicals to add now ---
    let summaryList = [];
    let acidList = [];
    let otherList = [];

    // Add muriatic acid (for lowering pH) first, if present
    adjustNow.forEach(item => {
        if (item && item.toLowerCase().includes("muriatic acid")) {
            acidList.push(boldQuantity(item) + ' <em>(Add immediately after testing.)</em>');
        }
    });

    // Add salt if needed
    if (saltDose && saltDose.lbsNeeded > 0.01) {
        otherList.push(
            boldQuantity(
                `Add ${saltDose.lbsNeeded.toFixed(2)} lbs of pool salt (${saltDose.bags} x 40 lb bags) to reach your desired salt level.`
            )
        );
    }

    // Add other balancing chems and sanitizer, but do not mix acid and chlorine
    adjustNow.forEach(item => {
        if (item && !item.toLowerCase().includes("muriatic acid")) {
            otherList.push(boldQuantity(item));
        }
    });

    // Add sanitizer (chlorine) if needed, but not in same group as acid
    if (state === "florida") {
        const liquidChlorine = getLiquidChlorineDose(chlorineInfo.toBeDosed, poolGallons);
        if (chlorineInfo.toBeDosed > 0.01) {
            otherList.push(
                boldQuantity(`Add ${liquidChlorine.gallons.toFixed(2)} gal (${liquidChlorine.flOz.toFixed(0)} fl oz) of 12.5% liquid chlorine.`)
            );
        }
    } else {
        const calHypoOunces = getCalHypoOunces(chlorineInfo.toBeDosed, poolGallons);
        if (chlorineInfo.toBeDosed > 0.01) {
            otherList.push(
                boldQuantity(`Add ${formatLbsOz(calHypoOunces)} of calcium hypochlorite (73%).`)
            );
        }
    }

    // --- Build comparison chart ---
    function chartRow(label, current, golden) {
        return `<tr><td>${label}</td><td>${current}</td><td>${golden}</td></tr>`;
    }
    let comparisonTable = `
        <table style="width:100%;max-width:500px;margin:1em auto;border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="border-bottom:1px solid #ccc;">Parameter</th>
                    <th style="border-bottom:1px solid #ccc;">Test Result</th>
                    <th style="border-bottom:1px solid #ccc;">Golden Number</th>
                </tr>
            </thead>
            <tbody>
                ${chartRow("pH", ph, golden.ph)}
                ${chartRow("Alkalinity (ppm)", alkalinity, golden.alkalinity)}
                ${chartRow("Calcium Hardness (ppm)", calcium, golden.calcium)}
                ${chartRow("Cyanuric Acid (ppm)", cyanuric, golden.cya)}
                ${chartRow("Salt (ppm)", saltCurrent, golden.salt)}
            </tbody>
        </table>
    `;

    let chlorineHTML = "";
    if (state === "florida") {
        const liquidChlorine = getLiquidChlorineDose(chlorineInfo.toBeDosed, poolGallons);
        chlorineHTML = `
            <h4>Sanitizer Dosing Recommendation (Florida)</h4>
            <ul>
                <li>Minimum Free Chlorine Required: ${chlorineInfo.minFC.toFixed(2)} ppm</li>
                <li>UV Loss Factor: ${chlorineInfo.lossFactor} ppm/day</li>
                <li>UV Loss for Week: ${chlorineInfo.uvLoss.toFixed(2)} ppm</li>
                <li>Calculated Chlorine Dose: ${chlorineInfo.calculatedDose.toFixed(2)} ppm</li>
                <li>Tested Free Chlorine: ${freeChlorine.toFixed(2)} ppm</li>
                <li><strong>Chlorine to Be Dosed: ${chlorineInfo.toBeDosed.toFixed(2)} ppm</strong></li>
                <li><strong>12.5% Liquid Chlorine to Add: ${liquidChlorine.gallons.toFixed(2)} gal (${liquidChlorine.flOz.toFixed(0)} fl oz)</strong></li>
            </ul>
        `;
    } else {
        const calHypoOunces = getCalHypoOunces(chlorineInfo.toBeDosed, poolGallons);
        chlorineHTML = `
            <h4>Sanitizer Dosing Recommendation</h4>
            <ul>
                <li>Minimum Free Chlorine Required: ${chlorineInfo.minFC.toFixed(2)} ppm</li>
                <li>UV Loss Factor: ${chlorineInfo.lossFactor} ppm/day</li>
                <li>UV Loss for Week: ${chlorineInfo.uvLoss.toFixed(2)} ppm</li>
                <li>Calculated Chlorine Dose: ${chlorineInfo.calculatedDose.toFixed(2)} ppm</li>
                <li>Tested Free Chlorine: ${freeChlorine.toFixed(2)} ppm</li>
                <li><strong>Chlorine to Be Dosed: ${chlorineInfo.toBeDosed.toFixed(2)} ppm</strong></li>
                <li><strong>Calcium Hypochlorite (73%) to Add: ${formatLbsOz(calHypoOunces)}</strong></li>
            </ul>
        `;
    }

    // --- Output ---
    resultsElement.innerHTML = `
        <h3>Summary of Chemicals to Add at Today's Visit</h3>
        <ul>
            ${acidList.length > 0 ? acidList.map(item => `<li>${item}</li>`).join('') : ''}
        </ul>
        ${acidList.length > 0 ? '<div style="margin-bottom:0.5em;"><em>Wait at least 15 minutes and circulate water before adding any other chemicals.</em></div>' : ''}
        <ul>
            ${otherList.length > 0 ? otherList.map(item => `<li>${item}</li>`).join('') : '<li>No chemicals need to be added at this time.</li>'}
        </ul>
        <div style="font-size:1.5em; letter-spacing:0.2em; margin: 1em 0; text-align:center;">*******</div>
        ${comparisonTable}
        <h3>Detailed Explanation</h3>
        ${chlorineHTML}
        <h3>Water Balance Recommendation (${state.charAt(0).toUpperCase() + state.slice(1)})</h3>
        <p><strong>LSI Value:</strong> ${lsi.toFixed(2)}</p>
        <h4>Pool Water Assessment:</h4>
        <p>${lsiStatus}</p>
        <h4>Water Balance Adjustment Plan</h4>
        <ul>
            ${adjustNow.length > 0 ? `<li><strong>Adjust Now:</strong><ul>${adjustNow.map(item => `<li>${item}</li>`).join('')}</ul></li>` : '<li>No immediate adjustments needed.</li>'}
        </ul>
        ${nextVisit.length > 0 ? `
            <h4>Water Balance Notes for Next Visit</h4>
            <ul>
                ${nextVisit.map(item => `<li>${item} <br><em>These changes should be made at the next service visit. Retest the water before making adjustments.</em></li>`).join('')}
            </ul>
        ` : ''}
        <p><strong>Golden Numbers for ${state.charAt(0).toUpperCase() + state.slice(1)}:</strong></p>
        <ul>
            <li>pH: ${golden.ph}</li>
            <li>Alkalinity: ${golden.alkalinity} ppm</li>
            <li>Calcium Hardness: ${golden.calcium} ppm</li>
            <li>Cyanuric Acid: ${golden.cya} ppm</li>
            <li>Salt: ${golden.salt} ppm</li>
        </ul>
        ${saltDose && saltDose.lbsNeeded > 0.01 ? `<h4>Salt Dosing Recommendation</h4>
        <p>Add <strong>${saltDose.lbsNeeded.toFixed(2)} lbs</strong> of pool salt (<strong>${saltDose.bags} x 40 lb bags</strong>) to reach your desired salt level.</p>` : ''}
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('pool-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            calculateLSI();
        });
    }
});