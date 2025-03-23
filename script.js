// Constants for the Earth's ellipsoid model
const EARTH_RADIUS = 6378137; // Earth's radius in meters
const EARTH_FLATTENING = 1/298.257223563; // WGS84 flattening

// File storage
let fixFileContent = null;
let navFileContent = null;
let currentMode = "WAYPOINT";
let pendingCalculationParams = null;

// DOM elements
document.addEventListener('DOMContentLoaded', function() {
    // Load saved values from localStorage
    loadSavedValues();
    
    // Apply theme based on localStorage or system preference
    applyTheme();
    
    // Mode selection
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            currentMode = this.getAttribute('data-mode');
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-selected', 'true');
            
            if (currentMode === "WAYPOINT") {
                document.getElementById('waypoint-calculator').style.display = 'grid';
                document.getElementById('fix-calculator').style.display = 'none';
                document.getElementById('waypoint-search-type').value = "NAV";
            } else {
                document.getElementById('waypoint-calculator').style.display = 'none';
                document.getElementById('fix-calculator').style.display = 'grid';
                document.getElementById('fix-search-type').value = "FIX";
            }
            
            // Save current mode to localStorage
            localStorage.setItem('currentMode', currentMode);
        });
    });

    // File uploading
    document.getElementById('fix-file').addEventListener('change', function(e) {
        handleFileUpload(e, 'fix');
    });

    document.getElementById('nav-file').addEventListener('change', function(e) {
        handleFileUpload(e, 'nav');
    });

    // Search buttons
    document.getElementById('search-waypoint-btn').addEventListener('click', searchWaypointCoords);
    document.getElementById('search-fix-btn').addEventListener('click', searchFixCoords);

    // Calculate buttons
    document.getElementById('calculate-waypoint-btn').addEventListener('click', calculateWaypoint);
    document.getElementById('calculate-fix-btn').addEventListener('click', calculateFix);

    // Modal elements
    const modal = document.getElementById('modal');
    const closeBtn = document.querySelector('.close');
    const confirmBtn = document.getElementById('confirm-choice');

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    confirmBtn.addEventListener('click', confirmChoice);

    // Action buttons
    document.getElementById('clear-btn').addEventListener('click', clearFields);
    document.getElementById('copy-btn').addEventListener('click', copyOutput);
    
    // Initialize form validation
    setupFormValidation();
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    // Setup input autosave
    setupAutosave();
    
    // Initialize tooltips
    setupTooltips();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Setup shortcuts modal
    setupShortcutsModal();
});

// File handling functions
function handleFileUpload(event, fileType) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show loading indicator
    const displayElement = fileType === 'fix' ? 'fix-file-display' : 'nav-file-display';
    document.getElementById(displayElement).innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading...`;

    const reader = new FileReader();
    reader.onload = function(e) {
        if (fileType === 'fix') {
            fixFileContent = e.target.result;
            document.getElementById('fix-file-display').textContent = file.name;
            document.getElementById('fix-file-display').classList.add('has-file');
            
            // Save filename to localStorage
            localStorage.setItem('fixFileName', file.name);
        } else {
            navFileContent = e.target.result;
            document.getElementById('nav-file-display').textContent = file.name;
            document.getElementById('nav-file-display').classList.add('has-file');
            
            // Save filename to localStorage
            localStorage.setItem('navFileName', file.name);
        }
        
        // Show success notification
        showNotification(`${fileType.toUpperCase()} file loaded successfully!`, 'success');
    };
    
    reader.onerror = function() {
        document.getElementById(displayElement).textContent = 'Error loading file';
        document.getElementById(displayElement).classList.add('error');
        showNotification('Error loading file!', 'error');
    };
    
    reader.readAsText(file);
}

// Geodesic calculations
function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}

function calculateTargetCoordsGeodesic(lat1, lon1, azimuth, distanceNm) {
    // Direct geodesic calculation using Vincenty's formulae (simplified version)
    // For a complete implementation, a dedicated geodesic library would be better
    
    // Convert inputs
    lat1 = degreesToRadians(lat1);
    lon1 = degreesToRadians(lon1);
    azimuth = degreesToRadians(azimuth);
    const distance = distanceNm * 1852; // Convert nautical miles to meters
    
    const a = EARTH_RADIUS;
    const f = EARTH_FLATTENING;
    const b = a * (1 - f);
    
    const sinAlpha1 = Math.sin(azimuth);
    const cosAlpha1 = Math.cos(azimuth);
    
    const tanU1 = (1 - f) * Math.tan(lat1);
    const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
    const sinU1 = tanU1 * cosU1;
    
    const sigma1 = Math.atan2(tanU1, cosAlpha1);
    const sinAlpha = cosU1 * sinAlpha1;
    const cosSqAlpha = 1 - sinAlpha * sinAlpha;
    const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
    const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    
    let sigma = distance / (b * A);
    let sigmaP, sinSigma, cosSigma, cos2SigmaM;
    
    // Iterate until convergence
    do {
        cos2SigmaM = Math.cos(2 * sigma1 + sigma);
        sinSigma = Math.sin(sigma);
        cosSigma = Math.cos(sigma);
        const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
        sigmaP = sigma;
        sigma = distance / (b * A) + deltaSigma;
    } while (Math.abs(sigma - sigmaP) > 1e-12);
    
    const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
    const lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp));
    const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
    const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const L = lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    
    const lon2 = lon1 + L;
    
    return {
        lat2: radiansToDegrees(lat2),
        lon2: radiansToDegrees(lon2)
    };
}

function getRadiusLetter(distanceNm) {
    const ranges = [
        [0.1, 1.4, 'A'], [1.5, 2.4, 'B'], [2.5, 3.4, 'C'], [3.5, 4.4, 'D'],
        [4.5, 5.4, 'E'], [5.5, 6.4, 'F'], [6.5, 7.4, 'G'], [7.5, 8.4, 'H'],
        [8.5, 9.4, 'I'], [9.5, 10.4, 'J'], [10.5, 11.4, 'K'], [11.5, 12.4, 'L'],
        [12.5, 13.4, 'M'], [13.5, 14.4, 'N'], [14.5, 15.4, 'O'], [15.5, 16.4, 'P'],
        [16.5, 17.4, 'Q'], [17.5, 18.4, 'R'], [18.5, 19.4, 'S'], [19.5, 20.4, 'T'],
        [20.5, 21.4, 'U'], [21.5, 22.4, 'V'], [22.5, 23.4, 'W'], [23.5, 24.4, 'X'],
        [24.5, 25.4, 'Y'], [25.5, 26.4, 'Z']
    ];
    
    for (const [low, high, letter] of ranges) {
        if (low <= distanceNm && distanceNm <= high) {
            return letter;
        }
    }
    return 'Z';
}

// Search functions
function searchWaypointCoords() {
    const identifier = document.getElementById('waypoint-identifier').value.trim().toUpperCase();
    if (!identifier) {
        alert("Please enter an identifier.");
        return;
    }
    
    const fileType = document.getElementById('waypoint-search-type').value;
    const fileContent = fileType === "NAV" ? navFileContent : fixFileContent;
    
    if (!fileContent) {
        alert(`Please select a ${fileType} data file.`);
        return;
    }
    
    const lines = fileContent.split('\n');
    const matchingLines = [];
    
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const relevantIndex = fileType === "NAV" ? 7 : 2;
        if (parts.length > relevantIndex && parts[relevantIndex] === identifier) {
            matchingLines.push(parts);
        }
    });
    
    if (matchingLines.length === 0) {
        alert(`${fileType} identifier '${identifier}' not found.`);
        return;
    }
    
    if (matchingLines.length > 1) {
        handleDuplicateEntries(matchingLines, "WAYPOINT");
    } else {
        setWaypointCoords(matchingLines[0]);
    }
}

function searchFixCoords() {
    const identifier = document.getElementById('fix-identifier').value.trim().toUpperCase();
    if (!identifier) {
        alert("Please enter a FIX identifier.");
        return;
    }
    
    const fileType = document.getElementById('fix-search-type').value;
    const fileContent = fileType === "FIX" ? fixFileContent : navFileContent;
    
    if (!fileContent) {
        alert(`Please select a ${fileType} data file.`);
        return;
    }
    
    const lines = fileContent.split('\n');
    const matchingLines = [];
    
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const relevantIndex = fileType === "FIX" ? 2 : 7;
        if (parts.length > relevantIndex && parts[relevantIndex] === identifier) {
            matchingLines.push(parts);
        }
    });
    
    if (matchingLines.length === 0) {
        alert(`${fileType} identifier '${identifier}' not found.`);
        return;
    }
    
    if (matchingLines.length > 1) {
        handleDuplicateEntries(matchingLines, "FIX");
    } else {
        setFixCoords(matchingLines[0]);
    }
}

function handleDuplicateEntries(matchingLines, mode) {
    const modal = document.getElementById('modal');
    const choicesDiv = document.getElementById('choices');
    choicesDiv.innerHTML = '';
    
    const fileType = mode === "WAYPOINT" 
        ? document.getElementById('waypoint-search-type').value 
        : document.getElementById('fix-search-type').value;
    
    const typeMapping = {
        '3': "VOR",
        '12': "DME (VOR)",
        '2': "NDB",
        '13': 'DME',
        '7': 'OUTER MARKER',
        '8': 'MIDDLE MARKER',
        '9': 'INNER MARKER'
    };
    
    matchingLines.forEach((lineParts, index) => {
        const firstPart = lineParts[0];
        const typeStr = typeMapping[firstPart] || "Unknown";
        const relevantIndex = fileType === "NAV" ? 7 : 2;
        let displayText = `${typeStr} - ${lineParts[relevantIndex]}`;
        
        if (lineParts.length > 9) {
            displayText += ` - ${lineParts[9]}`;
        } else {
            displayText += " - [Tenth part missing]";
        }
        
        const choiceItem = document.createElement('div');
        choiceItem.className = 'choice-item';
        
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'choice';
        radio.value = index;
        radio.id = `choice-${index}`;
        
        const label = document.createElement('label');
        label.htmlFor = `choice-${index}`;
        label.textContent = displayText;
        
        // Make the first option selected by default
        if (index === 0) {
            radio.checked = true;
        }
        
        // Add keyboard selection support
        radio.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                document.getElementById('confirm-choice').click();
                e.preventDefault();
            }
        });
        
        choiceItem.appendChild(radio);
        choiceItem.appendChild(label);
        choicesDiv.appendChild(choiceItem);
    });
    
    // Store matching lines and mode for later use
    window.modalData = { matchingLines, mode };
    modal.style.display = 'block';
    
    // Set modal aria-hidden attribute correctly
    modal.setAttribute('aria-hidden', 'false');
    
    // Focus on the first radio button for accessibility
    const firstRadio = document.querySelector('input[name="choice"]');
    if (firstRadio) {
        firstRadio.focus();
    }
    
    // Handle Escape key for closing modal
    modal.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            modal.removeEventListener('keydown', escHandler);
        }
    });
}

function confirmChoice() {
    const modal = document.getElementById('modal');
    const radios = document.querySelectorAll('input[name="choice"]');
    let selectedValue = null;
    
    radios.forEach(radio => {
        if (radio.checked) {
            selectedValue = radio.value;
        }
    });
    
    if (selectedValue !== null) {
        const { matchingLines, mode } = window.modalData;
        const selectedLine = matchingLines[selectedValue];
        
        if (mode === "WAYPOINT") {
            setWaypointCoords(selectedLine);
        } else {
            setFixCoords(selectedLine);
        }
        
        modal.style.display = 'none';
    } else {
        alert("Please select an entry.");
    }
}

function setWaypointCoords(lineParts) {
    try {
        const fileType = document.getElementById('waypoint-search-type').value;
        const latIndex = fileType === "NAV" ? 1 : 0;
        const lonIndex = fileType === "NAV" ? 2 : 1;
        
        const lat = parseFloat(lineParts[latIndex]);
        const lon = parseFloat(lineParts[lonIndex]);
        
        document.getElementById('waypoint-coords').value = `${lat} ${lon}`;
        
        // If there are pending calculations, execute them now
        if (pendingCalculationParams) {
            calculateWaypoint();
            pendingCalculationParams = null;
        }
    } catch (error) {
        alert("Invalid coordinate data in the selected file.");
    }
}

function setFixCoords(lineParts) {
    try {
        const fileType = document.getElementById('fix-search-type').value;
        const latIndex = fileType === "FIX" ? 0 : 1;
        const lonIndex = fileType === "FIX" ? 1 : 2;
        
        const lat = parseFloat(lineParts[latIndex]);
        const lon = parseFloat(lineParts[lonIndex]);
        
        document.getElementById('fix-coords').value = `${lat} ${lon}`;
        
        // If there are pending calculations, execute them now
        if (pendingCalculationParams && currentMode === "WAYPOINT") {
            calculateWaypoint();
            pendingCalculationParams = null;
        }
    } catch (error) {
        alert("Invalid coordinate data in the selected file.");
    }
}

// Calculation functions
function validateWaypointInput() {
    try {
        let latVor = null, lonVor = null;
        
        // Validate coordinates if entered manually
        const coordsStr = document.getElementById('waypoint-coords').value.trim();
        if (coordsStr) {
            const [lat, lon] = coordsStr.split(/\s+/).map(parseFloat);
            
            if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                throw new Error("Latitude/Longitude out of range (±90 / ±180)");
            }
            
            latVor = lat;
            lonVor = lon;
        } else if (document.getElementById('waypoint-identifier').value.trim()) {
            // Identifier provided, coordinates might be searched
        } else {
            throw new Error("Coordinates or Identifier must be provided");
        }
        
        const magneticBearing = parseFloat(document.getElementById('magnetic-bearing').value);
        if (isNaN(magneticBearing) || magneticBearing < 0 || magneticBearing >= 360) {
            throw new Error("Magnetic bearing should be within 0-359 degrees");
        }
        
        const distanceNm = parseFloat(document.getElementById('distance').value);
        if (isNaN(distanceNm) || distanceNm <= 0) {
            throw new Error("Distance should be greater than 0 nautical miles");
        }
        
        const declination = parseFloat(document.getElementById('declination').value);
        if (isNaN(declination)) {
            throw new Error("Declination must be a number");
        }
        
        const airportCode = document.getElementById('airport-code').value.trim().toUpperCase();
        if (airportCode.length !== 4) {
            throw new Error("Airport code must be 4 letters");
        }
        
        const vorIdentifier = document.getElementById('vor-identifier').value.trim().toUpperCase();
        if (vorIdentifier && (vorIdentifier.length < 1 || vorIdentifier.length > 3 || !/^[A-Z]+$/.test(vorIdentifier))) {
            throw new Error("VOR identifier should be 1-3 letters and alphabetic");
        }
        
        return { latVor, lonVor, magneticBearing, distanceNm, declination, airportCode, vorIdentifier };
    } catch (error) {
        alert(`WAYPOINT mode input error: ${error.message}`);
        return null;
    }
}

function calculateWaypoint() {
    const params = validateWaypointInput();
    if (!params) return;
    
    const { latVor, lonVor, magneticBearing, distanceNm, declination, airportCode, vorIdentifier } = params;
    
    if (latVor === null || lonVor === null) {
        // Coordinates not provided, try to search based on identifier
        const identifier = document.getElementById('waypoint-identifier').value.trim().toUpperCase();
        if (!identifier) {
            alert("Please enter identifier or coordinates.");
            return;
        }
        
        // Store params for after search
        pendingCalculationParams = { magneticBearing, distanceNm, declination, airportCode, vorIdentifier };
        searchWaypointCoords();
        return;
    }
    
    try {
        // Calculate true bearing
        const trueBearing = (magneticBearing + declination) % 360;
        
        // Calculate target coordinates
        const result = calculateTargetCoordsGeodesic(latVor, lonVor, trueBearing, distanceNm);
        const latTarget = result.lat2;
        const lonTarget = result.lon2;
        
        // Get radius letter
        const radiusLetter = getRadiusLetter(distanceNm);
        
        // Get operation code
        const operationTypeSelect = document.getElementById('operation-type');
        const operationTypeValue = operationTypeSelect.value;
        const operationCodeMap = {
            "Departure": "4464713",
            "Arrival": "4530249",
            "Approach": "4595785"
        };
        const operationCode = operationCodeMap[operationTypeValue] || "";
        
        // Process output
        processOutput(
            [latTarget, lonTarget, radiusLetter, airportCode, operationCode],
            "WAYPOINT",
            vorIdentifier,
            magneticBearing,
            distanceNm
        );
    } catch (error) {
        alert(`Calculation Error: ${error.message}`);
    }
}

function calculateFix() {
    const coordsStr = document.getElementById('fix-coords').value.trim();
    if (!coordsStr) {
        alert("Please search for and select coordinates first or enter manually.");
        return;
    }
    
    try {
        const [lat, lon] = coordsStr.split(/\s+/).map(parseFloat);
        
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            throw new Error("Latitude/Longitude out of range (±90 / ±180)");
        }
        
        const fixType = document.getElementById('fix-type').value;
        const fixUsage = document.getElementById('fix-usage').value;
        const runwayCode = document.getElementById('runway-code').value.trim();
        
        if (!runwayCode.match(/^\d+$/) || parseInt(runwayCode) < 0 || parseInt(runwayCode) > 99) {
            throw new Error("Runway code should be a two-digit number between 0 and 99");
        }
        
        const airportCode = document.getElementById('fix-airport-code').value.trim().toUpperCase();
        if (airportCode.length !== 4) {
            throw new Error("Airport code must be 4 letters");
        }
        
        const fixCodeMap = {
            "VORDME": "D",
            "VOR": "V",
            "NDBDME": "Q",
            "NDB": "N",
            "ILS": "I",
            "RNP": "R"
        };
        
        const usageCodeMap = {
            "Final approach fix": "F",
            "Initial approach fix": "A",
            "Intermediate approach fix": "I",
            "Final approach course fix": "C",
            "Missed approach point fix": "M"
        };
        
        const operationCodeMap = {
            "Departure": "4464713",
            "Arrival": "4530249",
            "Approach": "4595785"
        };
        
        const fixCode = fixCodeMap[fixType] || "";
        const usageCode = usageCodeMap[fixUsage] || "";
        
        if (!fixCode || !usageCode) {
            throw new Error("Invalid FIX type or usage");
        }
        
        const operationTypeSelect = document.getElementById('fix-operation-type');
        const operationCode = operationCodeMap[operationTypeSelect.value] || "";
        
        processOutput(
            [lat, lon, fixCode, usageCode, runwayCode, airportCode, operationCode],
            "FIX"
        );
    } catch (error) {
        alert(`FIX mode input error: ${error.message}`);
    }
}

function processOutput(result, mode, vorIdentifier = "", magneticBearing = "", distanceNm = "") {
    let output = "";
    
    if (mode === "WAYPOINT") {
        const [latTarget, lonTarget, radiusLetter, airportCode, operationCode] = result;
        
        if (distanceNm > 26.5) {
            const roundedDistanceNmInt = Math.round(distanceNm);
            output = `${latTarget.toFixed(9)} ${lonTarget.toFixed(9)} ${vorIdentifier}${roundedDistanceNmInt} ${airportCode} ${airportCode.substring(0, 2)}`;
            
            if (vorIdentifier) {
                const magneticBearingInt = Math.floor(magneticBearing);
                output += ` ${operationCode} ${vorIdentifier}${magneticBearingInt.toString().padStart(3, '0')}${roundedDistanceNmInt.toString().padStart(3, '0')}`;
            } else {
                output += ` ${operationCode}`;
            }
        } else {
            const magneticBearingInt = Math.floor(magneticBearing);
            output = `${latTarget.toFixed(9)} ${lonTarget.toFixed(9)} D${magneticBearingInt.toString().padStart(3, '0')}${radiusLetter} ${airportCode} ${airportCode.substring(0, 2)}`;
            
            if (vorIdentifier) {
                output += ` ${operationCode} ${vorIdentifier}${magneticBearingInt.toString().padStart(3, '0')}${Math.round(distanceNm).toString().padStart(3, '0')}`;
            } else {
                output += ` ${operationCode}`;
            }
        }
    } else if (mode === "FIX") {
        const [lat, lon, fixCode, usageCode, runwayCode, airportCode, operationCode] = result;
        output = `${lat.toFixed(9)} ${lon.toFixed(9)} ${usageCode}${fixCode}${parseInt(runwayCode).toString().padStart(2, '0')} ${airportCode} ${airportCode.substring(0, 2)} ${operationCode}`;
    }
    
    document.getElementById('output-result').value = output;
}

// Utility functions
function clearFields() {
    if (currentMode === "WAYPOINT") {
        document.getElementById('waypoint-identifier').value = '';
        document.getElementById('waypoint-coords').value = '';
        document.getElementById('magnetic-bearing').value = '';
        document.getElementById('distance').value = '';
        document.getElementById('declination').value = '';
        document.getElementById('airport-code').value = '';
        document.getElementById('vor-identifier').value = '';
    } else {
        document.getElementById('fix-identifier').value = '';
        document.getElementById('fix-coords').value = '';
        document.getElementById('runway-code').value = '';
        document.getElementById('fix-airport-code').value = '';
    }
    
    document.getElementById('output-result').value = '';
    
    // Clear validation styles
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.classList.remove('error', 'valid');
        const errorElement = document.getElementById(`${input.id}-error`);
        if (errorElement) errorElement.classList.remove('visible');
    });
    
    // Clear from localStorage
    if (currentMode === "WAYPOINT") {
        localStorage.removeItem('waypointIdentifier');
        localStorage.removeItem('waypointCoords');
        localStorage.removeItem('magneticBearing');
        localStorage.removeItem('distance');
        localStorage.removeItem('declination');
        localStorage.removeItem('airportCode');
        localStorage.removeItem('vorIdentifier');
    } else {
        localStorage.removeItem('fixIdentifier');
        localStorage.removeItem('fixCoords');
        localStorage.removeItem('runwayCode');
        localStorage.removeItem('fixAirportCode');
    }
    
    showNotification('Input fields cleared!', 'info');
}

function copyOutput() {
    const outputText = document.getElementById('output-result').value.trim();
    
    if (outputText) {
        navigator.clipboard.writeText(outputText)
            .then(() => {
                showNotification("Result copied to clipboard!", 'success');
            })
            .catch((err) => {
                // Fallback for browsers that don't support clipboard API
                const textArea = document.getElementById('output-result');
                textArea.select();
                document.execCommand('copy');
                showNotification("Result copied to clipboard!", 'success');
            });
    } else {
        showNotification("No text to copy!", 'error');
    }
}

// New UX Enhancement Functions

// Form validation
function setupFormValidation() {
    // Waypoint form validation
    const waypointInputs = {
        'waypoint-identifier': { validate: validateIdentifier },
        'magnetic-bearing': { validate: validateBearing },
        'distance': { validate: validateDistance },
        'declination': { validate: validateDeclination },
        'airport-code': { validate: validateAirportCode },
        'vor-identifier': { validate: validateVorIdentifier },
    };
    
    // Fix form validation
    const fixInputs = {
        'fix-identifier': { validate: validateIdentifier },
        'runway-code': { validate: validateRunwayCode },
        'fix-airport-code': { validate: validateAirportCode },
    };
    
    // Setup validation for all inputs
    for (const [id, config] of Object.entries({...waypointInputs, ...fixInputs})) {
        const input = document.getElementById(id);
        if (!input) continue;
        
        input.addEventListener('input', function() {
            const result = config.validate(this.value);
            const errorElement = document.getElementById(`${id}-error`);
            
            if (result.valid) {
                this.classList.remove('error');
                this.classList.add('valid');
                if (errorElement) {
                    errorElement.textContent = '';
                    errorElement.classList.remove('visible');
                }
            } else {
                this.classList.remove('valid');
                this.classList.add('error');
                if (errorElement) {
                    errorElement.textContent = result.message;
                    errorElement.classList.add('visible');
                }
            }
        });
        
        // Validate on blur for better UX
        input.addEventListener('blur', function() {
            const result = config.validate(this.value);
            const errorElement = document.getElementById(`${id}-error`);
            
            // Only show errors on blur, not successes
            if (!result.valid) {
                this.classList.add('error');
                if (errorElement) {
                    errorElement.textContent = result.message;
                    errorElement.classList.add('visible');
                }
            }
        });
    }
}

// Validation functions
function validateIdentifier(value) {
    if (!value.trim()) return { valid: true, message: "" }; // Optional
    return { valid: value.trim().length > 0, message: "Identifier cannot be empty" };
}

function validateBearing(value) {
    if (!value.trim()) return { valid: false, message: "Bearing is required" };
    const bearing = parseFloat(value);
    return { 
        valid: !isNaN(bearing) && bearing >= 0 && bearing < 360, 
        message: "Bearing must be between 0 and 359 degrees" 
    };
}

function validateDistance(value) {
    if (!value.trim()) return { valid: false, message: "Distance is required" };
    const distance = parseFloat(value);
    return { 
        valid: !isNaN(distance) && distance > 0, 
        message: "Distance must be greater than 0" 
    };
}

function validateDeclination(value) {
    if (!value.trim()) return { valid: false, message: "Declination is required" };
    const declination = parseFloat(value);
    return { 
        valid: !isNaN(declination), 
        message: "Declination must be a number" 
    };
}

function validateAirportCode(value) {
    if (!value.trim()) return { valid: false, message: "Airport code is required" };
    return { 
        valid: value.trim().length === 4 && /^[A-Za-z]+$/.test(value), 
        message: "Airport code must be 4 letters" 
    };
}

function validateVorIdentifier(value) {
    if (!value.trim()) return { valid: true, message: "" }; // Optional
    return { 
        valid: value.trim().length >= 1 && value.trim().length <= 3 && /^[A-Za-z]+$/.test(value), 
        message: "VOR identifier should be 1-3 letters" 
    };
}

function validateRunwayCode(value) {
    if (!value.trim()) return { valid: false, message: "Runway code is required" };
    const code = parseInt(value);
    return { 
        valid: !isNaN(code) && code >= 0 && code <= 99, 
        message: "Runway code must be between 0 and 99" 
    };
}

// Auto-save function
function setupAutosave() {
    // Waypoint inputs
    const waypointInputIds = [
        'waypoint-identifier', 'waypoint-coords', 'magnetic-bearing', 
        'distance', 'declination', 'airport-code', 'vor-identifier'
    ];
    
    // Fix inputs
    const fixInputIds = [
        'fix-identifier', 'fix-coords', 'runway-code', 'fix-airport-code'
    ];
    
    // Select inputs
    const selectIds = [
        'waypoint-search-type', 'fix-search-type', 'operation-type', 
        'fix-type', 'fix-usage', 'fix-operation-type'
    ];
    
    // Save input values when they change
    [...waypointInputIds, ...fixInputIds].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function() {
                localStorage.setItem(id, this.value);
            });
        }
    });
    
    // Save select values when they change
    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.addEventListener('change', function() {
                localStorage.setItem(id, this.value);
            });
        }
    });
}

// Load saved values from localStorage
function loadSavedValues() {
    // Restore last active tab
    const savedMode = localStorage.getItem('currentMode');
    if (savedMode) {
        currentMode = savedMode;
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            if (btn.getAttribute('data-mode') === savedMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        if (currentMode === "WAYPOINT") {
            document.getElementById('waypoint-calculator').style.display = 'grid';
            document.getElementById('fix-calculator').style.display = 'none';
        } else {
            document.getElementById('waypoint-calculator').style.display = 'none';
            document.getElementById('fix-calculator').style.display = 'grid';
        }
    }
    
    // Restore inputs
    const allInputs = document.querySelectorAll('input:not([type="file"])');
    allInputs.forEach(input => {
        const savedValue = localStorage.getItem(input.id);
        if (savedValue) {
            input.value = savedValue;
        }
    });
    
    // Restore selects
    const allSelects = document.querySelectorAll('select');
    allSelects.forEach(select => {
        const savedValue = localStorage.getItem(select.id);
        if (savedValue) {
            select.value = savedValue;
        }
    });
    
    // Restore file names (visual only)
    const fixFileName = localStorage.getItem('fixFileName');
    const navFileName = localStorage.getItem('navFileName');
    
    if (fixFileName) {
        document.getElementById('fix-file-display').textContent = fixFileName;
        document.getElementById('fix-file-display').classList.add('has-file');
    }
    
    if (navFileName) {
        document.getElementById('nav-file-display').textContent = navFileName;
        document.getElementById('nav-file-display').classList.add('has-file');
    }
}

// Theme functions
function applyTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (savedTheme === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-icon').classList.remove('fa-moon');
        document.getElementById('theme-icon').classList.add('fa-sun');
    } else {
        document.body.classList.remove('dark-mode');
        document.getElementById('theme-icon').classList.remove('fa-sun');
        document.getElementById('theme-icon').classList.add('fa-moon');
    }
}

function toggleTheme() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    if (isDarkMode) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        document.getElementById('theme-icon').classList.remove('fa-sun');
        document.getElementById('theme-icon').classList.add('fa-moon');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        document.getElementById('theme-icon').classList.remove('fa-moon');
        document.getElementById('theme-icon').classList.add('fa-sun');
    }
}

// Improved tooltip functionality
function setupTooltips() {
    const tooltips = document.querySelectorAll('.tooltip');
    tooltips.forEach(tooltip => {
        tooltip.addEventListener('mouseenter', function() {
            const tooltipText = this.getAttribute('data-tooltip');
            const tooltipElement = document.createElement('div');
            tooltipElement.className = 'tooltip-popup';
            tooltipElement.textContent = tooltipText;
            document.body.appendChild(tooltipElement);
            
            const rect = this.getBoundingClientRect();
            tooltipElement.style.left = rect.left + (rect.width / 2) - (tooltipElement.offsetWidth / 2) + 'px';
            tooltipElement.style.top = rect.top - tooltipElement.offsetHeight - 10 + 'px';
            
            this.addEventListener('mouseleave', function tooltipRemove() {
                document.body.removeChild(tooltipElement);
                this.removeEventListener('mouseleave', tooltipRemove);
            });
        });
    });
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
        notification.remove();
    });
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Add appropriate icon
    let icon;
    switch (type) {
        case 'success':
            icon = 'check-circle';
            break;
        case 'error':
            icon = 'exclamation-circle';
            break;
        case 'info':
        default:
            icon = 'info-circle';
    }
    
    notification.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
    document.body.appendChild(notification);
    
    // Fade in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Automatically remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Keyboard shortcuts setup
function setupKeyboardShortcuts() {
    // Global keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Only process if Alt key is pressed (accesskey alternative for better cross-browser support)
        if (e.altKey) {
            switch (e.key.toLowerCase()) {
                case 'w': // Switch to Waypoint tab
                    document.getElementById('tab-waypoint').click();
                    break;
                case 'f': // Switch to Fix tab
                    document.getElementById('tab-fix').click();
                    break;
                case 'k': // Show keyboard shortcuts
                    toggleShortcutsModal();
                    break;
                case 'd': // Toggle dark mode
                    toggleTheme();
                    break;
                // Other shortcuts are handled by accesskey attribute
            }
        }
        
        // Escape key to close modals
        if (e.key === 'Escape') {
            document.getElementById('modal').style.display = 'none';
            document.getElementById('shortcuts-modal').style.display = 'none';
        }
    });
}

// Shortcuts modal functionality
function setupShortcutsModal() {
    const shortcutsToggle = document.getElementById('shortcuts-toggle');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const shortcutsClose = shortcutsModal.querySelector('.close');
    
    shortcutsToggle.addEventListener('click', toggleShortcutsModal);
    
    shortcutsClose.addEventListener('click', () => {
        shortcutsModal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === shortcutsModal) {
            shortcutsModal.style.display = 'none';
        }
    });
}

function toggleShortcutsModal() {
    const shortcutsModal = document.getElementById('shortcuts-modal');
    shortcutsModal.style.display = shortcutsModal.style.display === 'block' ? 'none' : 'block';
    
    // Focus on close button for keyboard accessibility
    if (shortcutsModal.style.display === 'block') {
        shortcutsModal.querySelector('.close').focus();
    }
} 