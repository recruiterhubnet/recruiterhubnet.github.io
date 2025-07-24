// js/timeToEngageView.js

import { state } from './state.js';
import { tteColumnsConfig } from './config.js';
import { populateFilters, formatDuration, formatNumber } from './ui.js'; // Import formatDuration and formatNumber

let isInitialized = false;
let activeTooltip = null; // To hold the currently visible tooltip element

// --- HELPER FUNCTIONS ---

function parseTTEValue(value) {
    if (value === "N/A" || value === null || value === undefined) {
        return null; // Represents no data, will be ignored
    }
    if (value === "-") {
        return Infinity; // Represents a lead that was not reached, treated as infinite time
    }
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}


function calculateColumnStats(values) {
    const validValues = values.filter(v => v !== null && isFinite(v));
    if (validValues.length === 0) return { sum: 0, average: 0, median: 0, min: 0, max: 0 };
    const sum = validValues.reduce((acc, v) => acc + v, 0);
    const sorted = [...validValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return { sum, average: sum / sorted.length, median, min: sorted[0], max: sorted[sorted.length - 1] };
}


// --- INITIALIZATION AND EVENT LISTENERS ---

export function initializeTimeToEngageView() {
    if (isInitialized) return;

    populateTimeToEngageFilters();
    addTTEEventListeners();
    renderTimeToEngage();
    isInitialized = true;
}

export function rerenderTimeToEngageView() {
    renderTimeToEngage();
}

function populateTimeToEngageFilters() {
    // --- Create Default Contract List ---
    const defaultContracts = ['ALL', 'CPM', 'CPML', 'LOO', 'LPOO', 'MCLOO', 'MCOO', 'OO', 'POG', 'TCPM', 'TCPML'];
    const defaultContractsList = defaultContracts.map(c => ({ contract_type: c }));

    populateFilters(document.getElementById('tteRecruiterFilter'), state.allData, 'recruiter_name', 'All Recruiters');
    populateFilters(document.getElementById('tteTeamFilter'), state.allData, 'team_name', 'All Teams');
    populateFilters(document.getElementById('tteCompanyFilter'), state.allData, 'company_name', null);
    // Use default list for Time to Engage
    populateFilters(document.getElementById('tteContractFilter'), defaultContractsList, 'contract_type', null);
}

function addTTEEventListeners() {
    const filters = ['tteRecruiterFilter', 'tteTeamFilter', 'tteCompanyFilter', 'tteContractFilter', 'tteDateFromFilter', 'tteDateToFilter', 'tteLeadTypeFilter'];
    filters.forEach(id => document.getElementById(id).addEventListener('change', renderTimeToEngage));

    const tteView = document.getElementById('timeToEngageView');

    // Delegated listener for sorting
    tteView.addEventListener('click', (e) => {
        const header = e.target.closest('.sortable');
        if (header) {
            sortTTEData(header.dataset.sortKey);
        }
    });

    document.getElementById('tteViewStubBtn').addEventListener('click', () => {
        if (state.tteViewMode === 'Stub') return;
        state.tteViewMode = 'Stub';
        document.getElementById('tteViewStubBtn').classList.add('active');
        document.getElementById('tteViewAverageBtn').classList.remove('active');
        renderTimeToEngage();
    });

    document.getElementById('tteViewAverageBtn').addEventListener('click', () => {
        if (state.tteViewMode === 'Average') return;
        state.tteViewMode = 'Average';
        document.getElementById('tteViewAverageBtn').classList.add('active');
        document.getElementById('tteViewStubBtn').classList.remove('active');
        renderTimeToEngage();
    });

    // --- NEW: Universal Tooltip Logic ---
    tteView.addEventListener('mouseover', (e) => {
        const icon = e.target.closest('.tooltip-icon');
        if (!icon) return;

        if (activeTooltip) activeTooltip.remove();

        const tooltipContainer = icon.closest('.tooltip-container');
        const tooltipTextEl = tooltipContainer.querySelector('.tooltip-text');
        
        if (!tooltipTextEl || !tooltipTextEl.innerHTML) return;

        activeTooltip = document.createElement('div');
        activeTooltip.className = 'tooltip-text'; // Use the base class for styling
        activeTooltip.style.cssText = `
            visibility: visible;
            opacity: 1;
            position: fixed; /* Use fixed positioning to escape containers */
            z-index: 110; /* Ensure it's above other elements */
            width: 350px; /* Set width from original element */
        `;
        activeTooltip.innerHTML = tooltipTextEl.innerHTML;
        document.body.appendChild(activeTooltip);

        const iconRect = icon.getBoundingClientRect();
        const tooltipRect = activeTooltip.getBoundingClientRect();
        
        let top = iconRect.bottom + 8;
        let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);

        // Prevent from going off-screen
        if (left < 8) left = 8;
        if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - 8;
        if (top + tooltipRect.height > window.innerHeight) top = iconRect.top - tooltipRect.height - 8;

        activeTooltip.style.left = `${left}px`;
        activeTooltip.style.top = `${top}px`;
    });

    tteView.addEventListener('mouseout', (e) => {
        const icon = e.target.closest('.tooltip-icon');
        if (icon && activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    });
}


// --- DATA PROCESSING AND SORTING ---

function sortTTEData(key) {
    const { tteSortConfig } = state;
    if (key) {
        if (tteSortConfig.key === key) {
            tteSortConfig.direction = tteSortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            tteSortConfig.key = key;
            tteSortConfig.direction = 'asc';
        }
    }
    renderTimeToEngage(); // Re-render to apply sort
}

function getConstructedKey(pKey, leadType) {
    return `p_${pKey.substring(1)}_engage_${leadType}`;
}

function processAndSortTTEData() {
    const recruiterFilter = document.getElementById('tteRecruiterFilter').value;
    const teamFilter = document.getElementById('tteTeamFilter').value;
    const companyFilter = document.getElementById('tteCompanyFilter').value;
    const contractFilter = document.getElementById('tteContractFilter').value;
    const fromDate = document.getElementById('tteDateFromFilter').value;
    const toDate = document.getElementById('tteDateToFilter').value;
    const leadType = document.getElementById('tteLeadTypeFilter').value;

    const baseFilteredData = state.allData.filter(row => {
        const rowDate = row.date.toISOString().split('T')[0];
        return (!recruiterFilter || row.recruiter_name === recruiterFilter) &&
            (!teamFilter || row.team_name === teamFilter) &&
            (!companyFilter || row.company_name === companyFilter) &&
            (!contractFilter || row.contract_type === contractFilter) &&
            (!fromDate || rowDate >= fromDate) &&
            (!toDate || rowDate <= toDate);
    });

    let processedData;

    if (state.tteViewMode === 'Stub') {
        processedData = baseFilteredData.map(row => {
            const newRow = { ...row };
            Object.keys(tteColumnsConfig).forEach(pKey => {
                if (pKey.startsWith('p')) {
                    ['new', 'old', 'total'].forEach(type => {
                        const newKey = getConstructedKey(pKey, type);
                        newRow[newKey] = parseTTEValue(row[newKey]);
                    });
                }
            });
            return newRow;
        });
    } else { // Average Mode
        const recruiterMap = new Map();
        const percentileKeys = Object.keys(tteColumnsConfig).filter(key => key.startsWith('p'));

        baseFilteredData.forEach(row => {
            if (!recruiterMap.has(row.recruiter_name)) {
                recruiterMap.set(row.recruiter_name, {
                    recruiter_name: row.recruiter_name,
                    team_name: row.team_name,
                    ...Object.fromEntries(percentileKeys.flatMap(pKey => [
                        [getConstructedKey(pKey, 'new'), { finite: [], infinite: 0 }],
                        [getConstructedKey(pKey, 'old'), { finite: [], infinite: 0 }],
                        [getConstructedKey(pKey, 'total'), { finite: [], infinite: 0 }]
                    ]))
                });
            }

            const recruiterData = recruiterMap.get(row.recruiter_name);
            percentileKeys.forEach(pKey => {
                ['new', 'old', 'total'].forEach(type => {
                    const key = getConstructedKey(pKey, type);
                    const parsedValue = parseTTEValue(row[key]);
                    if (parsedValue !== null) {
                        if (isFinite(parsedValue)) {
                            recruiterData[key].finite.push(parsedValue);
                        } else {
                            recruiterData[key].infinite++;
                        }
                    }
                });
            });
        });

        processedData = Array.from(recruiterMap.values()).map(recruiterData => {
            const averagedData = {
                recruiter_name: recruiterData.recruiter_name,
                team_name: recruiterData.team_name
            };
            percentileKeys.forEach(pKey => {
                ['new', 'old', 'total'].forEach(type => {
                   const key = getConstructedKey(pKey, type);
                   const { finite, infinite } = recruiterData[key]; // 'finite' is an array of numbers, 'infinite' is a count

                   // Create a combined array for median calculation, ensuring 'infinite' occurrences are treated as Infinity
                   const valuesForMedian = [...finite];
                   for (let i = 0; i < infinite; i++) {
                       valuesForMedian.push(Infinity); // <--- CHANGED: Push Infinity for each 'infinite' occurrence
                   }

                   if (valuesForMedian.length > 0) {
                       // Calculate median of all relevant values (finite and Infinity)
                       const sorted = [...valuesForMedian].sort((a, b) => a - b); // Sorts Infinity to the end
                       const mid = Math.floor(sorted.length / 2);

                       // Handle median calculation for both odd and even number of elements
                       if (sorted.length % 2 === 0) {
                           // If the sorted array has an even number of elements, median is the average of the two middle elements.
                           // If one or both middle elements are Infinity, the median is Infinity.
                           if (isFinite(sorted[mid - 1]) && isFinite(sorted[mid])) {
                               averagedData[key] = (sorted[mid - 1] + sorted[mid]) / 2;
                           } else {
                               averagedData[key] = Infinity; // If one or both middle values are Infinity, the median is Infinity
                           }
                       } else {
                           // If the sorted array has an odd number of elements, median is the middle element.
                           averagedData[key] = sorted[mid];
                       }
                   } else { // No finite values and no infinite values (meaning only nulls/N/A were present)
                       averagedData[key] = null;
                   }
                });
           });
            return averagedData;
        });
    }

    const checkKeys = Object.keys(tteColumnsConfig).filter(key => key.startsWith('p'));
    let finalData = processedData.filter(row => {
        return checkKeys.some(pKey => {
            const key = getConstructedKey(pKey, leadType);
            const value = row[key];
            return value !== null && value !== undefined;
        });
    });

    // --- SORTING LOGIC ---
    const { key, direction } = state.tteSortConfig;
    const dir = direction === 'asc' ? 1 : -1;

    finalData.sort((a, b) => {
        let valA, valB;

        if (key.startsWith('p')) {
            const constructedKey = getConstructedKey(key, leadType);
            valA = a[constructedKey];
            valB = b[constructedKey];
        } else {
            valA = a[key];
            valB = b[key];
        }
        
        // Handle null, undefined, and Infinity
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1 * dir;
        if (valB === null || valB === undefined) return -1 * dir;
        if (!isFinite(valA) && isFinite(valB)) return 1 * dir; // Infinity goes to the end
        if (isFinite(valA) && !isFinite(valB)) return -1 * dir;
        if (!isFinite(valA) && !isFinite(valB)) return 0;


       // Explicitly handle date type comparison using timestamps
       if (tteColumnsConfig[key]?.type === 'date') {
        // Ensure values are Date objects or can be converted to numbers (timestamps)
        const timeA = valA instanceof Date ? valA.getTime() : (typeof valA === 'string' ? new Date(valA).getTime() : Number(valA));
        const timeB = valB instanceof Date ? valB.getTime() : (typeof valB === 'string' ? new Date(valB).getTime() : Number(valB));
        return (timeA - timeB) * dir;
    }
    // Handle number type comparison
    if (tteColumnsConfig[key]?.type === 'number') {
        return (Number(valA) - Number(valB)) * dir;
    }

    // Corrected logic: Ensure values are explicitly converted to strings for comparison
    const stringA = (valA !== null && valA !== undefined) ? String(valA).trim().toLowerCase() : '';
    const stringB = (valB !== null && valB !== undefined) ? String(valB).trim().toLowerCase() : '';
    return stringA.localeCompare(stringB) * dir;
});

    return finalData;
}


// --- RENDERING ---

function renderTimeToEngage() {
    renderTTEHeaders();
    const processedData = processAndSortTTEData();
    renderTTETable(processedData);
    renderTTETableFooter(processedData);
}

function renderTTEHeaders() {
    const header = document.getElementById('tteTableHeader');
    
    const tableTooltipContent = `
        <div class="font-bold mb-1">Understanding Time to Engage (TTE) Table:</div>
        <div class="text-xs">
            <p>This table provides insights into the time taken for unique phone reveals to receive their first engagement (via call or SMS) for recruiters, teams, companies, and contract types.</p>
            <p class="mt-2"><strong>Lower times are generally better, indicating faster engagement.</strong></p>
            <p class="mt-2"><strong>Percentile Columns (P10, P50, etc.):</strong></p>
            <ul class="list-disc pl-4 mt-1">
                <li><strong>P10:</strong> 10% of reveals were engaged within this time.</li>
                <li><strong>P50 (Median):</strong> 50% of reveals were engaged within this time.</li>
                <li><strong>P90:</strong> 90% of reveals were engaged within this time.</li>
            </ul>
            <p class="mt-2"><strong>What do 'N/A' and '∞' mean?</strong></p>
            <ul class="list-disc pl-4 mt-1">
               <li><strong>N/A:</strong> Not Applicable/Available. Signifies there were no leads assigned that met the filter criteria.</li>
               <li><strong>∞ (Infinity):</strong> Indicates leads were assigned, but the specified percentile of them were never engaged.</li>
           </ul>
        </div>
    `;
    
    const visibleColumns = Object.entries(tteColumnsConfig)
        .filter(([key]) => state.tteViewMode === 'Stub' || key !== 'date');

    header.innerHTML = visibleColumns.map(([key, conf]) => {
        const { key: sortKey, direction: sortDir } = state.tteSortConfig;
        const isSorted = sortKey === key;
        const sortClasses = isSorted ? `sorted-${sortDir}` : '';
        const isTooltipColumn = key === 'p10';

        let headerHtml = `<th scope="col" class="table-header-cell sortable ${sortClasses} py-2 px-1 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer" data-sort-key="${key}">`;
        
        headerHtml += `<div class="flex items-center justify-center relative h-full">`;
        headerHtml += `<span>${conf.label}</span>`;
        
        if (isTooltipColumn) {
             // The tooltip div is now just a hidden data container
             headerHtml += `<div class="tooltip-container ml-1"><i class="fas fa-question-circle tooltip-icon text-gray-400 hover:text-white cursor-pointer"></i><div class="tooltip-text" style="display: none;">${tableTooltipContent}</div></div>`;
        }

        headerHtml += `<span class="sort-icon sort-icon-up ml-2"><i class="fas fa-arrow-up"></i></span><span class="sort-icon sort-icon-down ml-2"><i class="fas fa-arrow-down"></i></span>`;
        headerHtml += `</div></th>`;
        
        return headerHtml;
    }).join('');
}


function renderTTETable(data) {
    const tableBody = document.getElementById('tteTableBody');
    const leadType = document.getElementById('tteLeadTypeFilter').value;
    const isDayView = state.tteViewMode === 'Stub';

    if (!data || data.length === 0) {
        const colspan = Object.keys(tteColumnsConfig).length - (isDayView ? 0 : 1);
        tableBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center p-8 text-gray-500">No matching records found.</td></tr>`;
        return;
    }

    const percentileKeys = Object.keys(tteColumnsConfig).filter(key => key.startsWith('p'));
    const columnSortedValues = {};

    percentileKeys.forEach(pKey => {
        const key = getConstructedKey(pKey, leadType);
        const values = data.map(row => row[key]).filter(val => val !== null && isFinite(val));
        if (values.length > 0) {
            columnSortedValues[pKey] = values.sort((a, b) => a - b);
        } else {
            columnSortedValues[pKey] = [];
        }
    });

    const getHeatmapColor = (value, pKey) => {
        const sortedValues = columnSortedValues[pKey];

        if (value === null || !isFinite(value) || !sortedValues || sortedValues.length === 0) {
            return { bgColor: 'bg-gray-800/40', textColor: 'text-white' };
        }
        if (sortedValues[0] === sortedValues[sortedValues.length - 1]) return { bgColor: 'bg-green-700/50', textColor: 'text-white' };
        
        let index = sortedValues.findIndex(val => val >= value);
        if (index === -1) {
            index = sortedValues.length - 1;
        }
        const percentage = sortedValues.length > 1 ? index / (sortedValues.length - 1) : 0;
        
        const colorScale = ['#166534', '#15803d', '#16a34a', '#22c55e', '#facc15', '#fbbf24', '#f97316', '#ef4444', '#dc2626', '#b91c1c'];
        const shadeIndex = Math.floor(percentage * colorScale.length);
        const color = colorScale[Math.min(shadeIndex, colorScale.length - 1)];

        const bgColorClass = `bg-[${color}]`;
        let textColorClass = 'text-white';
        if (color === '#facc15' || color === '#fbbf24') {
            textColorClass = 'text-gray-900';
        }
        return { bgColor: bgColorClass, textColor: textColorClass };
    };

    const tableHTML = data.map(row => {
        const percentileCells = percentileKeys.map(pKey => {
            const key = getConstructedKey(pKey, leadType);
            const value = row[key];
            const { bgColor, textColor } = getHeatmapColor(value, pKey);
            const formattedValue = value === Infinity ? '∞' : formatDuration(value);
            return `<td class="py-1.5 px-1 whitespace-nowrap text-center font-mono ${bgColor} ${textColor}">${formattedValue}</td>`;
        }).join('');
        
        const dateCell = isDayView 
            ? `<td class="py-1.5 px-2 whitespace-nowrap text-left text-gray-400">${new Date(row.date).toLocaleDateString()}</td>`
            : '';
        const recruiterCell = `<td class="py-1.5 px-2 whitespace-nowrap text-left text-sky-400">${row.recruiter_name}</td>`;
        const teamCell = `<td class="py-1.5 px-2 whitespace-nowrap text-left text-gray-400">${row.team_name || ''}</td>`;

        return `<tr class="table-body-row hover:bg-gray-800/50 transition-colors">${dateCell}${recruiterCell}${teamCell}${percentileCells}</tr>`;
    }).join('');

    tableBody.innerHTML = tableHTML;
}


function renderTTETableFooter(data) {
    const footerRow = document.getElementById('tteTableFooter');
    if (!footerRow) return;
    footerRow.innerHTML = '';

    const leadType = document.getElementById('tteLeadTypeFilter').value;
    const isDayView = state.tteViewMode === 'Stub';
    const visibleColumns = Object.entries(tteColumnsConfig)
        .filter(([key]) => isDayView || key !== 'date');

    const footerCellsHtml = visibleColumns.map(([key, config], index) => {
        let cellContent = '';
        let cellClasses = 'py-1 px-1';

        const summaryDropdownIndex = isDayView ? 1 : 0;

        if (index === summaryDropdownIndex) {
            cellContent = `
                <select id="tteSummaryStatSelect" class="control-deck-select text-xs w-full">
                     <option value="average" ${state.tteSummaryStat === 'average' ? 'selected' : ''}>Average</option>
                     <option value="median" ${state.tteSummaryStat === 'median' ? 'selected' : ''}>Median</option>
                     <option value="min" ${state.tteSummaryStat === 'min' ? 'selected' : ''}>Min</option>
                     <option value="max" ${state.tteSummaryStat === 'max' ? 'selected' : ''}>Max</option>
                </select>
            `;
        } else if (config.type === 'number') {
            cellClasses += ' whitespace-nowrap text-center font-mono text-gray-500';
            const constructedKey = getConstructedKey(key, leadType);
            const values = data.map(row => row[constructedKey]);
            const stats = calculateColumnStats(values);
            const statValue = stats[state.tteSummaryStat];
            cellContent = (statValue === 0 && values.every(v => v !== 0)) ? 'N/A' : formatDuration(statValue);
        } else {
            cellContent = '';
        }
        return `<td class="table-footer-cell ${cellClasses}">${cellContent}</td>`;
    }).join('');

    footerRow.innerHTML = footerCellsHtml;

    const tteSummaryStatSelect = document.getElementById('tteSummaryStatSelect');
    if (tteSummaryStatSelect) {
        tteSummaryStatSelect.addEventListener('change', (e) => {
            state.tteSummaryStat = e.target.value;
            renderTTETableFooter(data);
        });
    }
}