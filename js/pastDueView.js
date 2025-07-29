// js/pastDueView.js

import { state } from './state.js';
import { populateMultiSelectFilter, formatNumber, getSelectedValues } from './ui.js';

let isInitialized = false;
let chartInstance = null;
let pdSortConfig = { key: 'past_due_ratio', direction: 'asc' };
let pdViewMode = 'recruiter'; // 'recruiter' or 'team'

// --- INITIALIZATION ---

export function initializePastDueView() { // The 'export' keyword here makes the function available to other files.
    if (isInitialized) return;
    console.log("Past Due view initialized.");

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 29);
    document.getElementById('pdDateToFilter').value = toDate.toISOString().split('T')[0];
    document.getElementById('pdDateFromFilter').value = fromDate.toISOString().split('T')[0];

    const companyMap = { 'eb': 'EB Infinity', 'smj': 'SMJ', 'amongus': 'AmongUs', 'all': 'ALL' };
    const uniqueCompanies = new Set();
    const uniqueContracts = new Set();

    if (state.recruiterData) {
        state.recruiterData.forEach(row => {
            Object.keys(row).forEach(key => {
                const parts = key.split('_');
                if (key.startsWith('past_due_') || key.startsWith('contacted_') || key.startsWith('not_due_yet_')) {
                    if (parts.length >= 3) {
                        const contract = parts[parts.length - 2];
                        const companySuffix = parts[parts.length - 1];

                        if (contract) {
                            uniqueContracts.add(contract.toUpperCase());
                        }
                        if (companyMap[companySuffix]) {
                            uniqueCompanies.add(companyMap[companySuffix]);
                        }
                    }
                }
            });
        });
    }

    const companyList = [...uniqueCompanies].map(c => ({ company_name: c }));
    const contractList = [...uniqueContracts].map(c => ({ contract_type: c }));

    populateMultiSelectFilter(document.getElementById('pdTeamFilterBtn'), document.getElementById('pdTeamFilterDropdown'), state.recruiterData, 'team_name', 'All Teams', true);
    populateMultiSelectFilter(document.getElementById('pdRecruiterFilterBtn'), document.getElementById('pdRecruiterFilterDropdown'), state.recruiterData, 'recruiter_name', 'All Recruiters', true);
    populateMultiSelectFilter(document.getElementById('pdCompanyFilterBtn'), document.getElementById('pdCompanyFilterDropdown'), companyList, 'company_name', 'All Companies', false, 'ALL');
    populateMultiSelectFilter(document.getElementById('pdContractFilterBtn'), document.getElementById('pdContractFilterDropdown'), contractList, 'contract_type', 'All Contracts', false, 'ALL');

    addEventListeners();
    renderAll();
    isInitialized = true;
}

function addEventListeners() {
    document.getElementById('pdDateFromFilter')?.addEventListener('change', renderAll);
    document.getElementById('pdDateToFilter')?.addEventListener('change', renderAll);

    const multiSelects = [
        { btnId: 'pdRecruiterFilterBtn', dropdownId: 'pdRecruiterFilterDropdown' },
        { btnId: 'pdTeamFilterBtn', dropdownId: 'pdTeamFilterDropdown' },
        { btnId: 'pdCompanyFilterBtn', dropdownId: 'pdCompanyFilterDropdown' },
        { btnId: 'pdContractFilterBtn', dropdownId: 'pdContractFilterDropdown' }
    ];

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
            dropdown.addEventListener('change', renderAll);
        }
    });

    document.getElementById('pdTeamFilterDropdown')?.addEventListener('change', () => {
        const selectedTeams = getSelectedValues(document.getElementById('pdTeamFilterDropdown'));
        const filteredRecruiters = selectedTeams.length > 0
            ? state.recruiterData.filter(d => d.team_name && selectedTeams.includes(d.team_name)) // FIX: Use team_name
            : state.recruiterData;
        populateMultiSelectFilter(document.getElementById('pdRecruiterFilterBtn'), document.getElementById('pdRecruiterFilterDropdown'), filteredRecruiters, 'recruiter_name', 'All Recruiters', true); // FIX: Use recruiter_name
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

    document.getElementById('pastDueTableHeader')?.addEventListener('click', handleSort);
    document.getElementById('pdViewRecruiterBtn').addEventListener('click', () => switchViewMode('recruiter'));
    document.getElementById('pdViewTeamBtn').addEventListener('click', () => switchViewMode('team'));
}


function switchViewMode(mode) {
    if (pdViewMode === mode) return;
    pdViewMode = mode;

    document.getElementById('pdViewRecruiterBtn').classList.toggle('active', mode === 'recruiter');
    document.getElementById('pdViewTeamBtn').classList.toggle('active', mode === 'team');
    
    document.getElementById('pdRecruiterFilterContainer').style.display = mode === 'team' ? 'none' : 'block';

    if (mode === 'team') {
        const recruiterDropdown = document.getElementById('pdRecruiterFilterDropdown');
        if (recruiterDropdown) {
            recruiterDropdown.querySelectorAll('input:checked').forEach(cb => { cb.checked = false; });
            recruiterDropdown.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    renderAll();
}

function handleSort(e) {
    const header = e.target.closest('.sortable');
    if (!header) return;
    const key = header.dataset.sortKey;
    if (pdSortConfig.key === key) {
        pdSortConfig.direction = pdSortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        pdSortConfig.key = key;
        pdSortConfig.direction = 'asc';
    }
    renderAll();
}

// --- DATA PROCESSING ---

function getFilteredData() {
    const fromDateStr = document.getElementById('pdDateFromFilter').value;
    const toDateStr = document.getElementById('pdDateToFilter').value;
    const teams = getSelectedValues(document.getElementById('pdTeamFilterDropdown'));
    const recruiters = getSelectedValues(document.getElementById('pdRecruiterFilterDropdown'));

    const fromDate = fromDateStr ? new Date(fromDateStr + 'T00:00:00') : null;
    const toDate = toDateStr ? new Date(toDateStr + 'T23:59:59') : null;

    return state.recruiterData.filter(row => {
        const rowDate = new Date(row.date);
        if(isNaN(rowDate.getTime())) return false;

        const dateMatch = (!fromDate || rowDate >= fromDate) && (!toDate || rowDate <= toDate);
        const teamMatch = teams.length === 0 || teams.includes(row.team_name);
        const recruiterMatch = recruiters.length === 0 || recruiters.includes(row.recruiter_name);
        
        return dateMatch && teamMatch && recruiterMatch;
    });
}

function processDataForView(filteredData) {
    const companyFilters = getSelectedValues(document.getElementById('pdCompanyFilterDropdown'));
    const contractFilters = getSelectedValues(document.getElementById('pdContractFilterDropdown'));
    const dailyData = new Map();
    const aggregatedData = new Map();
    const companyMap = { 'eb': 'EB Infinity', 'smj': 'SMJ', 'amongus': 'AmongUs', 'all': 'ALL' };

    // Helper to calculate median
    const calculateMedian = (values) => {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    filteredData.forEach(row => {
        const dateKey = new Date(row.date).toISOString().split('T')[0];
        
        let dailyTotals = { past_due: 0, contacted: 0, not_due_yet: 0 };

        const aggregationKey = pdViewMode === 'recruiter' ? row.recruiter_name : row.team_name;
        if (!aggregationKey) return;

        if (!aggregatedData.has(aggregationKey)) {
            aggregatedData.set(aggregationKey, {
                name: aggregationKey,
                team_name: pdViewMode === 'recruiter' ? row.team_name : null,
                past_due_values: [],
                contacted_values: [],
                not_due_yet_values: []
            });
        }
        
        const aggregatedEntry = aggregatedData.get(aggregationKey);

        for (const key in row) {
            let status = null;
            if (key.startsWith('past_due_')) { status = 'past_due'; }
            else if (key.startsWith('contacted_')) { status = 'contacted'; }
            else if (key.startsWith('not_due_yet_')) { status = 'not_due_yet'; }
            if (!status) continue;

            const parts = key.split('_');
            if (parts.length < 3) continue;
            
            const contract = parts[parts.length - 2].toUpperCase();
            const companySuffix = parts[parts.length - 1];
            const companyName = companyMap[companySuffix];
            if (!companyName) continue;

            const companyMatch = companyFilters.length === 0 || companyFilters.includes(companyName);
            const contractMatch = contractFilters.length === 0 || contractFilters.includes(contract);

            if (companyMatch && contractMatch) {
                dailyTotals[status] += Number(row[key]) || 0;
            }
        }
        
        aggregatedEntry.past_due_values.push(dailyTotals.past_due);
        aggregatedEntry.contacted_values.push(dailyTotals.contacted);
        aggregatedEntry.not_due_yet_values.push(dailyTotals.not_due_yet);

        // Aggregate daily totals for KPI calculation
        if (!dailyData.has(dateKey)) {
            dailyData.set(dateKey, { past_due: 0, contacted: 0, not_due_yet: 0 });
        }
        const dailyEntry = dailyData.get(dateKey);
        dailyEntry.past_due += dailyTotals.past_due;
        dailyEntry.contacted += dailyTotals.contacted;
        dailyEntry.not_due_yet += dailyTotals.not_due_yet;
    });

    // Calculate medians for each entity
    aggregatedData.forEach(entry => {
        entry.past_due = calculateMedian(entry.past_due_values);
        entry.contacted = calculateMedian(entry.contacted_values);
        entry.not_due_yet = calculateMedian(entry.not_due_yet_values);
    });

    return {
        daily: new Map([...dailyData.entries()].sort()),
        aggregated: Array.from(aggregatedData.values())
    };
}


// --- RENDERING ---

function renderAll() {
    if (!state.recruiterData || state.recruiterData.length === 0) return;
    
    const allFilteredData = getFilteredData();
    const { daily, aggregated } = processDataForView(allFilteredData);

    renderKPIs(daily, aggregated);
    renderChart(daily);
    renderTable(aggregated);
}

function renderKPIs(dailyData, aggregatedData) {
    // If only one entity is selected, use its specific median data from the table
    if (aggregatedData.length === 1) {
        const entity = aggregatedData[0];
        // --- FIX START: Calculate the ratio directly ---
        const total = entity.past_due + entity.contacted + entity.not_due_yet;
        const ratio = total > 0 ? (entity.past_due / total) * 100 : 0;
        // --- FIX END ---

        document.getElementById('kpiTotalPastDue').textContent = formatNumber(entity.past_due, 0);
        document.getElementById('kpiTotalContacted').textContent = formatNumber(entity.contacted, 0);
        document.getElementById('kpiTotalNotDueYet').textContent = formatNumber(entity.not_due_yet, 0);
        // --- FIX START: Use the newly calculated ratio ---
        document.getElementById('kpiPastDueRatio').textContent = `${formatNumber(ratio, 1)}%`;
        // --- FIX END ---
        return;
    }

    // --- This is the original logic for when multiple entities are selected ---
    if (dailyData.size === 0) {
        document.getElementById('kpiTotalPastDue').textContent = '0';
        document.getElementById('kpiTotalContacted').textContent = '0';
        document.getElementById('kpiTotalNotDueYet').textContent = '0';
        document.getElementById('kpiPastDueRatio').textContent = '0.0%';
        return;
    }

    const calculateMedian = (values) => {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const dailyPastDue = [];
    const dailyContacted = [];
    const dailyNotDueYet = [];
    let totalPastDueSum = 0;
    let totalGrandSum = 0;

    dailyData.forEach(day => {
        dailyPastDue.push(day.past_due);
        dailyContacted.push(day.contacted);
        dailyNotDueYet.push(day.not_due_yet);

        const dayTotal = day.past_due + day.contacted + day.not_due_yet;
        totalPastDueSum += day.past_due;
        totalGrandSum += dayTotal;
    });

    const medianPastDue = calculateMedian(dailyPastDue);
    const medianContacted = calculateMedian(dailyContacted);
    const medianNotDueYet = calculateMedian(dailyNotDueYet);
    const overallPastDueRatio = totalGrandSum > 0 ? (totalPastDueSum / totalGrandSum) * 100 : 0;

    document.getElementById('kpiTotalPastDue').textContent = formatNumber(medianPastDue, 0);
    document.getElementById('kpiTotalContacted').textContent = formatNumber(medianContacted, 0);
    document.getElementById('kpiTotalNotDueYet').textContent = formatNumber(medianNotDueYet, 0);
    document.getElementById('kpiPastDueRatio').textContent = `${formatNumber(overallPastDueRatio, 1)}%`;
}

function renderChart(dailyData) {
    const ctx = document.getElementById('pastDueChart').getContext('2d');
    const labels = Array.from(dailyData.keys());
    const datasets = [
        { label: 'Past Due', data: labels.map(date => dailyData.get(date).past_due), borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
        { label: 'Contacted', data: labels.map(date => dailyData.get(date).contacted), borderColor: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
        { label: 'Not Due Yet', data: labels.map(date => dailyData.get(date).not_due_yet), borderColor: '#6B7280', backgroundColor: 'rgba(107, 114, 128, 0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
        { label: 'Past Due Ratio', data: labels.map(date => { const day = dailyData.get(date); const total = day.past_due + day.contacted + day.not_due_yet; return total > 0 ? (day.past_due / total) * 100 : 0; }), borderColor: '#F59E0B', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1' }
    ];
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: {
                x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' }, ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Lead Count', color: '#9ca3af' }, ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: 'Past Due Ratio (%)', color: '#9ca3af' }, ticks: { color: '#9ca3af', callback: value => `${value}%` }, grid: { drawOnChartArea: false } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: '#d1d5db', usePointStyle: true, pointStyle: 'line' } },
                tooltip: { callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) { label += ': '; } if (context.parsed.y !== null) { if (context.dataset.label === 'Past Due Ratio') { label += formatNumber(context.parsed.y, 1) + '%'; } else { label += formatNumber(context.parsed.y, 0); } } return label; } } },
                datalabels: { display: false }
            }
        }
    });
}

function renderTable(aggregatedData) {
    const tableHeader = document.getElementById('pastDueTableHeader');
    const tableBody = document.getElementById('pastDueTableBody');
    if (!tableHeader || !tableBody) return;

    const tooltips = {
        past_due: "Indicates an active/pending lead status (NEW, 1ST, 2ND CONTACT ATTEMPT, HOT LEAD, RECYCLED) where the assigned date is over 24 hours old (or 48 hours for 3rd contact attempt).",
        contacted: "The lead's status is no longer active/pending, indicating it has been engaged or progressed beyond initial stages.",
        not_due_yet: "An active/pending lead status where the assigned date is within the 24-hour (or 48-hour for 3rd contact attempt) follow-up window."
    };

    const headers = [
        { key: 'name', label: pdViewMode === 'recruiter' ? 'Recruiter' : 'Team' },
        ...(pdViewMode === 'recruiter' ? [{ key: 'team_name', label: 'Team' }] : []), // FIX: Use team_name
        { key: 'past_due', label: 'Past Due', tooltip: tooltips.past_due },
        { key: 'contacted', label: 'Contacted', tooltip: tooltips.contacted },
        { key: 'not_due_yet', label: 'Not Due Yet', tooltip: tooltips.not_due_yet },
        { key: 'total_leads', label: 'Total Leads' },
        { key: 'past_due_ratio', label: 'Past Due Ratio' }
    ];

    tableHeader.innerHTML = `<tr class="bg-gray-700">${headers.map(h => {
        const isSorted = pdSortConfig.key === h.key;
        const sortClasses = isSorted ? `sorted-${pdSortConfig.direction}` : '';
        const alignClass = h.key === 'name' ? 'text-left' : 'text-center';
        const tooltipHtml = h.tooltip ? `<div class="help-tooltip-container ml-1"><i class="fas fa-question-circle help-tooltip-icon text-xs"></i><div class="help-tooltip-text align-left" style="width: 250px;">${h.tooltip}</div></div>` : '';
        return `<th class="p-2 sortable ${sortClasses} ${alignClass} cursor-pointer" data-sort-key="${h.key}"><div class="flex items-center ${alignClass === 'text-center' ? 'justify-center' : ''}"><span>${h.label}</span>${tooltipHtml}<span class="sort-icon sort-icon-up ml-1"><i class="fas fa-arrow-up"></i></span><span class="sort-icon sort-icon-down ml-1"><i class="fas fa-arrow-down"></i></span></div></th>`;
    }).join('')}</tr>`;

    let minRatio = 100, maxRatio = 0;
    aggregatedData.forEach(item => {
        const total = item.past_due + item.contacted + item.not_due_yet;
        item.total_leads = total;
        item.past_due_ratio = total > 0 ? (item.past_due / total) * 100 : 0;
        if (total > 0) { minRatio = Math.min(minRatio, item.past_due_ratio); maxRatio = Math.max(maxRatio, item.past_due_ratio); }
    });

    const dir = pdSortConfig.direction === 'asc' ? 1 : -1;
    aggregatedData.sort((a, b) => { const valA = a[pdSortConfig.key]; const valB = b[pdSortConfig.key]; if (typeof valA === 'string') { return valA.localeCompare(valB) * dir; } return (valA - valB) * dir; });

    const getRatioColor = (ratio) => { if (maxRatio === minRatio || ratio === 0) return 'text-green-400'; const p = (ratio - minRatio) / (maxRatio - minRatio); if (p < 0.25) return 'text-green-400'; if (p < 0.75) return 'text-yellow-400'; return 'text-red-400'; };

    if (aggregatedData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${headers.length}" class="text-center p-8 text-gray-500">No data for the selected 'To' date.</td></tr>`;
        return;
    }

    tableBody.innerHTML = aggregatedData.map(item => {
        const teamCell = pdViewMode === 'recruiter' ? `<td class="p-2 text-gray-400">${item.team_name}</td>` : ''; // FIX: Use team_name
        return `<tr class="hover:bg-gray-800/50">
            <td class="p-2 text-sky-400">${item.name}</td>
            ${teamCell}
            <td class="p-2 text-center font-mono text-red-400">${formatNumber(item.past_due, 0)}</td>
            <td class="p-2 text-center font-mono">${formatNumber(item.contacted, 0)}</td>
            <td class="p-2 text-center font-mono">${formatNumber(item.not_due_yet, 0)}</td>
            <td class="p-2 text-center font-mono">${formatNumber(item.total_leads, 0)}</td>
            <td class="p-2 text-center font-mono font-bold ${getRatioColor(item.past_due_ratio)}">${formatNumber(item.past_due_ratio, 1)}%</td>
        </tr>`;
    }).join('');
}
