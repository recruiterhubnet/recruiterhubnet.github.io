// js/leadRiskView.js

import { state } from './state.js';
import { columnsConfig } from './config.js';
import { formatNumber } from './ui.js';

// --- RENDERING ---
export function renderTableHeaders() {
    const header = document.getElementById('tableHeader');
    header.innerHTML = Object.entries(columnsConfig)
        .filter(([key, conf]) => !(state.viewMode === 'aggregated' && key === 'date') && conf.visible)
        .map(([key, conf]) => {
            const isSortable = conf.sortable !== false;
            return `<th scope="col" class="table-header-cell p-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider ${isSortable ? 'cursor-pointer sortable' : ''}" data-sort-key="${key}">
                <div class="flex items-center">
                    <span>${conf.label}</span>
                    ${isSortable ? `<span class="sort-icon sort-icon-up"><i class="fas fa-arrow-up"></i></span><span class="sort-icon sort-icon-down"><i class="fas fa-arrow-down"></i></span>` : ''}
                </div>
            </th>`;
        }).join('');
}

export function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const visibleColumns = Object.entries(columnsConfig).filter(([key, conf]) => conf.visible && !(state.viewMode === 'aggregated' && key === 'date'));
    
    if (state.filteredData.length === 0) {
         tableBody.innerHTML = `<tr><td colspan="${visibleColumns.length}" class="text-center p-8 text-gray-500">No matching records found.</td></tr>`;
         updateRowCount(0);
         document.getElementById('tableFooter').innerHTML = '';
         return;
    }
    
    const fragment = document.createDocumentFragment();
    state.filteredData.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = 'table-body-row hover:bg-gray-800/50 transition-colors';
        tr.dataset.recruiter = row.recruiter_name;
        
        tr.innerHTML = visibleColumns.map(([key, conf]) => {
            let content = row[key];
            let classes = 'p-2 whitespace-nowrap';
            if (key === 'detector') content = renderDetectorCell(row.detector);
            else if (key === 'date') content = content instanceof Date ? content.toLocaleDateString() : content;
            else if (conf.type === 'number') {
                classes += ' text-center font-mono';
                const decimals = ['duration_per_reveal', 'calls_per_reveal', 'sms_per_reveal'].includes(key) ? 2 : 0;
                content = formatNumber(content, decimals);
            }
            if (conf.calculated || key === 'recruiter_name') classes += ' text-sky-400';
            if (key === 'unique_phone_reveals') classes += ' text-yellow-400';
            return `<td class="${classes}">${content != null ? content : 'N/A'}</td>`;
        }).join('');
        fragment.appendChild(tr);
    });
    tableBody.innerHTML = '';
    tableBody.appendChild(fragment);
    updateRowCount(state.filteredData.length);
    renderTableFooter();
}

function renderTableFooter() {
    const footer = document.getElementById('tableFooter');
    footer.innerHTML = '';
    const visibleColumns = Object.entries(columnsConfig).filter(([key, conf]) => conf.visible && !(state.viewMode === 'aggregated' && key === 'date'));
    
    const footerCells = visibleColumns.map(([key, config], index) => {
        let cellContent = '';
        if (index === 0) {
            cellContent = `
                <select id="summaryStatSelect" class="control-deck-select text-xs w-full">
                     <option value="sum" ${state.summaryStat === 'sum' ? 'selected' : ''}>Sum</option>
                     <option value="average" ${state.summaryStat === 'average' ? 'selected' : ''}>Average</option>
                     <option value="median" ${state.summaryStat === 'median' ? 'selected' : ''}>Median</option>
                     <option value="min" ${state.summaryStat === 'min' ? 'selected' : ''}>Min</option>
                     <option value="max" ${state.summaryStat === 'max' ? 'selected' : ''}>Max</option>
                </select>
            `;
        } else if (config.type === 'number') {
            const values = state.filteredData.map(row => Number(row[key])).filter(v => !isNaN(v));
            if(values.length > 0) {
                 const stats = calculateColumnStats(values);
                 const decimals = ['duration_per_reveal', 'calls_per_reveal', 'sms_per_reveal'].includes(key) ? 2 : 0;
                 cellContent = formatNumber(stats[state.summaryStat] || 0, decimals);
            }
        }
        const cellClasses = index === 0 ? 'p-2' : 'p-2 whitespace-nowrap text-center font-mono text-gray-500';
        return `<td class="table-footer-cell ${cellClasses}">${cellContent}</td>`;
    }).join('');
    
    footer.innerHTML = `<tr>${footerCells}</tr>`;
    document.getElementById('summaryStatSelect').addEventListener('change', (e) => {
        state.summaryStat = e.target.value;
        renderTableFooter();
    });
}

function renderDetectorCell(detector) {
    if (!detector) return '';
    const colors = { red: 'bg-red-500/10 text-red-400 ring-red-500/30', green: 'bg-green-500/10 text-green-400 ring-green-500/30', yellow: 'bg-yellow-500/10 text-yellow-400 ring-yellow-500/30', blue: 'bg-blue-500/10 text-blue-400 ring-blue-500/30', gray: 'bg-gray-500/10 text-gray-400 ring-gray-500/30' };
    return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[detector.color] || colors.gray} ring-1 ring-inset">${detector.name}</span>`;
}

function updateRowCount(count) { document.getElementById('rowCount').textContent = `${count} records`; }

// --- CORE LOGIC ---
function precomputeStatistics() {
    state.statsCache = {}; // Invalidate cache
}

export function applyAllFiltersAndRender() {
    precomputeStatistics();

    let data = [...state.allData];
    const contract = document.getElementById('contractFilter').value;
    const team = document.getElementById('teamFilter').value;
    const company = document.getElementById('companyFilter').value;
    const recruiter = document.getElementById('recruiterFilter').value;
    const dateFrom = document.getElementById('dateFromFilter').value;
    const dateTo = document.getElementById('dateToFilter').value;
    
    let processedData = data.filter(row => {
        if (row.level !== 'RECRUITER') return false; // <<< THIS IS THE NEW LINE
        const contractMatch = !contract || row.contract_type === contract;
        const teamMatch = !team || row.team_name === team;
        const companyMatch = !company || row.company_name === company;
        const recruiterMatch = !recruiter || row.recruiter_name === recruiter;
        const dateFromMatch = !dateFrom || row.date.getTime() >= new Date(dateFrom).getTime();
        const dateToMatch = !dateTo || row.date.getTime() <= new Date(dateTo).getTime() + (24 * 60 * 60 * 1000 -1);
        const hasActivity = (row.total_phone_reveals + row.unique_phone_reveals + row.outbound_calls + row.unique_calls + row.call_duration_seconds + row.outbound_sms + row.unique_sms) > 0;
        return contractMatch && teamMatch && companyMatch && recruiterMatch && dateFromMatch && dateToMatch && hasActivity;
    });

    if (state.viewMode === 'aggregated') {
        state.filteredData = aggregateDataByRecruiter(processedData);
    } else {
        state.filteredData = processedData;
    }

    state.filteredData.forEach(row => {
        row.duration_per_reveal = row.unique_phone_reveals > 0 ? (row.call_duration_seconds / row.unique_phone_reveals) : 0;
        row.calls_per_reveal = row.unique_phone_reveals > 0 ? (row.unique_calls / row.unique_phone_reveals) : 0;
        row.sms_per_reveal = row.unique_phone_reveals > 0 ? (row.unique_sms / row.unique_phone_reveals) : 0;
    });
    
    state.filteredData.forEach(row => row.detector = getDetectorStatus(row, state.filteredData));
    
    if (state.detectorSortApplied && state.detectorRules.length > 0) {
         state.sortConfig = { key: 'detector', direction: 'asc' };
         state.detectorSortApplied = false;
    }

    sortData();
    renderTableHeaders();
    renderTable();
}

function aggregateDataByRecruiter(data) {
    const recruiterMap = new Map();
    const contractFilterValue = document.getElementById('contractFilter').value;

    data.forEach(row => {
        const key = row.recruiter_name;
        if (!key) return;
        if (!recruiterMap.has(key)) {
            recruiterMap.set(key, {
                recruiter_name: row.recruiter_name, team_name: row.team_name, company_name: row.company_name,
                contract_type: contractFilterValue ? contractFilterValue : 'Multiple', date: null,
                total_phone_reveals: 0, unique_phone_reveals: 0, outbound_calls: 0,
                unique_calls: 0, call_duration_seconds: 0, 
                outbound_sms: 0, unique_sms: 0,
            });
        }
        const recruiterData = recruiterMap.get(key);
        recruiterData.total_phone_reveals += row.total_phone_reveals;
        recruiterData.unique_phone_reveals += row.unique_phone_reveals;
        recruiterData.outbound_calls += row.outbound_calls;
        recruiterData.unique_calls += row.unique_calls;
        recruiterData.call_duration_seconds += row.call_duration_seconds;
        recruiterData.outbound_sms += row.outbound_sms;
        recruiterData.unique_sms += row.unique_sms;
    });
     return Array.from(recruiterMap.values());
}

export function aggregateDataForRules(data) {
    // This function is similar to the one above but used specifically for rule calculations
    const recruiterMap = new Map();
    data.forEach(row => {
        const key = row.recruiter_name;
        if (!key) return;
        if (!recruiterMap.has(key)) {
             recruiterMap.set(key, { ...row, total_phone_reveals: 0, unique_phone_reveals: 0, outbound_calls: 0, unique_calls: 0, call_duration_seconds: 0, outbound_sms: 0, unique_sms: 0 });
        }
        const recruiterData = recruiterMap.get(key);
        recruiterData.total_phone_reveals += row.total_phone_reveals;
        recruiterData.unique_phone_reveals += row.unique_phone_reveals;
        recruiterData.outbound_calls += row.outbound_calls;
        recruiterData.unique_calls += row.unique_calls;
        recruiterData.call_duration_seconds += row.call_duration_seconds;
        recruiterData.outbound_sms += row.outbound_sms;
        recruiterData.unique_sms += row.unique_sms;
    });
    const aggregated = Array.from(recruiterMap.values());
    aggregated.forEach(row => {
        row.duration_per_reveal = row.unique_phone_reveals > 0 ? (row.call_duration_seconds / row.unique_phone_reveals) : 0;
        row.calls_per_reveal = row.unique_phone_reveals > 0 ? (row.unique_calls / row.unique_phone_reveals) : 0;
        row.sms_per_reveal = row.unique_phone_reveals > 0 ? (row.unique_sms / row.unique_phone_reveals) : 0;
    });
    return aggregated;
}

export function sortData(key) {
    if (key) {
        if(columnsConfig[key]?.sortable === false) return;
        if (state.sortConfig.key === key) {
            state.sortConfig.direction = state.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortConfig.key = key;
            state.sortConfig.direction = 'asc';
        }
    }
    if (state.sortConfig.key) {
        const { type } = columnsConfig[state.sortConfig.key] || {};
        const dir = state.sortConfig.direction === 'asc' ? 1 : -1;
        state.filteredData.sort((a, b) => {
            const valA = a[state.sortConfig.key];
            const valB = b[state.sortConfig.key];
            if (valA == null && valB == null) return 0;
            if (valA == null) return 1 * dir;
            if (valB == null) return -1 * dir;
            if (state.sortConfig.key === 'detector') return (valA?.name || '').localeCompare(valB?.name || '') * dir;
            if (key === 'date' && valA instanceof Date && valB instanceof Date) return (valA.getTime() - valB.getTime()) * dir;
            if (type === 'string') return String(valA).localeCompare(String(valB)) * dir;
            if (type === 'number') return (Number(valA) - Number(valB)) * dir;
            return 0;
        });
    }
    
    document.querySelectorAll('.sortable').forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
    const activeHeader = document.querySelector(`.sortable[data-sort-key="${state.sortConfig.key}"]`);
    if (activeHeader) activeHeader.classList.add(`sorted-${state.sortConfig.direction}`);
    
    if (key) {
        renderTable();
    }
}

// --- DETECTION RULE ENGINE ---
function getContextData(row, currentViewData, cond) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const getWeek = (d) => { let day = d.getDay(); let diff = d.getDate() - day + (day == 0 ? -6:1); const start = new Date(new Date(d).setDate(diff)); return [start, new Date(new Date(start).setDate(start.getDate() + 6))]; };
    const getMonth = (d) => [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)];
    const getQuarter = (d) => { const q = Math.floor(d.getMonth() / 3); return [new Date(d.getFullYear(), q * 3, 1), new Date(d.getFullYear(), q * 3 + 3, 0)]; };

    let baseData;
    switch(cond.dateContext) {
        case 'current': return currentViewData;
        case 'all': baseData = state.allData; break;
        case 'dateSelected': {
            const dateFrom = document.getElementById('dateFromFilter').value;
            const dateTo = document.getElementById('dateToFilter').value;
            baseData = state.allData.filter(r => {
                 const dateFromMatch = !dateFrom || r.date.getTime() >= new Date(dateFrom).getTime();
                 const dateToMatch = !dateTo || r.date.getTime() <= new Date(dateTo).getTime() + (24 * 60 * 60 * 1000 - 1);
                 return dateFromMatch && dateToMatch;
            });
            break;
        }
        case 'yesterday': {
            const refDate = row ? row.date : new Date();
            if (!refDate) return [];
            const yesterday = new Date(refDate);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayString = yesterday.toISOString().split('T')[0];
            baseData = state.allData.filter(x => x.date.toISOString().split('T')[0] === yesterdayString);
            break;
        }
        case '7days': { const d = new Date(row.date); d.setDate(d.getDate() - 7); baseData = state.allData.filter(x => x.date >= d && x.date < row.date); break; }
        case '30days': { const d = new Date(row.date); d.setDate(d.getDate() - 30); baseData = state.allData.filter(x => x.date >= d && x.date < row.date); break; }
        case 'thisWeek': { const [start, end] = getWeek(today); baseData = state.allData.filter(x => x.date >= start && x.date <= end); break; }
        case 'lastWeek': { const lastW = new Date(today); lastW.setDate(lastW.getDate() - 7); const [start, end] = getWeek(lastW); baseData = state.allData.filter(x => x.date >= start && x.date <= end); break; }
        case 'thisMonth': { const [start, end] = getMonth(today); baseData = state.allData.filter(x => x.date >= start && x.date <= end); break; }
        case 'lastMonth': { const lastM = new Date(today.getFullYear(), today.getMonth() -1, 1); const [start, end] = getMonth(lastM); baseData = state.allData.filter(x => x.date >= start && x.date <= end); break; }
        case 'thisQuarter': { const [start, end] = getQuarter(today); baseData = state.allData.filter(x => x.date >= start && x.date <= end); break; }
        case 'ytd': { const start = new Date(today.getFullYear(), 0, 1); baseData = state.allData.filter(x => x.date >= start && x.date <= today); break; }
        default: baseData = state.allData; break;
    }

    const timeFilteredData = baseData.filter(r => (r.total_phone_reveals + r.unique_phone_reveals + r.outbound_calls + r.unique_calls + r.call_duration_seconds + r.outbound_sms + r.unique_sms) > 0);

    switch(cond.peerGroup) {
        case 'current_view_filters': {
            const { contract, team, company, recruiter } = {
                contract: document.getElementById('contractFilter').value,
                team: document.getElementById('teamFilter').value,
                company: document.getElementById('companyFilter').value,
                recruiter: document.getElementById('recruiterFilter').value
            };
            let peerFilteredData = timeFilteredData.filter(r => (!contract || r.contract_type === contract) && (!team || r.team_name === team) && (!company || r.company_name === company) && (!recruiter || r.recruiter_name === recruiter));
            return state.viewMode === 'aggregated' ? aggregateDataForRules(peerFilteredData) : peerFilteredData;
        }
        case 'specific_filters': {
            let peerFilteredData = timeFilteredData.filter(r => (!cond.specificTeam || r.team_name === cond.specificTeam) && (!cond.specificRecruiter || r.recruiter_name === cond.specificRecruiter) && (!cond.specificCompany || r.company_name === cond.specificCompany) && (!cond.specificContract || r.contract_type === cond.specificContract));
            return cond.specificDataType === 'aggregated' ? aggregateDataForRules(peerFilteredData) : peerFilteredData;
        }
        default:
            return timeFilteredData;
    }
}

function calculateColumnStats(values) {
    if (values.length === 0) return { sum: 0, average: 0, median: 0, min: 0, max: 0 };
    const sum = values.reduce((acc, v) => acc + v, 0);
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return { sum, average: sum / values.length, median, min: sorted[0], max: sorted[sorted.length - 1] };
}

function evaluateCondition(row, cond, currentViewData) {
    const rowValue = Number(row[cond.field]);
    if (isNaN(rowValue)) return false;
    
    let compareValue;
    if (cond.valueType === 'fixed') {
        compareValue = Number(cond.value);
    } else {
        const contextData = getContextData(row, currentViewData, cond);
        if (contextData.length === 0) return false;
        const values = contextData.map(d => Number(d[cond.field])).filter(v => !isNaN(v));
        if (values.length === 0) return false;
        
        const stats = calculateColumnStats(values);
        if (cond.valueType === 'percentile') {
             values.sort((a,b) => a-b);
             const index = Math.ceil((Number(cond.percentile) / 100) * values.length) - 1;
             compareValue = values[Math.max(0, index)];
        } else {
             compareValue = stats[cond.valueType];
        }
    }

    if (compareValue === undefined) return false;
    switch (cond.operator) {
        case '>': return rowValue > compareValue; case '<': return rowValue < compareValue;
        case '=': return rowValue === compareValue; case '>=': return rowValue >= compareValue;
        case '<=': return rowValue <= compareValue; case '!=': return rowValue !== compareValue;
        default: return false;
    }
}

function getDetectorStatus(row, currentViewData) {
    for (const rule of state.detectorRules) {
        if (!rule.conditions || rule.conditions.length === 0) continue;
        
        let result = evaluateCondition(row, rule.conditions[0], currentViewData);
        for (let i = 0; i < rule.conditions.length - 1; i++) {
            const nextResult = evaluateCondition(row, rule.conditions[i+1], currentViewData);
            const operator = rule.conditions[i].nextOperator;
            if (operator === 'AND') result = result && nextResult;
            else if (operator === 'OR') result = result || nextResult;
        }
        if (result) return { name: rule.name, color: rule.color };
    }
    return null;
}
