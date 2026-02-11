// js/timeToEngageView.js

import { state } from './state.js';
import { tteColumnsConfig } from './config.js';
import { populateFilters, formatDuration, formatNumber } from './ui.js';

let isInitialized = false;
let activeTooltip = null;

// --- HELPER FUNCTIONS ---

function parseTTEValue(value) {
    if (value === "N/A" || value === null || value === undefined) {
        return null;
    }
    if (value === "-") {
        return Infinity;
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
    const defaultContracts = ['ALL', 'CPM', 'CPML', 'LOO', 'LPOO', 'MCLOO', 'MCOO', 'OO', 'POG', 'TCPM', 'TCPML', 'TPOG'];
    const defaultContractsList = defaultContracts.map(c => ({ contract_type: c }));

    populateFilters(document.getElementById('tteRecruiterFilter'), state.allData, 'recruiter_name', 'All Recruiters');
    populateFilters(document.getElementById('tteTeamFilter'), state.allData, 'team_name', 'All Teams');
    populateFilters(document.getElementById('tteCompanyFilter'), state.allData, 'company_name', null);
    populateFilters(document.getElementById('tteContractFilter'), defaultContractsList, 'contract_type', null);
}

function addTTEEventListeners() {
    const filters = ['tteRecruiterFilter', 'tteTeamFilter', 'tteCompanyFilter', 'tteContractFilter', 'tteDateFromFilter', 'tteDateToFilter', 'tteLeadTypeFilter'];
    filters.forEach(id => document.getElementById(id).addEventListener('change', renderTimeToEngage));

    // MODIFICATION START: Added listeners for the new data type switcher
    document.getElementById('tteDataTypeStandardBtn').addEventListener('click', () => {
        if (state.tteDataType === 'standard') return;
        state.tteDataType = 'standard';
        document.getElementById('tteDataTypeStandardBtn').classList.add('active');
        document.getElementById('tteDataTypeHotFreshBtn').classList.remove('active');
        document.getElementById('tteLeadTypeFilterContainer').classList.remove('hidden');
        renderTimeToEngage();
    });

    document.getElementById('tteDataTypeHotFreshBtn').addEventListener('click', () => {
        if (state.tteDataType === 'hotfresh') return;
        state.tteDataType = 'hotfresh';
        document.getElementById('tteDataTypeHotFreshBtn').classList.add('active');
        document.getElementById('tteDataTypeStandardBtn').classList.remove('active');
        document.getElementById('tteLeadTypeFilterContainer').classList.add('hidden');
        renderTimeToEngage();
    });
    // MODIFICATION END

    const tteView = document.getElementById('timeToEngageView');

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

    tteView.addEventListener('mouseover', (e) => {
        const icon = e.target.closest('.tooltip-icon');
        if (!icon) return;

        if (activeTooltip) activeTooltip.remove();

        const tooltipContainer = icon.closest('.tooltip-container');
        const tooltipTextEl = tooltipContainer.querySelector('.tooltip-text');
        
        if (!tooltipTextEl || !tooltipTextEl.innerHTML) return;

        activeTooltip = document.createElement('div');
        activeTooltip.className = 'tooltip-text';
        activeTooltip.style.cssText = `
            visibility: visible;
            opacity: 1;
            position: fixed;
            z-index: 110;
            width: 350px;
        `;
        activeTooltip.innerHTML = tooltipTextEl.innerHTML;
        document.body.appendChild(activeTooltip);

        const iconRect = icon.getBoundingClientRect();
        const tooltipRect = activeTooltip.getBoundingClientRect();
        
        let top = iconRect.bottom + 8;
        let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);

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
    renderTimeToEngage();
}

// MODIFICATION START: Updated function to be dynamic
function getConstructedKey(pKey, row) {
    const pValue = pKey.substring(1); 
    if (state.tteDataType === 'standard') {
        const leadType = document.getElementById('tteLeadTypeFilter').value;
        return `p_${pValue}_engage_${leadType}`;
    } else { // 'hotfresh' mode
        // CORRECT: Checks the team name for each row.
        if (row.team_name === 'Profilers') {
            // If the team is 'Profilers', it uses the 'fresh_leads' data column.
            return `p_${pValue}_engage_fresh_leads`;
        } 
        else {
            // For any other team, it uses the standard 'hot leads' data column.
            return `p_${pValue}_engage`;
        }
    }
}
// MODIFICATION END

function processAndSortTTEData() {
    const recruiterFilter = document.getElementById('tteRecruiterFilter').value;
    const teamFilter = document.getElementById('tteTeamFilter').value;
    const companyFilter = document.getElementById('tteCompanyFilter').value;
    const contractFilter = document.getElementById('tteContractFilter').value;
    const fromDate = document.getElementById('tteDateFromFilter').value;
    const toDate = document.getElementById('tteDateToFilter').value;
    
    // MODIFICATION: No longer need leadType here as it's handled dynamically
    // const leadType = document.getElementById('tteLeadTypeFilter').value;

    const baseFilteredData = state.allData.filter(row => {
        const rowDate = row.date.toISOString().split('T')[0];
        return row.level === 'RECRUITER' && // <<< THIS IS THE NEW LINE
            (!recruiterFilter || row.recruiter_name === recruiterFilter) &&
            (!teamFilter || row.team_name === teamFilter) &&
            (!companyFilter || row.company_name === companyFilter) &&
            (!contractFilter || row.contract_type === contractFilter) &&
            (!fromDate || rowDate >= fromDate) &&
            (!toDate || rowDate <= toDate);
    });

    let processedData;
    const percentileKeys = Object.keys(tteColumnsConfig).filter(key => key.startsWith('p'));

    // MODIFICATION START: Updated processing logic for both Stub and Average modes
    if (state.tteViewMode === 'Stub') {
        processedData = baseFilteredData.map(row => {
            const newRow = { ...row };
            percentileKeys.forEach(pKey => {
                const constructedKey = getConstructedKey(pKey, row);
                newRow[`display_${pKey}`] = parseTTEValue(row[constructedKey]);
            });
            return newRow;
        });
    } else { // Average Mode
        const recruiterMap = new Map();

        baseFilteredData.forEach(row => {
            if (!recruiterMap.has(row.recruiter_name)) {
                recruiterMap.set(row.recruiter_name, {
                    recruiter_name: row.recruiter_name,
                    team_name: row.team_name,
                    percentile_values: Object.fromEntries(percentileKeys.map(pKey => [pKey, { finite: [], infinite: 0 }]))
                });
            }

            const recruiterData = recruiterMap.get(row.recruiter_name);
            percentileKeys.forEach(pKey => {
                const key = getConstructedKey(pKey, row);
                const parsedValue = parseTTEValue(row[key]);
                if (parsedValue !== null) {
                    if (isFinite(parsedValue)) {
                        recruiterData.percentile_values[pKey].finite.push(parsedValue);
                    } else {
                        recruiterData.percentile_values[pKey].infinite++;
                    }
                }
            });
        });

        processedData = Array.from(recruiterMap.values()).map(recruiterData => {
            const averagedData = {
                recruiter_name: recruiterData.recruiter_name,
                team_name: recruiterData.team_name
            };
            percentileKeys.forEach(pKey => {
                const { finite, infinite } = recruiterData.percentile_values[pKey];
                const valuesForMedian = [...finite];
                for (let i = 0; i < infinite; i++) {
                    valuesForMedian.push(Infinity);
                }

                if (valuesForMedian.length > 0) {
                    const sorted = valuesForMedian.sort((a, b) => a - b);
                    const mid = Math.floor(sorted.length / 2);
                    if (sorted.length % 2 === 0) {
                        averagedData[`display_${pKey}`] = (isFinite(sorted[mid - 1]) && isFinite(sorted[mid])) ? (sorted[mid - 1] + sorted[mid]) / 2 : Infinity;
                    } else {
                        averagedData[`display_${pKey}`] = sorted[mid];
                    }
                } else {
                    averagedData[`display_${pKey}`] = null;
                }
            });
            return averagedData;
        });
    }

    let finalData = processedData.filter(row => {
        return percentileKeys.some(pKey => {
            const value = row[`display_${pKey}`];
            return value !== null && value !== undefined;
        });
    });
    // MODIFICATION END

    const { key, direction } = state.tteSortConfig;
    const dir = direction === 'asc' ? 1 : -1;

    finalData.sort((a, b) => {
        // MODIFICATION START: Sort by the dynamic 'display_' properties for percentiles
        const sortKey = key.startsWith('p') ? `display_${key}` : key;
        let valA = a[sortKey];
        let valB = b[sortKey];
        // MODIFICATION END
        
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1 * dir;
        if (valB === null || valB === undefined) return -1 * dir;
        if (!isFinite(valA) && isFinite(valB)) return 1 * dir;
        if (isFinite(valA) && !isFinite(valB)) return -1 * dir;
        if (!isFinite(valA) && !isFinite(valB)) return 0;

       if (tteColumnsConfig[key]?.type === 'date') {
        const timeA = valA instanceof Date ? valA.getTime() : (typeof valA === 'string' ? new Date(valA).getTime() : Number(valA));
        const timeB = valB instanceof Date ? valB.getTime() : (typeof valB === 'string' ? new Date(valB).getTime() : Number(valB));
        return (timeA - timeB) * dir;
    }
    if (tteColumnsConfig[key]?.type === 'number') {
        return (Number(valA) - Number(valB)) * dir;
    }

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
             headerHtml += `<div class="tooltip-container ml-1"><i class="fas fa-question-circle tooltip-icon text-gray-400 hover:text-white cursor-pointer"></i><div class="tooltip-text" style="display: none;">${tableTooltipContent}</div></div>`;
        }

        headerHtml += `<span class="sort-icon sort-icon-up ml-2"><i class="fas fa-arrow-up"></i></span><span class="sort-icon sort-icon-down ml-2"><i class="fas fa-arrow-down"></i></span>`;
        headerHtml += `</div></th>`;
        
        return headerHtml;
    }).join('');
}


function renderTTETable(data) {
    const tableBody = document.getElementById('tteTableBody');
    const isDayView = state.tteViewMode === 'Stub';

    if (!data || data.length === 0) {
        const colspan = Object.keys(tteColumnsConfig).length - (isDayView ? 0 : 1);
        tableBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center p-8 text-gray-500">No matching records found.</td></tr>`;
        return;
    }

    const percentileKeys = Object.keys(tteColumnsConfig).filter(key => key.startsWith('p'));
    const columnSortedValues = {};

    percentileKeys.forEach(pKey => {
        const values = data.map(row => row[`display_${pKey}`]).filter(val => val !== null && isFinite(val));
        columnSortedValues[pKey] = values.length > 0 ? values.sort((a, b) => a - b) : [];
    });

    const getHeatmapColor = (value, pKey) => {
        const sortedValues = columnSortedValues[pKey];
        if (value === null || !isFinite(value) || !sortedValues || sortedValues.length === 0) {
            return { bgColor: 'bg-gray-800/40', textColor: 'text-white' };
        }
        if (sortedValues[0] === sortedValues[sortedValues.length - 1]) return { bgColor: 'bg-green-700/50', textColor: 'text-white' };
        
        let index = sortedValues.findIndex(val => val >= value);
        if (index === -1) index = sortedValues.length - 1;
        
        const percentage = sortedValues.length > 1 ? index / (sortedValues.length - 1) : 0;
        const colorScale = ['#166534', '#15803d', '#16a34a', '#22c55e', '#facc15', '#fbbf24', '#f97316', '#ef4444', '#dc2626', '#b91c1c'];
        const shadeIndex = Math.min(Math.floor(percentage * colorScale.length), colorScale.length - 1);
        const color = colorScale[shadeIndex];

        const bgColorClass = `bg-[${color}]`;
        const textColorClass = (color === '#facc15' || color === '#fbbf24') ? 'text-gray-900' : 'text-white';
        return { bgColor: bgColorClass, textColor: textColorClass };
    };

    const tableHTML = data.map(row => {
        // MODIFICATION START: Use the dynamic 'display_' properties
        const percentileCells = percentileKeys.map(pKey => {
            const value = row[`display_${pKey}`];
            const { bgColor, textColor } = getHeatmapColor(value, pKey);
            const formattedValue = value === Infinity ? '∞' : formatDuration(value);
            return `<td class="py-1.5 px-1 whitespace-nowrap text-center font-mono ${bgColor} ${textColor}">${formattedValue}</td>`;
        }).join('');
        // MODIFICATION END
        
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
            // MODIFICATION START: Use the dynamic 'display_' properties for calculation
            const values = data.map(row => row[`display_${key}`]);
            // MODIFICATION END
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
