// js/leadLifecycleView.js

import { state } from './state.js';
import { openModal, closeModal, populateMultiSelectFilter, getSelectedValues } from './ui.js';

let isInitialized = false;

// ========== START: NEW CHART PLUGIN ==========
// This plugin draws a vertical line on the chart that follows the mouse hover.
const verticalLinePlugin = {
    id: 'customVerticalLine',
    afterDraw: (chart) => {
      if (chart.tooltip?._active?.length) {
        const ctx = chart.ctx;
        const x = chart.tooltip._active[0].element.x;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;
  
        // Draw the line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)'; // tailwind gray-400 with opacity
        ctx.stroke();
        ctx.restore();
      }
    }
};
// ========== END: NEW CHART PLUGIN ==========


// --- INITIALIZATION ---

export function initializeLeadLifecycleView() {
    if (isInitialized) return;

    // Set initial default state for filters
    if (state.leadLifecycleData && state.leadLifecycleData.length > 0) {
        state.laLifecycleSettings.visibleStatuses = [...new Set(state.leadLifecycleData.map(d => d.status))].sort();
        const ageOrder = ["1st Week", "2nd Week", "3rd Week", "1 Month", "2 Months", "3 Months", "4 Months", "5 Months", "6 Months", "7 Months", "8 Months", "9 Months", "10 Months", "11 Months", "1 Year", "2 Years", "3+ Years"];
        state.laLifecycleSettings.visibleAges = [...new Set(state.leadLifecycleData.map(d => d.lead_age_date))].sort((a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b));
    }

    addEventListeners();
    renderFilters(); // Call this only once on initialization
    renderAllLeadLifecycle();
    isInitialized = true;
}

export function rerenderLeadLifecycleView() {
    if (isInitialized) {
        renderAllLeadLifecycle();
    }
}


function addEventListeners() {
    document.getElementById('llChartSettingsBtn')?.addEventListener('click', openChartSettingsModal);
    document.getElementById('closeLlChartSettingsBtn')?.addEventListener('click', () => closeModal('llChartSettingsModal'));
    document.getElementById('llChartApplyBtn')?.addEventListener('click', handleApplyChartSettings);
    document.getElementById('llAddNewAssignmentGroupBtn')?.addEventListener('click', () => {
        const input = document.getElementById('llNewAssignmentGroupInput');
        const value = parseInt(input.value, 10);
        if (isNaN(value) || value < 0) {
            alert("Please enter a valid non-negative number.");
            return;
        }
        state.laLifecycleSettings.assignmentGroups.plusGroup = { from: value, label: `${value}+ times` };
        input.value = '';
        renderAssignmentControls();
    });

    document.getElementById('llRemovePlusGroupBtn')?.addEventListener('click', () => {
        state.laLifecycleSettings.assignmentGroups.plusGroup = null;
        renderAssignmentControls();
    });
    
    // This now includes all the multi-select dropdowns
    const multiSelects = [
        { btnId: 'llStatusFilterBtn', dropdownId: 'llStatusFilterDropdown' },
        { btnId: 'llAgeFilterBtn', dropdownId: 'llAgeFilterDropdown' },
        { btnId: 'llCompanyFilterBtn', dropdownId: 'llCompanyFilterDropdown' },
        { btnId: 'llContractFilterBtn', dropdownId: 'llContractFilterDropdown' }
    ];
    
    // This new listener handles the simple 'Assignment Status' dropdown
    document.getElementById('llAssignmentFilter')?.addEventListener('change', () => {
        state.laLifecycleSettings.assignmentStatus = document.getElementById('llAssignmentFilter').value;
        renderAllLeadLifecycle();
    });

    multiSelects.forEach(({ btnId, dropdownId }) => {
        const btn = document.getElementById(btnId);
        const dropdown = document.getElementById(dropdownId);
        if (btn && dropdown) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                multiSelects.forEach(sel => {
                    if (sel.dropdownId !== dropdownId) {
                        document.getElementById(sel.dropdownId)?.classList.add('hidden');
                    }
                });
                dropdown.classList.toggle('hidden');
            });
            dropdown.addEventListener('change', () => {
                // This now updates the state for all four multi-select filters
                state.laLifecycleSettings.visibleStatuses = getSelectedValues(document.getElementById('llStatusFilterDropdown'));
                state.laLifecycleSettings.visibleAges = getSelectedValues(document.getElementById('llAgeFilterDropdown'));
                state.laLifecycleSettings.visibleCompanies = getSelectedValues(document.getElementById('llCompanyFilterDropdown'));
                state.laLifecycleSettings.visibleContracts = getSelectedValues(document.getElementById('llContractFilterDropdown'));
                renderAllLeadLifecycle();
            });
        }
    });

    document.addEventListener('click', (e) => {
        multiSelects.forEach(({ btnId, dropdownId }) => {
            const btn = document.getElementById(btnId);
            const dropdown = document.getElementById(dropdownId);
            if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    });
}


// --- DATA PROCESSING ---

function processLifecycleData() {
    const { 
        visibleStatuses, 
        visibleAges, 
        assignmentGroups,
        visibleCompanies,
        visibleContracts,
        assignmentStatus
    } = state.laLifecycleSettings;
    const { visibleCounts, plusGroup } = assignmentGroups || {};

    // Defensive check to ensure state properties exist
    if (!visibleStatuses || !visibleAges || !visibleCounts || !visibleCompanies || !visibleContracts) {
        return new Map();
    }

    const filteredData = state.leadLifecycleData.filter(item => {
        // Standard Filters
        const statusMatch = visibleStatuses.includes(item.status);
        const ageMatch = visibleAges.includes(item.lead_age_date);
        
        // New Filters
        const companyMatch = visibleCompanies.length === 0 || visibleCompanies.includes(item.company);
        const contractMatch = visibleContracts.length === 0 || visibleContracts.includes(item.contract_type);

        // Assignment Status Filter
        const assignmentMatch = (() => {
            const teamName = item.team_name;
            switch (assignmentStatus) {
                case 'all_assigned':
                    return teamName && teamName.trim() !== '';
                case 'team_assigned':
                    return teamName && teamName.trim() !== '' && teamName !== 'Profilers';
                case 'profiler_assigned':
                    return teamName === 'Profilers';
                case 'no_assigned':
                    return !teamName || teamName.trim() === '';
                case 'all':
                default:
                    return true;
            }
        })();

        return statusMatch && ageMatch && companyMatch && contractMatch && assignmentMatch;
    });

    const pivotedData = new Map();

    visibleAges.forEach(age => {
        const statusMap = new Map();
        visibleStatuses.forEach(status => {
            statusMap.set(status, 0);
        });
        pivotedData.set(age, statusMap);
    });

    filteredData.forEach(item => {
        const count = parseInt(item.assignment_count, 10);
        if (isNaN(count)) return;

        const isInVisibleGroup = visibleCounts.includes(count) || (plusGroup && count >= plusGroup.from);

        if (isInVisibleGroup) {
            if (pivotedData.has(item.lead_age_date)) {
                const statusMap = pivotedData.get(item.lead_age_date);
                if (statusMap.has(item.status)) {
                    statusMap.set(item.status, statusMap.get(item.status) + 1);
                }
            }
        }
    });

    return pivotedData;
}


// --- RENDERING ---

function renderAllLeadLifecycle() {
    const pivotedData = processLifecycleData();
    renderTable(pivotedData);
    renderChart();
}

function renderFilters() {
    const allStatuses = [...new Set(state.leadLifecycleData.map(d => d.status))].sort().map(s => ({ status: s }));
    populateMultiSelectFilter(
        document.getElementById('llStatusFilterBtn'),
        document.getElementById('llStatusFilterDropdown'),
        allStatuses,
        'status',
        'All Statuses'
    );
    
    const ageOrder = ["1st Week", "2nd Week", "3rd Week", "1 Month", "2 Months", "3 Months", "4 Months", "5 Months", "6 Months", "7 Months", "8 Months", "9 Months", "10 Months", "11 Months", "1 Year", "2 Years", "3+ Years"];
    const allAges = [...new Set(state.leadLifecycleData.map(d => d.lead_age_date))]
        .sort((a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b))
        .map(age => ({ lead_age_date: age }));
    populateMultiSelectFilter(
        document.getElementById('llAgeFilterBtn'),
        document.getElementById('llAgeFilterDropdown'),
        allAges,
        'lead_age_date',
        'All Ages'
    );

    // Correctly populates the Company filter using the 'company' key
    const allCompanies = [...new Set(state.leadLifecycleData.map(d => d.company).filter(Boolean))].sort().map(c => ({ company: c }));
    populateMultiSelectFilter(
        document.getElementById('llCompanyFilterBtn'),
        document.getElementById('llCompanyFilterDropdown'),
        allCompanies,
        'company',
        'All Companies'
    );

    // Correctly populates the Contract Type filter
    const allContracts = [...new Set(state.leadLifecycleData.map(d => d.contract_type).filter(Boolean))].sort().map(c => ({ contract_type: c }));
    populateMultiSelectFilter(
        document.getElementById('llContractFilterBtn'),
        document.getElementById('llContractFilterDropdown'),
        allContracts,
        'contract_type',
        'All Contracts'
    );
}


function renderTable(pivotedData) {
    const tableWrapper = document.getElementById('llTableWrapper');
    const visibleStatuses = state.laLifecycleSettings.visibleStatuses;
    const visibleAges = state.laLifecycleSettings.visibleAges;

    if (visibleAges.length === 0 || visibleStatuses.length === 0) {
        tableWrapper.innerHTML = `<div class="text-center p-8 text-gray-500">Please select at least one status and lead age to display data.</div>`;
        return;
    }

    const shortenStatus = (status) => {
        const replacements = {
            "CONTACT ATTEMPT": "ATTEMPT",
            "ARRIVAL SCHEDULED": "ARR. SCHED.",
            "AWAITING REVIEW": "REVIEW",
            "AWAITING PASSED DT": "AWAIT. DT",
            "DT PASSED": "DT PASS",
            "DT SCHEDULED": "DT SCHED.",
            "NOT INTERESTED": "NOT INT.",
            "TERMINATED/QUIT": "TERM/QUIT",
            "UNQUALIFIED": "UNQUAL."
        };
        let shortStatus = status.toUpperCase();
        for (const [key, value] of Object.entries(replacements)) {
            shortStatus = shortStatus.replace(key, value);
        }
        return shortStatus;
    };


    let tableHtml = `
        <div class="table-container">
            <table class="min-w-full text-sm text-left lead-lifecycle-table">
                <thead class="sticky top-0 z-10">
                    <tr class="bg-gray-700">
                        <th class="table-header-cell font-semibold text-gray-300">Lead Age</th>
                        ${visibleStatuses.map(status => `<th class="table-header-cell text-center font-semibold text-gray-300">${shortenStatus(status)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    const ageOrder = ["1st Week", "2nd Week", "3rd Week", "1 Month", "2 Months", "3 Months", "4 Months", "5 Months", "6 Months", "7 Months", "8 Months", "9 Months", "10 Months", "11 Months", "1 Year", "2 Years", "3+ Years"];
    const sortedVisibleAges = [...visibleAges].sort((a,b) => ageOrder.indexOf(a) - ageOrder.indexOf(b));

    sortedVisibleAges.forEach(age => {
        const statusMap = pivotedData.get(age);
        tableHtml += `<tr class="hover:bg-gray-800/50">`;
        tableHtml += `<td class="font-semibold text-sky-400">${age}</td>`;
        if (statusMap) {
            visibleStatuses.forEach(status => {
                const count = statusMap.get(status) || 0;
                tableHtml += `<td class="text-center font-mono">${count}</td>`;
            });
        } else {
             visibleStatuses.forEach(() => {
                tableHtml += `<td class="text-center font-mono">0</td>`;
            });
        }
        tableHtml += `</tr>`;
    });

    tableHtml += `
                </tbody>
            </table>
        </div>
    `;

    tableWrapper.innerHTML = tableHtml;
}

// --- CHART & MODAL LOGIC ---

function renderChart() {
    if (state.llChartInstance) {
        state.llChartInstance.destroy();
    }
    state.llChartInstance = createLifecycleChart('llLifecycleChart');
}

function openChartSettingsModal() {
    document.querySelector(`input[name="llChartType"][value="${state.laLifecycleSettings.chartType}"]`).checked = true;
    renderAssignmentControls();
    openModal('llChartSettingsModal');
}

function handleApplyChartSettings() {
    state.laLifecycleSettings.chartType = document.querySelector('input[name="llChartType"]:checked').value;
    state.laLifecycleSettings.assignmentGroups.visibleCounts = Array.from(document.querySelectorAll('.ll-assignment-cb:checked')).map(cb => parseInt(cb.value, 10));
    closeModal('llChartSettingsModal');
    renderAllLeadLifecycle();
}

function renderAssignmentControls() {
    const container = document.getElementById('llAssignmentGroupsContainer');
    const { visibleCounts, plusGroup } = state.laLifecycleSettings.assignmentGroups;

    const allCounts = [...new Set(state.leadLifecycleData.map(d => parseInt(d.assignment_count, 10)))].filter(n => !isNaN(n)).sort((a, b) => a - b);
    const countsToShow = plusGroup ? allCounts.filter(c => c < plusGroup.from) : allCounts;

    container.innerHTML = countsToShow.map(count => {
        const isChecked = visibleCounts.includes(count);
        return `
            <label class="flex items-center space-x-2 p-1 rounded-md hover:bg-gray-700/50 cursor-pointer">
                <input type="checkbox" value="${count}" class="ll-assignment-cb h-4 w-4 rounded" ${isChecked ? 'checked' : ''}>
                <span class="text-sm text-gray-300">Assigned ${count} time(s)</span>
            </label>
        `;
    }).join('');

    const plusGroupDisplay = document.getElementById('llPlusGroupDisplay');
    const addPlusGroupContainer = document.getElementById('llAddPlusGroupContainer');
    if (plusGroup) {
        document.getElementById('llPlusGroupLabel').textContent = plusGroup.label;
        plusGroupDisplay.classList.remove('hidden');
        addPlusGroupContainer.classList.add('hidden');
    } else {
        plusGroupDisplay.classList.add('hidden');
        addPlusGroupContainer.classList.remove('hidden');
    }
}

function createLifecycleChart(canvasId) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;

    const { 
        visibleStatuses, 
        visibleAges, 
        chartType, 
        assignmentGroups,
        visibleCompanies,
        visibleContracts,
        assignmentStatus 
    } = state.laLifecycleSettings;
    const { visibleCounts, plusGroup } = assignmentGroups;
    const ageOrder = ["1st Week", "2nd Week", "3rd Week", "1 Month", "2 Months", "3 Months", "4 Months", "5 Months", "6 Months", "7 Months", "8 Months", "9 Months", "10 Months", "11 Months", "1 Year", "2 Years", "3+ Years"];

    const filteredData = state.leadLifecycleData.filter(item => {
        const statusMatch = visibleStatuses.includes(item.status);
        const ageMatch = visibleAges.includes(item.lead_age_date);
        const companyMatch = visibleCompanies.length === 0 || visibleCompanies.includes(item.company);
        const contractMatch = visibleContracts.length === 0 || visibleContracts.includes(item.contract_type);
        const assignmentMatch = (() => {
            const teamName = item.team_name;
            switch (assignmentStatus) {
                case 'all_assigned':
                    return teamName && teamName.trim() !== '';
                case 'team_assigned':
                    return teamName && teamName.trim() !== '' && teamName !== 'Profilers';
                case 'profiler_assigned':
                    return teamName === 'Profilers';
                case 'no_assigned':
                    return !teamName || teamName.trim() === '';
                case 'all':
                default:
                    return true;
            }
        })();
        return statusMatch && ageMatch && companyMatch && contractMatch && assignmentMatch;
    });


    if (!filteredData.length) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = "16px Inter";
        ctx.fillStyle = "#9ca3af";
        ctx.textAlign = "center";
        ctx.fillText("No data to display for current filters.", ctx.canvas.width / 2, ctx.canvas.height / 2);
        return null;
    }

    const dataByAge = {};
    filteredData.forEach(item => {
        if (!dataByAge[item.lead_age_date]) dataByAge[item.lead_age_date] = {};
        const count = parseInt(item.assignment_count, 10);
        if(!isNaN(count)) {
            dataByAge[item.lead_age_date][count] = (dataByAge[item.lead_age_date][count] || 0) + 1;
        }
    });

    const labels = ageOrder.filter(age => visibleAges.includes(age));
    const datasets = [];
    const colors = ['#8b5cf6', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#10b981', '#6366f1'];

    const groupsToRender = [...visibleCounts, ...(plusGroup ? [plusGroup] : [])].sort((a, b) => {
        const valA = typeof a === 'number' ? a : a.from;
        const valB = typeof b === 'number' ? b : b.from;
        return valA - valB;
    });

    groupsToRender.forEach((group, index) => {
        const label = typeof group === 'number' ? `Assigned ${group} time(s)` : group.label;
        const data = labels.map(age => {
            let total = 0;
            if (!dataByAge[age]) return 0;
            if (typeof group === 'number') {
                total = dataByAge[age][group] || 0;
            } else {
                Object.keys(dataByAge[age]).forEach(countStr => {
                    if (parseInt(countStr, 10) >= group.from) total += dataByAge[age][countStr];
                });
            }
            return total;
        });
        datasets.push({ label, data, backgroundColor: colors[index % colors.length], borderColor: colors[index % colors.length], tension: 0.1 });
    });

    const isStacked = chartType === 'bar';
    
    // ========== START: MODIFIED CHART CONSTRUCTOR ==========
    return new Chart(ctx, {
        type: chartType,
        plugins: [verticalLinePlugin], // Register the plugin here
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { color: '#9ca3af', boxWidth: 12, padding: 20 }
                }, 
                tooltip: { 
                    mode: 'index', // Important for the vertical line to work correctly
                    intersect: false 
                }, 
                datalabels: { display: false } 
            },
            scales: {
                x: { stacked: isStacked, ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#374151' } },
                y: { stacked: isStacked, beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: '#374151' }, title: { display: false } }
            }
        }
    });
    // ========== END: MODIFIED CHART CONSTRUCTOR ==========
}
