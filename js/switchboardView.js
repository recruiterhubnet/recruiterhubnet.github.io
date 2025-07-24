// RECRU. TEST/js/switchboardView.js

import { state } from './state.js';
import { populateFilters, formatNumber, formatDuration } from './ui.js';

let isSwitchboardInitialized = false;
let sbSortConfig = { key: 'totalSwitches', direction: 'desc' };
let activeTooltip = null;

// --- HELPER FUNCTIONS (No changes here) ---
function formatPhoneNumber(phoneStr) {
    if (!phoneStr || typeof phoneStr !== 'string') return 'N/A';
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{1})(\d{3})(\d{3})(\d{4})$/);
    if (match) {
        return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`;
    }
    return phoneStr;
}

function copySwitchboardData(recruiter, team, totalCalls, totalSwitches, switchRate, avgCallsPerSwitch) {
    const textToCopy = `Recruiter Team: ${team}\nTotal Calls: ${totalCalls}\nNumber of Switches: ${totalSwitches}\nSwitch Rate: ${switchRate.toFixed(1)}%\nAvg calls/switch: ${avgCallsPerSwitch.toFixed(1)}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
        alert('Copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}
window.copySwitchboardData = copySwitchboardData;

function copyFullSwitchboardTable() {
    const tableBody = document.getElementById('sbTableBody');
    if (!tableBody) return;
    const headers = ['Recruiter', 'Team', 'Total Calls', 'Switches', 'Switch Rate', 'Avg Calls/Switch', 'Stickiness', 'Most Used Phone'];
    let tableText = headers.join('\t') + '\n';
    tableBody.querySelectorAll('tr').forEach(row => {
        const rowData = [];
        row.querySelectorAll('td').forEach((cell, index) => {
            if (index < headers.length) {
                rowData.push(cell.innerText);
            }
        });
        tableText += rowData.join('\t') + '\n';
    });
    navigator.clipboard.writeText(tableText).then(() => {
        alert('Full table data copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy table data: ', err);
    });
}
window.copyFullSwitchboardTable = copyFullSwitchboardTable;

// --- INITIALIZATION & EVENT LISTENERS (No changes here) ---
export function initializeSwitchboardView() {
    if (isSwitchboardInitialized) return;
    console.log("Switchboard view initialized.");
    if (state.workingHoursData.length > 0) {
        const sortedData = [...state.workingHoursData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latestDate = new Date(sortedData[0].timestamp);
        const toDate = latestDate;
        const fromDate = new Date(latestDate);
        fromDate.setDate(toDate.getDate() - 6);
        document.getElementById('sbDateToFilter').value = toDate.toISOString().split('T')[0];
        document.getElementById('sbDateFromFilter').value = fromDate.toISOString().split('T')[0];
    }
    addEventListeners();
    populateSwitchboardFilters();
    renderAllSwitchboard();
    isSwitchboardInitialized = true;
}

function addEventListeners() {
    const filters = ['sbRecruiterFilter', 'sbTeamFilter', 'sbCompanyFilter', 'sbDateFromFilter', 'sbDateToFilter'];
    filters.forEach(id => document.getElementById(id)?.addEventListener('change', renderAllSwitchboard));
    document.getElementById('sbTeamFilter')?.addEventListener('change', populateSwitchboardFilters);
    document.getElementById('sbCompanyFilter')?.addEventListener('change', populateSwitchboardFilters);
    const switchboardView = document.getElementById('switchboardView');
    switchboardView.addEventListener('click', (e) => {
        const sortableHeader = e.target.closest('.sortable');
        if (sortableHeader) {
            handleSort(sortableHeader);
        }
    });
    switchboardView.addEventListener('mouseover', (e) => {
        const icon = e.target.closest('.help-tooltip-icon');
        if (!icon) return;
        if (activeTooltip) activeTooltip.remove();
        const tooltipContainer = icon.closest('.help-tooltip-container');
        const tooltipTextEl = tooltipContainer.querySelector('.help-tooltip-text');
        if (!tooltipTextEl || !tooltipTextEl.innerHTML) return;
        activeTooltip = document.createElement('div');
        activeTooltip.className = 'help-tooltip-text';
        activeTooltip.style.cssText = `visibility: visible; opacity: 1; position: fixed; z-index: 100;`;
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
    switchboardView.addEventListener('mouseout', (e) => {
        const icon = e.target.closest('.help-tooltip-icon');
        if (icon && activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    });
}

function handleSort(header) {
    if (!header) return;
    const key = header.dataset.sortKey;
    if (sbSortConfig.key === key) {
        sbSortConfig.direction = sbSortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sbSortConfig.key = key;
        sbSortConfig.direction = 'desc';
    }
    renderAllSwitchboard();
}

function populateSwitchboardFilters() {
    const selectedTeam = document.getElementById('sbTeamFilter').value;
    const selectedCompany = document.getElementById('sbCompanyFilter').value;
    const filterFunc = (d) => {
        const teamMatch = !selectedTeam || d.team_name === selectedTeam;
        const companyMatch = !selectedCompany || d.company_name === selectedCompany;
        return teamMatch && companyMatch;
    };
    populateFilters(document.getElementById('sbTeamFilter'), state.workingHoursData, 'team_name', 'All Teams');
    populateFilters(document.getElementById('sbCompanyFilter'), state.workingHoursData, 'company_name', 'All Companies');
    populateFilters(document.getElementById('sbRecruiterFilter'), state.workingHoursData, 'recruiter_name', 'All Recruiters', filterFunc);
    document.getElementById('sbTeamFilter').value = selectedTeam;
    document.getElementById('sbCompanyFilter').value = selectedCompany;
}

// --- DATA PROCESSING & RENDERING (No changes to processSwitchboardData, renderAllSwitchboard, renderKPIs, renderTable) ---
function processSwitchboardData() {
    const fromDate = document.getElementById('sbDateFromFilter').value;
    const toDate = document.getElementById('sbDateToFilter').value;
    const team = document.getElementById('sbTeamFilter').value;
    const company = document.getElementById('sbCompanyFilter').value;
    const recruiter = document.getElementById('sbRecruiterFilter').value;

    const filteredCalls = state.workingHoursData.filter(d => {
        const eventDate = d.timestamp ? d.timestamp.substring(0, 10) : null;
        return d.event_type === 'call' &&
               d.call_type === 'outbound' &&
               eventDate &&
               (!fromDate || eventDate >= fromDate) &&
               (!toDate || eventDate <= toDate) &&
               (!team || d.team_name === team) &&
               (!company || d.company_name === company) &&
               (!recruiter || d.recruiter_name === recruiter);
    });

    const callsByRecruiter = {};
    filteredCalls.forEach(call => {
        if (!callsByRecruiter[call.recruiter_name]) {
            callsByRecruiter[call.recruiter_name] = [];
        }
        callsByRecruiter[call.recruiter_name].push(call);
    });

    let stats = [];
    for (const recruiterName in callsByRecruiter) {
        const calls = callsByRecruiter[recruiterName];
        calls.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        let switches = 0;
        let lastPhone = null;
        const phoneCounts = {};
        const uniquePhones = new Set();
        calls.forEach(call => {
            if (lastPhone && call.agent_phone !== lastPhone) {
                switches++;
            }
            lastPhone = call.agent_phone;
            phoneCounts[call.agent_phone] = (phoneCounts[call.agent_phone] || 0) + 1;
            uniquePhones.add(call.agent_phone);
        });
        const topPhone = Object.keys(phoneCounts).length > 0
            ? Object.entries(phoneCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0]
            : 'N/A';
        const stickiness = calls.length > 0 && phoneCounts[topPhone] ? (phoneCounts[topPhone] / calls.length) * 100 : 0;
        stats.push({
            recruiter: recruiterName,
            team: calls[0]?.team_name || 'N/A',
            totalCalls: calls.length,
            totalSwitches: switches,
            phoneDiversity: uniquePhones.size,
            switchRate: calls.length > 1 ? (switches / (calls.length - 1)) * 100 : 0,
            avgCallsPerSwitch: switches > 0 ? calls.length / switches : calls.length,
            stickiness: stickiness,
            topPhone: topPhone
        });
    }

    const { key, direction } = sbSortConfig;
    const dir = direction === 'asc' ? 1 : -1;
    stats.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
        return (valA - valB) * dir;
    });
    return stats;
}

export function renderAllSwitchboard() {
    const data = processSwitchboardData();
    renderKPIs(data);
    renderTable(data);
    renderChart(data);
}

function renderKPIs(data) {
    const totalSwitches = data.reduce((sum, item) => sum + item.totalSwitches, 0);
    const topSwitcherData = [...data].sort((a, b) => b.totalSwitches - a.totalSwitches);
    const topSwitcher = topSwitcherData.length > 0 ? topSwitcherData[0] : { recruiter: '-', totalSwitches: 0 };
    const totalCalls = data.reduce((sum, item) => sum + item.totalCalls, 0);
    const avgCallsPerSwitch = totalSwitches > 0 ? totalCalls / totalSwitches : 0;
    document.getElementById('kpiTotalSwitches').textContent = formatNumber(totalSwitches, 0);
    document.getElementById('kpiTopSwitcher').textContent = `${topSwitcher.recruiter} (${formatNumber(topSwitcher.totalSwitches, 0)})`;
    document.getElementById('kpiAvgCallsPerSwitch').textContent = formatNumber(avgCallsPerSwitch, 1);
}

function renderTable(data) {
    const headers = [
        { key: 'recruiter', label: 'Recruiter', type: 'string' },
        { key: 'team', label: 'Team', type: 'string' },
        { key: 'totalCalls', label: 'Total Calls', type: 'number' },
        { key: 'totalSwitches', label: 'Switches', type: 'number' },
        { key: 'switchRate', label: 'Switch Rate', type: 'number', tooltip: "The percentage of calls made immediately after changing phone numbers. (Switches / (Total Calls - 1))" },
        { key: 'avgCallsPerSwitch', label: 'Avg Calls/Switch', type: 'number' },
        { key: 'stickiness', label: 'Stickiness', type: 'number', tooltip: "The percentage of total calls made from the recruiter's single most-used phone number." },
        { key: 'topPhone', label: 'Most Used Phone', type: 'string' },
        { key: 'copy', label: 'Copy', type: 'icon' }
    ];
    document.getElementById('sbTableHeader').innerHTML = headers.map(h => {
        const isSorted = sbSortConfig.key === h.key;
        const sortClasses = isSorted ? `sorted-${sbSortConfig.direction}` : '';
        const alignClass = h.type === 'number' || h.type === 'icon' ? 'text-center' : 'text-left';
        const tooltipHtml = h.tooltip ? `<div class="help-tooltip-container ml-1"><i class="fas fa-question-circle help-tooltip-icon text-xs"></i><div class="help-tooltip-text" style="display: none;">${h.tooltip}</div></div>` : '';
        if (h.type === 'icon') {
            return `<th class="table-header-cell p-2 ${alignClass} copy-header-cell" onclick="copyFullSwitchboardTable()"><i class="fas fa-copy"></i> ${h.label}</th>`;
        }
        return `<th class="table-header-cell p-2 ${alignClass} sortable ${sortClasses} cursor-pointer" data-sort-key="${h.key}">
            <div class="flex items-center ${alignClass === 'text-center' ? 'justify-center' : ''}">
                <span>${h.label}</span>
                ${tooltipHtml}
                <span class="sort-icon sort-icon-up ml-2"><i class="fas fa-arrow-up"></i></span>
                <span class="sort-icon sort-icon-down ml-2"><i class="fas fa-arrow-down"></i></span>
            </div>
        </th>`;
    }).join('');
    const tableBody = document.getElementById('sbTableBody');
    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${headers.length}" class="text-center p-8">No outbound call data available.</td></tr>`;
        return;
    }
    tableBody.innerHTML = data.map(row => `
        <tr class="hover:bg-gray-800/50">
            <td class="p-2 text-sky-400 font-semibold">${row.recruiter}</td>
            <td class="p-2 text-gray-400">${row.team}</td>
            <td class="p-2 text-center font-mono">${formatNumber(row.totalCalls, 0)}</td>
            <td class="p-2 text-center font-mono">${formatNumber(row.totalSwitches, 0)}</td>
            <td class="p-2 text-center font-mono">${formatNumber(row.switchRate, 1)}%</td>
            <td class="p-2 text-center font-mono">${formatNumber(row.avgCallsPerSwitch, 1)}</td>
            <td class="p-2 text-center font-mono">${formatNumber(row.stickiness, 1)}%</td>
            <td class="p-2 text-center font-mono">${formatPhoneNumber(row.topPhone)}</td>
            <td class="p-2 text-center">
                <button class="icon-btn" onclick="copySwitchboardData('${row.recruiter}', '${row.team}', ${row.totalCalls}, ${row.totalSwitches}, ${row.switchRate}, ${row.avgCallsPerSwitch})">
                    <i class="fas fa-copy"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// --- MODIFIED & NEW CHARTING FUNCTIONS ---

// --- MODIFIED: Renders the phone usage bar chart with data labels ---
function renderRecruiterPhoneUsageChart(calls) {
    const chartContainer = document.getElementById('sbPhoneUsageChartContainer');
    if (!chartContainer) return;

    if (calls.length === 0) {
        chartContainer.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-500 text-sm">No data for chart.</p></div>`;
        return;
    }
    chartContainer.innerHTML = '<canvas id="recruiterPhoneUsageChart"></canvas>';
    const ctx = document.getElementById('recruiterPhoneUsageChart').getContext('2d');
    
    const phoneCounts = {};
    calls.forEach(call => {
        phoneCounts[call.agent_phone] = (phoneCounts[call.agent_phone] || 0) + 1;
    });

    const sortedPhones = Object.entries(phoneCounts).sort((a, b) => b[1] - a[1]);

    const labels = sortedPhones.map(entry => formatPhoneNumber(entry[0]));
    const data = sortedPhones.map(entry => (entry[1] / calls.length) * 100);
    // --- ADDITION: Store raw counts for the tooltip ---
    const rawCounts = sortedPhones.map(entry => entry[1]);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '% Usage',
                data: data,
                // --- ADDITION: Custom property to hold raw counts ---
                customData: rawCounts,
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false, text: 'Phone # Usage %', color: '#d1d5db' },
                // --- MODIFICATION: Added tooltip configuration ---
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            // Access the raw count from the customData property
                            const count = context.dataset.customData[context.dataIndex];
                            return `Calls: ${count}`;
                        }
                    }
                },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    formatter: (value) => `${value.toFixed(1)}%`,
                    color: '#d1d5db',
                    font: {
                        weight: 'bold',
                        size: 10
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true, max: 100,
                    ticks: { color: '#9ca3af', callback: (value) => `${value}%` },
                    grid: { color: '#374151' }
                },
                x: {
                    ticks: { color: '#9ca3af', font: { size: 10 } },
                    grid: { color: '#374151' }
                }
            }
        }
    });
}


// --- MODIFIED: Renders the single-day timeline with a more detailed tooltip ---
function renderTimelineChart(calls, recruiterName, toDate) {
    const timelineTitleEl = document.getElementById('sbTimelineChartTitle');
    const timelineContainer = document.getElementById('sbTimelineChartContainer');
    if (!timelineTitleEl || !timelineContainer) return;

    const tooltipText = `<div class="help-tooltip-text" style="display: none; width: 280px; text-align: left;">Each dot represents an outbound call on this day. The vertical position flips each time a different phone number is used.</div>`;
    timelineTitleEl.innerHTML = `<div class="flex items-center"><span>Phone Switch Timeline for ${recruiterName} on ${toDate}</span><div class="help-tooltip-container ml-2"><i class="fas fa-question-circle help-tooltip-icon text-sm"></i>${tooltipText}</div></div>`;

    if (calls.length === 0) {
        timelineContainer.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-500">No outbound calls on this day.</p></div>`;
        return;
    }

    timelineContainer.innerHTML = `<div class="timeline-container"><div class="timeline-line"></div><div id="timeline-markers-container"></div><div id="timeline-dots-container"></div><div id="timeline-tooltip" class="timeline-tooltip"></div></div>`;
    const dotsContainer = document.getElementById('timeline-dots-container');
    const markersContainer = document.getElementById('timeline-markers-container');

    let markersHTML = '';
    for (let i = 0; i < 24; i++) {
        const percentOfDay = (i / 24) * 100;
        markersHTML += `<div class="timeline-hour-marker" style="left: ${percentOfDay}%;"></div>`;
        if (i > 0 && i % 2 === 0) {
            markersHTML += `<div class="timeline-hour-label" style="left: ${percentOfDay}%;">${i}:00</div>`;
        }
    }
    markersContainer.innerHTML = markersHTML;

    let lastPhone = null;
    let yPositionClass = 'position-above';
    let dotColorClass = 'dot-above';
    const dateParts = toDate.split('-');
    const dayStart = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 0, 0, 0);
    const totalDayMs = 24 * 60 * 60 * 1000;
    let dotsHTML = '';

    calls.forEach(call => {
        if (lastPhone && call.agent_phone !== lastPhone) {
            yPositionClass = yPositionClass === 'position-above' ? 'position-below' : 'position-above';
            dotColorClass = dotColorClass === 'dot-above' ? 'dot-below' : 'dot-above';
        }
        const callDate = new Date(call.timestamp);
        const callTime = Date.UTC(callDate.getUTCFullYear(), callDate.getUTCMonth(), callDate.getUTCDate(), callDate.getUTCHours(), callDate.getUTCMinutes(), callDate.getUTCSeconds());
        const percentOfDay = ((callTime - dayStart) / totalDayMs) * 100;

        // --- MODIFICATION: Added timeZone: 'UTC' back to ensure tooltip time matches chart time ---
        dotsHTML += `<div class="timeline-dot ${yPositionClass} ${dotColorClass}" 
                          style="left: ${percentOfDay}%;"
                          data-time="${callDate.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })}"
                          data-phone="${formatPhoneNumber(call.agent_phone)}"
                          data-duration="${formatDuration(call.duration)}">
                     </div>`;
        lastPhone = call.agent_phone;
    });
    dotsContainer.innerHTML = dotsHTML;

    const tooltip = document.getElementById('timeline-tooltip');
    dotsContainer.addEventListener('mouseover', e => {
        if (e.target.classList.contains('timeline-dot')) {
            const dot = e.target;
            tooltip.innerHTML = `
                <div><strong>Time:</strong> ${dot.dataset.time}</div>
                <div><strong>Phone:</strong> ${dot.dataset.phone}</div>
                <div><strong>Duration:</strong> ${dot.dataset.duration}</div>
            `;
            const containerRect = timelineContainer.getBoundingClientRect();
            const dotRect = dot.getBoundingClientRect();
            tooltip.style.left = `${dotRect.left - containerRect.left + dotRect.width / 2}px`;
            tooltip.style.top = `${dotRect.top - containerRect.top - tooltip.offsetHeight - 10}px`;
            tooltip.classList.add('visible');
        }
    });
    dotsContainer.addEventListener('mouseout', e => {
        if (e.target.classList.contains('timeline-dot')) {
            tooltip.classList.remove('visible');
        }
    });
}

// --- Main chart rendering orchestrator (No changes here) ---
function renderTeamSwitchHTMLChart(data) {
    const chartTitleEl = document.getElementById('sbTeamChartTitle');
    const chartContainer = document.getElementById('sbTeamChartContainer');
    if (!chartTitleEl || !chartContainer) return;
    
    const { key: sortKey } = sbSortConfig;
    const metricMap = {
        totalSwitches: { label: 'Switches', valueKey: 'totalSwitches', format: (v) => formatNumber(v, 0) },
        switchRate: { label: 'Switch Rate', valueKey: 'switchRate', format: (v) => `${formatNumber(v, 1)}%` },
        totalCalls: { label: 'Total Calls', valueKey: 'totalCalls', format: (v) => formatNumber(v, 0) },
        avgCallsPerSwitch: { label: 'Avg Calls/Switch', valueKey: 'avgCallsPerSwitch', format: (v) => formatNumber(v, 1) },
        stickiness: { label: 'Stickiness', valueKey: 'stickiness', format: (v) => `${formatNumber(v, 1)}%` },
        phoneDiversity: { label: 'Phone Diversity', valueKey: 'phoneDiversity', format: (v) => formatNumber(v, 0) }
    };

    const metric = metricMap[sortKey] || metricMap.totalSwitches;
    chartTitleEl.textContent = `Top 10 by ${metric.label}`;
    
    const chartData = [...data].sort((a, b) => b[metric.valueKey] - a[metric.valueKey]).slice(0, 10);
    const maxValue = Math.max(...chartData.map(d => d[metric.valueKey]), 1);

    if (chartData.length === 0) {
        chartContainer.innerHTML = '';
        return;
    }

    chartContainer.innerHTML = `<div class="bar-chart-container">${chartData.map(d => `<div class="bar-chart-row"><div class="bar-chart-label" title="${d.recruiter}">${d.recruiter}</div><div class="bar-chart-bar-wrapper"><div class="bar-chart-bar" style="width: ${(d[metric.valueKey] / maxValue) * 100}%;"></div></div><div class="bar-chart-value">${metric.format(d[metric.valueKey])}</div></div>`).join('')}</div>`;
}

function renderChart(data) {
    const recruiterFilter = document.getElementById('sbRecruiterFilter').value;
    
    const teamCard = document.getElementById('teamChartCard');
    const timelineCard = document.getElementById('timelineCard');
    const phoneUsageCard = document.getElementById('phoneUsageCard');

    if (recruiterFilter) {
        teamCard.classList.add('hidden');
        timelineCard.classList.remove('hidden');
        phoneUsageCard.classList.remove('hidden');
        
        const fromDate = document.getElementById('sbDateFromFilter').value;
        const toDate = document.getElementById('sbDateToFilter').value;

        const timelineCalls = state.workingHoursData.filter(d => d.recruiter_name === recruiterFilter && d.call_type === 'outbound' && d.timestamp && d.timestamp.substring(0, 10) === toDate).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const barChartCalls = state.workingHoursData.filter(d => d.recruiter_name === recruiterFilter && d.call_type === 'outbound' && d.timestamp && d.timestamp.substring(0, 10) >= fromDate && d.timestamp.substring(0, 10) <= toDate);

        document.getElementById('sbPhoneUsageChartTitle').textContent = `Phone Usage (${fromDate} to ${toDate})`;

        renderTimelineChart(timelineCalls, recruiterFilter, toDate);
        renderRecruiterPhoneUsageChart(barChartCalls);
    } else {
        teamCard.classList.remove('hidden');
        timelineCard.classList.add('hidden');
        phoneUsageCard.classList.add('hidden');
        renderTeamSwitchHTMLChart(data);
    }
}