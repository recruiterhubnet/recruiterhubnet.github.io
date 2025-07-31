// js/arrivalsView.js

import { state } from './state.js';

let isInitialized = false; // Add this line
let activeTooltip = null; // Add this line

// --- CONFIGURATION ---
const columnsConfig = {
    recruiter_name: { label: 'Recruiter', type: 'string' },
    team_name: { label: 'Team', type: 'string' },
    total_arrivals: { 
        label: 'Total Arrivals', 
        type: 'number', 
        tooltip: "Data is taken into account from TMS > PROFILES > DRIVERS > CONTRACT, where RECRUITED DATE is considered. Includes records where END DATE - START DATE is more than 7 days, or where an end date doesn't exist." 
    },
    total_drug_tests: { 
        label: 'Total Drug Tests', 
        type: 'number',
        tooltip: "Data is gathered from leads' DT SCHEDULE DATE."
    },
};

const filterElements = {
    recruiter: document.getElementById('arrivalsRecruiterFilter'),
    team: document.getElementById('arrivalsTeamFilter'),
    company: document.getElementById('arrivalsCompanyFilter'),
    contract: document.getElementById('arrivalsContractFilter'),
   
    dateFrom: document.getElementById('arrivalsDateFromFilter'),
    dateTo: document.getElementById('arrivalsDateToFilter'),
};

// --- INITIALIZATION ---
export function initializeArrivalsView() {
    addEventListeners();
    // Initial render is handled by the populateAllDropdowns function in app.js
}

function addEventListeners() {
    // Add listeners to all standard filters
    Object.values(filterElements).forEach(el => {
        if(el) el.addEventListener('change', renderAll);
    });

    const arrivalsView = document.getElementById('arrivalsView');
    if (!arrivalsView) return;

    arrivalsView.addEventListener('click', (e) => {
        const header = e.target.closest('.sortable');
        if (header) {
            handleSort(e);
        }
    });

    // --- START: ADDED TOOLTIP EVENT LISTENERS ---
    arrivalsView.addEventListener('mouseover', (e) => {
        const icon = e.target.closest('.help-tooltip-icon');
        if (!icon) return;

        if (activeTooltip) activeTooltip.remove();

        const tooltipContainer = icon.closest('.help-tooltip-container');
        const tooltipTextEl = tooltipContainer.querySelector('.help-tooltip-text');
        
        if (!tooltipTextEl || !tooltipTextEl.innerHTML) return;

        activeTooltip = document.createElement('div');
        activeTooltip.className = 'help-tooltip-text'; // Use the class for styling
        activeTooltip.style.cssText = `
            visibility: visible;
            opacity: 1;
            position: fixed; /* Use fixed positioning */
            z-index: 110;
        `;
        activeTooltip.innerHTML = tooltipTextEl.innerHTML;
        // Make sure the width is set from the original tooltip if it exists
        activeTooltip.style.width = tooltipTextEl.style.width || '300px'; 
        
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

    arrivalsView.addEventListener('mouseout', (e) => {
        const icon = e.target.closest('.help-tooltip-icon');
        if (icon && activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    });
    // --- END: ADDED TOOLTIP EVENT LISTENERS ---
}


function handleSort(e) {
    const header = e.target.closest('.sortable');
    if (!header) return;
    const key = header.dataset.sortKey;
    if (state.arrivalsSortConfig.key === key) {
        state.arrivalsSortConfig.direction = state.arrivalsSortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.arrivalsSortConfig.key = key;
        state.arrivalsSortConfig.direction = 'asc';
    }
    renderAll();
}

// --- DATA PROCESSING ---
function getFilters() {
     return {
        recruiter: filterElements.recruiter.value,
        team: filterElements.team.value,
        company: filterElements.company.value,
        contract: filterElements.contract.value,
        
        dateFrom: filterElements.dateFrom.value ? new Date(filterElements.dateFrom.value) : null,
        dateTo: filterElements.dateTo.value ? new Date(new Date(filterElements.dateTo.value).getTime() + (24 * 60 * 60 * 1000 -1)) : null,
    };
}

function getFilteredData() {
    const filters = getFilters();

    const dateFilter = (row) => {
        if (!filters.dateFrom || !filters.dateTo) return true;
        return row.date >= filters.dateFrom && row.date <= filters.dateTo;
    };

    // Filter arrivals data
    const arrivals = state.arrivalsData.filter(row =>
        dateFilter(row) &&
        (!filters.recruiter || row.recruiter_name === filters.recruiter) &&
        (!filters.team || row.team_name === filters.team) &&
        (!filters.contract || row.contract_type === filters.contract)
        // Company filter is intentionally omitted for arrivals as it's not present in that dataset
    );

    // Base filter for all drug tests based on UI controls
    const baseDrugTestFilter = row =>
        dateFilter(row) &&
        (!filters.recruiter || row.recruiter_name === filters.recruiter) &&
        (!filters.team || row.team_name === filters.team) &&
        (!filters.company || row.company_name === filters.company) &&
        (!filters.contract || row.contract_type === filters.contract);

    // Data for the table (includes PROFILERS)
    const drugTestsForTable = state.drugTestsData.filter(baseDrugTestFilter);

    // Data for KPIs and Chart (excludes PROFILERS)
    const drugTestsForDisplay = drugTestsForTable.filter(row => row.team_name !== 'Profilers');

    return { arrivals, drugTestsForTable, drugTestsForDisplay };
}


function aggregateDataForTable({ arrivals, drugTests }) {
    const recruiterMap = new Map();

    const ensureRecruiter = (recruiterName, teamName) => {
        if (!recruiterMap.has(recruiterName)) {
            recruiterMap.set(recruiterName, {
                recruiter_name: recruiterName,
                team_name: teamName || 'N/A',
                total_arrivals: 0,
                total_drug_tests: 0,
            });
        }
    };

    arrivals.forEach(row => {
        if (!row.recruiter_name) return;
        ensureRecruiter(row.recruiter_name, row.team_name);
        recruiterMap.get(row.recruiter_name).total_arrivals++;
    });

    drugTests.forEach(row => {
        if (!row.recruiter_name) return;
        ensureRecruiter(row.recruiter_name, row.team_name);
        recruiterMap.get(row.recruiter_name).total_drug_tests++;
    });

    return Array.from(recruiterMap.values());
}

function sortData(data) {
    const { key, direction } = state.arrivalsSortConfig;
    const dir = direction === 'asc' ? 1 : -1;

    data.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (columnsConfig[key]?.type === 'number') {
            return (Number(valA) - Number(valB)) * dir;
        }
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
    return data;
}

// --- RENDERING ---
export function renderAll() {
    if (!state.arrivalsData && !state.drugTestsData) return;

    const { arrivals, drugTestsForTable, drugTestsForDisplay } = getFilteredData();
    const aggregatedData = aggregateDataForTable({ arrivals, drugTests: drugTestsForTable }); // Use table data
    const sortedData = sortData(aggregatedData);

    renderKPIs({ arrivals, drugTests: drugTestsForDisplay }); // Use display data for KPI
    renderTableHeader();
    renderTableBody(sortedData);
    renderTableFooter(sortedData);
    renderChart({ arrivals, drugTests: drugTestsForDisplay }); // Use display data for Chart
}

function renderKPIs({ arrivals, drugTests }) {
    document.getElementById('kpiTotalArrivals').textContent = arrivals.length;
    document.getElementById('kpiTotalDrugTests').textContent = drugTests.length;
}

function renderTableHeader() {
    const header = document.getElementById('arrivalsTableHeader');
    header.innerHTML = Object.entries(columnsConfig).map(([key, conf]) => {
        const { key: sortKey, direction: sortDir } = state.arrivalsSortConfig;
        const isSorted = sortKey === key;
        const sortClasses = isSorted ? `sorted-${sortDir}` : '';
        const alignClass = conf.type === 'number' || key === 'team_name' ? 'text-center' : 'text-left';
        
        const tooltipHtml = conf.tooltip ? `<div class="help-tooltip-container ml-1"><i class="fas fa-question-circle help-tooltip-icon text-xs"></i><div class="help-tooltip-text" style="display: none; width: 300px;">${conf.tooltip}</div></div>` : '';

        return `<th class="table-header-cell p-2 ${alignClass} text-xs font-semibold text-gray-400 uppercase tracking-wider sortable ${sortClasses} cursor-pointer" data-sort-key="${key}">
            <div class="flex items-center ${alignClass === 'text-center' ? 'justify-center' : ''}">
                <span>${conf.label}</span>
                ${tooltipHtml}
                <span class="sort-icon sort-icon-up ml-2"><i class="fas fa-arrow-up"></i></span>
                <span class="sort-icon sort-icon-down ml-2"><i class="fas fa-arrow-down"></i></span>
            </div>
        </th>`;
    }).join('');
}

function renderTableBody(data) {
    const tableBody = document.getElementById('arrivalsTableBody');
    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${Object.keys(columnsConfig).length}" class="text-center p-8 text-gray-500">No matching records found.</td></tr>`;
        return;
    }
    tableBody.innerHTML = data.map(row => `
        <tr class="hover:bg-gray-800/50 transition-colors">
            ${Object.keys(columnsConfig).map(key => {
                let content = row[key] ?? '0';
                let classes = 'p-2 whitespace-nowrap';
                 if (columnsConfig[key].type === 'number' || key === 'team_name') {
                    classes += ' text-center';
                }
                if (columnsConfig[key].type === 'number') {
                    classes += ' font-mono';
                }
                if (key === 'recruiter_name') {
                    classes += ' text-sky-400 font-semibold';
                }
                 if (key === 'team_name') {
                    classes += ' text-gray-400';
                }
                return `<td class="${classes}">${content}</td>`;
            }).join('')}
        </tr>`).join('');
}

function renderTableFooter(data) {
    const footer = document.getElementById('arrivalsTableFooter');
    if (data.length === 0) {
        footer.innerHTML = '';
        return;
    }

    const totals = { total_arrivals: 0, total_drug_tests: 0 };
    data.forEach(row => {
        totals.total_arrivals += row.total_arrivals;
        totals.total_drug_tests += row.total_drug_tests;
    });

    footer.innerHTML = `<tr>
        <td class="table-footer-cell p-2 font-bold text-left">Total</td>
        <td class="table-footer-cell p-2"></td>
        <td class="table-footer-cell p-2 text-center font-mono font-bold">${totals.total_arrivals}</td>
        <td class="table-footer-cell p-2 text-center font-mono font-bold">${totals.total_drug_tests}</td>
    </tr>`;
}

function renderChart({ arrivals, drugTests }) {
    const ctx = document.getElementById('arrivalsChart').getContext('2d');
    if (state.arrivalsChartInstance) {
        state.arrivalsChartInstance.destroy();
    }

    const dailyData = new Map();

    const processRow = (row, type) => {
        if (!row.date) return;
        const dateKey = new Date(row.date).toISOString().split('T')[0];
        
        if (!dailyData.has(dateKey)) {
            dailyData.set(dateKey, { arrivals: 0, drugTests: 0 });
        }

        const currentDayData = dailyData.get(dateKey);
        if (type === 'arrival') {
            currentDayData.arrivals++;
        } else if (type === 'drugTest') {
            currentDayData.drugTests++;
        }
    };

    arrivals.forEach(row => processRow(row, 'arrival'));
    drugTests.forEach(row => processRow(row, 'drugTest'));

    const sortedDates = Array.from(dailyData.keys()).sort();

    const axisLabels = sortedDates;
    const arrivalsDataArray = sortedDates.map(date => dailyData.get(date).arrivals);
    const drugTestsDataArray = sortedDates.map(date => dailyData.get(date).drugTests);

    state.arrivalsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: axisLabels,
            datasets: [
                {
                    label: 'Total Arrivals',
                    data: arrivalsDataArray,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Total Drug Tests',
                    data: drugTestsDataArray,
                    backgroundColor: 'rgba(16, 185, 129, 0.6)', 
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                     mode: 'index',
                    intersect: false,
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                datalabels: {
                    display: false
                }
            },
            scales: {
                x: { 
                    type: 'time',
                    time: {
                        unit: 'day',
                         tooltipFormat: 'MMM dd, yyyy'
                    },
                    ticks: { color: '#9ca3af' }, 
                    grid: { color: '#374151' },
                    stacked: true
                },
                y: { 
                    ticks: { color: '#9ca3af' }, 
                    grid: { color: '#374151' }, 
                    beginAtZero: true,
                    stacked: true
                }
            }
        }
    });
}
