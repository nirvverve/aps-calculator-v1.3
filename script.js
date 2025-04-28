// State-specific "golden numbers"
const GOLDEN_NUMBERS = {
    arizona: { alkalinity: 120, calcium: 400, ph: 7.5, cya: 80 },
    texas:   { alkalinity: 120, calcium: 400, ph: 7.5, cya: 80 },
    florida: { alkalinity: 120, calcium: 300, ph: 7.5, cya: 50 }
};

// Factor tables
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

// Helper: Format chemical amount in oz or lbs
function formatAmountOzLb(amountOz) {
    if (amountOz > 16) {
        return `${(amountOz / 16).toFixed(2)} lbs`;
    } else {
        return `${amountOz.toFixed(2)} oz`;
    }
}

// Helper: Muriatic acid dose in fl oz and gallons, factoring in alkalinity
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

// Dosing advice logic
function getDosingAdvice(userValue, targetValue, poolGallons, chemType, alkalinity) {
    let advice = "";
    let amount = 0;
    let diff = targetValue - userValue;
    if (chemType === "ph" && Math.abs(diff) < 0.01) return "";
    if (chemType !== "ph" && Math.abs(diff) < 1) return "";

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

// Chlorine PPM and Cal Hypo dosing
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
function getCalHypoOunces(chlorinePPM, poolGallons) {
    return chlorinePPM * 2.0 * (poolGallons / 10000);
}

// Main calculation and display
function calculateLSI() {
    const state = document.getElementById('state').value;
    const poolGallons = parseFloat(document.getElementById('capacity').value);
    const ph = parseFloat(document.getElementById('ph') ? document.getElementById('ph').value : "7.5");
    const alkalinity = parseFloat(document.getElementById('alkalinity').value);
    const calcium = parseFloat(document.getElementById('calcium').value);
    const temperature = parseFloat(document.getElementById('temperature').value);
    const tds = parseFloat(document.getElementById('tds').value) || 0;
    const cyanuric = parseFloat(document.getElementById('cyanuric').value) || 0;
    const freeChlorine = parseFloat(document.getElementById('freechlorine').value);

    const resultsElement = document.getElementById('results');

    if (
        isNaN(poolGallons) || isNaN(alkalinity) || isNaN(calcium) || isNaN(temperature) || isNaN(cyanuric) || isNaN(freeChlorine)
    ) {
        resultsElement.innerHTML = '<p class="error">Please fill in all required fields.</p>';
        return;
    }

    // Use corrected alkalinity for LSI and for dosing advice
    let correctedAlkalinity = alkalinity - (cyanuric / 3);
    if (correctedAlkalinity < 0) correctedAlkalinity = 0;

    const alkalinityFactor = getFactor(correctedAlkalinity, ALKALINITY_FACTORS);
    const calciumFactor = getFactor(calcium, CALCIUM_FACTORS);
    const tempFactor = getFactor(temperature, TEMP_FACTORS, 'temp');
    const tdsFactor = getTDSFactor(tds);

    const lsi = ph + calciumFactor + alkalinityFactor + tempFactor - tdsFactor;

    let golden = GOLDEN_NUMBERS[state];

    // LSI interpretation
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

    // Prepare dosing advice for each parameter (using corrected alkalinity for dosing)
    const dosing = {
        ph: getDosingAdvice(ph, golden.ph, poolGallons, "ph", alkalinity),
        alkalinity: getDosingAdvice(correctedAlkalinity, golden.alkalinity, poolGallons, "alkalinity", alkalinity),
        cya: getDosingAdvice(cyanuric, golden.cya, poolGallons, "cya", alkalinity),
        calcium: getDosingAdvice(calcium, golden.calcium, poolGallons, "calcium", alkalinity)
    };

    // Build weekly plan with special rule for pH/alkalinity
    let weeks = [[], [], []];
    if (ph < 7.5 && correctedAlkalinity <= 80 && dosing.alkalinity) {
        weeks[0].push('alkalinity');
        let nc = [];
        if (cyanuric < golden.cya - 10 || cyanuric > golden.cya + 20) nc.push('cya');
        if (calcium < 200 || calcium > 500) nc.push('calcium');
        if (nc[0]) weeks[1].push(nc[0]);
        if (nc[1]) weeks[2].push(nc[1]);
    } else {
        let nonCritical = [];
        if (correctedAlkalinity < 80 || correctedAlkalinity > 140) nonCritical.push('alkalinity');
        if (cyanuric < golden.cya - 10 || cyanuric > golden.cya + 20) nonCritical.push('cya');
        if (calcium < 200 || calcium > 500) nonCritical.push('calcium');
        if (ph < 7.2 || ph > 7.8) weeks[0].push('ph');
        if (nonCritical[0]) weeks[0].push(nonCritical[0]);
        if (nonCritical[1]) weeks[1].push(nonCritical[1]);
        if (nonCritical[2]) weeks[2].push(nonCritical[2]);
    }

    // Format weekly plan with dosing
    let weeklyHTML = `<h4>Weekly Adjustment Plan:</h4><ol>`;
    weeks.forEach((params, idx) => {
        if (params.length === 0) {
            weeklyHTML += `<li>Week ${idx+1}: No adjustments needed.</li>`;
        } else {
            weeklyHTML += `<li>Week ${idx+1}:<ul>`;
            params.forEach(param => {
                if (dosing[param]) {
                    weeklyHTML += `<li>${dosing[param]}</li>`;
                }
            });
            weeklyHTML += `</ul></li>`;
        }
    });
    weeklyHTML += `</ol>`;

    // Chlorine dosing
    const chlorineInfo = getChlorinePPMDose(freeChlorine, cyanuric);
    const calHypoOunces = getCalHypoOunces(chlorineInfo.toBeDosed, poolGallons);
    let chlorineHTML = `
        <h4>Sanitizer Dosing Recommendation</h4>
        <ul>
            <li>Minimum Free Chlorine Required: ${chlorineInfo.minFC.toFixed(2)} ppm</li>
            <li>UV Loss Factor: ${chlorineInfo.lossFactor} ppm/day</li>
            <li>UV Loss for Week: ${chlorineInfo.uvLoss.toFixed(2)} ppm</li>
            <li>Calculated Chlorine Dose: ${chlorineInfo.calculatedDose.toFixed(2)} ppm</li>
            <li>Tested Free Chlorine: ${freeChlorine.toFixed(2)} ppm</li>
            <li><strong>Chlorine to Be Dosed: ${chlorineInfo.toBeDosed.toFixed(2)} ppm</strong></li>
            <li><strong>Calcium Hypochlorite (73%) to Add: ${calHypoOunces.toFixed(2)} oz</strong></li>
        </ul>
    `;

    // Display results
    resultsElement.innerHTML = `
        ${chlorineHTML}
        <h3>Results for ${state.charAt(0).toUpperCase() + state.slice(1)}</h3>
        <p><strong>LSI Value:</strong> ${lsi.toFixed(2)}</p>
        <h4>Pool Water Assessment:</h4>
        <p>${lsiStatus}</p>
        ${weeklyHTML}
        <p><strong>Golden Numbers for ${state.charAt(0).toUpperCase() + state.slice(1)}:</strong></p>
        <ul>
            <li>pH: ${golden.ph}</li>
            <li>Alkalinity: ${golden.alkalinity} ppm</li>
            <li>Calcium Hardness: ${golden.calcium} ppm</li>
            <li>Cyanuric Acid: ${golden.cya} ppm</li>
        </ul>
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