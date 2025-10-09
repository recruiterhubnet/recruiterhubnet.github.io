//
// ✅ PASTE THIS REPLACEMENT (ENTIRE FILE)
//
// js/workingHoursView.js
import { state } from './state.js';
import { whChartConfigs } from './config.js';

let chartDataFunctions = {};

// --- MAIN LOGIC ---

export function initializeWorkingHours() {
    chartDataFunctions = {
        getCallStatusData, getCallTypeData, getTop5Hours, getWorst5Hours,
        getOutboundCallDurationByDay, getMostActiveTeamByDay, getMostActiveRecruiterByDay,
        getSmsStatusData, getSmsTypeData
    };
    populateInsightChartSelect();

    const comparisonContainer = document.getElementById('whComparisonContainer');
    const comparisonBtn = document.getElementById('whComparisonBtn');
    const comparisonDropdown = document.getElementById('whComparisonDropdown');

    document.getElementById('whViewHeatmapBtn').addEventListener('click', () => {
        if (state.whChartView === 'heatmap') return;
        state.whChartView = 'heatmap';
        document.getElementById('whViewHeatmapBtn').classList.add('active');
        document.getElementById('whViewChartBtn').classList.remove('active');
        comparisonContainer.classList.add('hidden');
        rerenderWorkingHoursView();
    });

    document.getElementById('whViewChartBtn').addEventListener('click', () => {
        if (state.whChartView === 'chart') return;
        state.whChartView = 'chart';
        document.getElementById('whViewChartBtn').classList.add('active');
        document.getElementById('whViewHeatmapBtn').classList.remove('active');
        comparisonContainer.classList.remove('hidden');
        rerenderWorkingHoursView();
    });

    comparisonBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        comparisonDropdown.classList.toggle('hidden');
    });

    comparisonDropdown.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            state.whComparisonMetric = e.target.dataset.value;
            comparisonBtn.querySelector('span').textContent = e.target.textContent;
            rerenderWorkingHoursView();
        }
        comparisonDropdown.classList.add('hidden');
    });

    document.addEventListener('click', () => {
        if (!comparisonDropdown.classList.contains('hidden')) {
            comparisonDropdown.classList.add('hidden');
        }
    });
}

export function rerenderWorkingHoursView() {
    const filteredData = getFilteredWHData();
    const chartWrapper = document.getElementById('whChartWrapper');

    renderHeatmap(filteredData);

    if (state.whChartView === 'heatmap') {
        chartWrapper.classList.add('hidden');
    } else {
        chartWrapper.classList.remove('hidden');
        const comparisonData = getDailyComparisonData();
        renderDailyActivityChart(filteredData, comparisonData.data, comparisonData.label);
    }

    renderHourlyActivityChart(filteredData);
    renderFutureChart(state.currentFutureChartIndex, filteredData);
    displayInitialTopPerformers(filteredData);
}

function getDailyComparisonData() {
    const metric = state.whComparisonMetric;
    let label = '';
    const dailyMap = new Map();

    if (metric === 'none') {
        return { data: dailyMap, label: '' };
    }

    const filters = {
        recruiter: document.getElementById('whRecruiterFilter').value,
        team: document.getElementById('whTeamFilter').value,
        company: document.getElementById('whCompanyFilter').value,
        dateFrom: document.getElementById('whDateFromFilter').value,
        dateTo: document.getElementById('whDateToFilter').value,
    };
    
    // FIX: This robust date filter prevents the "Invalid time value" error.
    const dateFilter = (dateValue) => {
        if (!dateValue || !(dateValue instanceof Date) || isNaN(dateValue.getTime())) return false; 
        const rowDateStr = dateValue.toISOString().split('T')[0];
        return rowDateStr >= filters.dateFrom && rowDateStr <= filters.dateTo;
    };

    const companyToFilter = filters.company === '' ? 'ALL' : filters.company;
    let relevantData;

    switch (metric) {
        case 'profiled':
            label = 'Profiled Leads';
            // FIX: Reverted to the original logic for Profiled Leads.
            relevantData = state.allData.filter(row =>
                row.level === 'RECRUITER' &&
                row.contract_type === 'ALL' &&
                row.company_name === companyToFilter &&
                (!filters.recruiter || row.recruiter_name === filters.recruiter) &&
                (!filters.team || row.team_name === filters.team) &&
                dateFilter(row.date)
            );
            relevantData.forEach(row => {
                const dateKey = new Date(row.date).toISOString().split('T')[0];
                const currentCount = dailyMap.get(dateKey) || 0;
                dailyMap.set(dateKey, currentCount + (row.profiles_profiled || 0));
            });
            break;

        case 'completed':
            label = 'Completed Leads';
            // FIX: This now uses the new logic to ignore Profilers when "All Recruiters" is selected.
            relevantData = state.allData.filter(row => {
                const isGeneralFilter = !filters.recruiter && filters.team !== 'Profilers';
                if (isGeneralFilter && row.team_name === 'Profilers') {
                    return false;
                }
                
                return row.level === 'RECRUITER' &&
                    row.contract_type === 'ALL' &&
                    row.company_name === companyToFilter &&
                    (!filters.recruiter || row.recruiter_name === filters.recruiter) &&
                    (!filters.team || row.team_name === filters.team) &&
                    dateFilter(row.date);
            });
            relevantData.forEach(row => {
                const dateKey = new Date(row.date).toISOString().split('T')[0];
                const currentCount = dailyMap.get(dateKey) || 0;
                dailyMap.set(dateKey, currentCount + (row.profiles_completed || 0));
            });
            break;

        case 'arrivals':
            label = 'Arrivals';
            relevantData = state.arrivalsData.filter(row =>
                dateFilter(row.date) &&
                (!filters.team || row.team_name === filters.team) &&
                (!filters.recruiter || row.recruiter_name === filters.recruiter)
            );
            relevantData.forEach(row => {
                const dateKey = new Date(row.date).toISOString().split('T')[0];
                const currentCount = dailyMap.get(dateKey) || 0;
                dailyMap.set(dateKey, currentCount + 1);
            });
            break;

        case 'drug_tests':
            label = 'Drug Tests';
            relevantData = state.drugTestsData.filter(row =>
                dateFilter(row.date) &&
                (!filters.recruiter || row.recruiter_name === filters.recruiter) &&
                (!filters.team || row.team_name === filters.team) &&
                (!filters.company || row.company_name === filters.company)
            );

            if (!filters.recruiter && filters.team !== 'Profilers') {
                relevantData = relevantData.filter(row => row.team_name !== 'Profilers');
            }

            relevantData.forEach(row => {
                const dateKey = new Date(row.date).toISOString().split('T')[0];
                const currentCount = dailyMap.get(dateKey) || 0;
                dailyMap.set(dateKey, currentCount + 1);
            });
            break;
    }

    return { data: dailyMap, label };
}


function getFilteredWHData() {
    const filters = {
        recruiter: document.getElementById('whRecruiterFilter').value,
        team: document.getElementById('whTeamFilter').value,
        company: document.getElementById('whCompanyFilter').value,
        callType: document.getElementById('whCallTypeFilter').value,
        callStatus: document.getElementById('whCallStatusFilter').value,
        smsType: document.getElementById('whSmsTypeFilter').value,
        smsStatus: document.getElementById('whSmsStatusFilter').value,
        dateFrom: document.getElementById('whDateFromFilter').value,
        dateTo: document.getElementById('whDateToFilter').value,
        dataType: document.getElementById('heatmapDataTypeSelect').value,
        dayOfWeek: document.getElementById('hourlyActivityDayFilter').value,
    };

    return state.workingHoursData.filter(d => {
        const timestampDate = new Date(d.timestamp);
        const dateMatch =
            (!filters.dateFrom || d.timestamp.substring(0, 10) >= filters.dateFrom) &&
            (!filters.dateTo || d.timestamp.substring(0, 10) <= filters.dateTo);

        const dayMatch = !filters.dayOfWeek || timestampDate.getUTCDay() == filters.dayOfWeek;

        const baseMatch =
            (!filters.recruiter || d.recruiter_name === filters.recruiter) &&
            (!filters.team || d.team_name === filters.team) &&
            (!filters.company || d.company_name === filters.company) &&
            dateMatch &&
            dayMatch;

        if (!baseMatch) return false;

        if (filters.dataType === 'calls' && d.event_type !== 'call') return false;
        if (filters.dataType === 'sms' && d.event_type !== 'sms') return false;

        const callMatch = d.event_type === 'call' && (!filters.callType || d.call_type === filters.callType) && (!filters.callStatus || d.status === filters.callStatus);
        const smsMatch = d.event_type === 'sms' && (!filters.smsType || d.sms_type === filters.smsType) && (!filters.smsStatus || d.status === filters.smsStatus);

        const callFiltersActive = filters.callType || filters.callStatus;
        const smsFiltersActive = filters.smsType || filters.smsStatus;

        if (callFiltersActive && !smsFiltersActive) return callMatch || d.event_type === 'sms';
        if (!callFiltersActive && smsFiltersActive) return smsMatch || d.event_type === 'call';
        if (callFiltersActive && smsFiltersActive) return callMatch || smsMatch;

        return true;
    });
}

function renderDailyActivityChart(filteredData, comparisonData, comparisonLabel) {
    const ctx = document.getElementById('dailyActivityChart').getContext('2d');
    if (state.dailyActivityChartInstance) {
        state.dailyActivityChartInstance.destroy();
    }

    const dailyData = new Map();
    filteredData.forEach(item => {
        const dateKey = item.timestamp.substring(0, 10);
        if (!dailyData.has(dateKey)) {
            dailyData.set(dateKey, { all: 0, calls: 0, sms: 0 });
        }
        const day = dailyData.get(dateKey);
        day.all++;
        if (item.event_type === 'call') {
            day.calls++;
        } else if (item.event_type === 'sms') {
            day.sms++;
        }
    });

    const sortedDates = Array.from(dailyData.keys()).sort();
    const dataTypeSelect = document.getElementById('heatmapDataTypeSelect');
    const dataType = dataTypeSelect.value;
    const mainLabel = dataTypeSelect.options[dataTypeSelect.selectedIndex].text; // Get the selected text

    const datasets = [{
        label: mainLabel, // Use the dynamic label
        data: sortedDates.map(date => dailyData.get(date)[dataType]),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y'
    }];

    if (state.whComparisonMetric !== 'none') {
        let borderColor = '#10B981'; // Green for Profiled/Drug Tests
        if (comparisonLabel === 'Arrivals') borderColor = '#8B5CF6'; // Purple
        if (comparisonLabel === 'Completed Leads') borderColor = '#F59E0B'; // Amber

        datasets.push({
            label: comparisonLabel,
            data: sortedDates.map(date => comparisonData.get(date) || 0),
            borderColor: borderColor,
            backgroundColor: 'rgba(0,0,0,0.1)',
            fill: true,
            tension: 0.3,
            yAxisID: 'y1'
        });
    }

    const chartData = {
        labels: sortedDates,
        datasets: datasets
    };

    state.dailyActivityChartInstance = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: state.whComparisonMetric !== 'none',
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                datalabels: { display: false }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' },
                    ticks: { color: '#9ca3af' },
                    grid: { color: '#374151' }
                },
                y: {
                    beginAtZero: true,
                    type: 'linear',
                    position: 'left',
                    ticks: { color: '#9ca3af' },
                    grid: { color: '#374151' },
                    title: { display: true, text: 'Activity Count', color: '#9ca3af' }
                },
                y1: {
                    beginAtZero: true,
                    type: 'linear',
                    position: 'right',
                    display: state.whComparisonMetric !== 'none',
                    ticks: { color: '#9ca3af' },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: comparisonLabel, color: '#9ca3af' }
                }
            }
        }
    });
}

// (The rest of the functions in this file remain unchanged)

function getHeatmapData(filteredData) {
    const heatmapData = {};
    filteredData.forEach(item => {
        const date = new Date(item.timestamp);
        const day = date.getUTCDay();
        const hour = date.getUTCHours();
        const key = `${day}-${hour}`;
        if (!heatmapData[key]) {
            heatmapData[key] = { total_calls: 0, total_sms: 0, total_duration: 0, recruiters: new Set(), total_activity: 0, day, hour };
        }
        if(item.event_type === 'call') {
            heatmapData[key].total_calls++;
            heatmapData[key].total_duration += item.duration || 0;
        } else if (item.event_type === 'sms') {
            heatmapData[key].total_sms++;
        }
        heatmapData[key].total_activity = heatmapData[key].total_calls + heatmapData[key].total_sms;
        heatmapData[key].recruiters.add(item.recruiter_name);
    });
    return heatmapData;
}

function renderHeatmap(filteredWHData) {
    const container = document.getElementById('heatmapContainer');
    container.innerHTML = '';
    const heatmapData = getHeatmapData(filteredWHData);
    const maxActivity = Math.max(1, ...Object.values(heatmapData).map(d => d.total_activity));
    const colorScale = (activity) => {
        if (activity === 0) return 'bg-gray-800/40';
        const redShades = ['bg-red-50', 'bg-red-100', 'bg-red-200', 'bg-red-300', 'bg-red-400', 'bg-red-500', 'bg-red-600', 'bg-red-700', 'bg-red-800', 'bg-red-900', 'bg-red-950'];
        const intensity = Math.log(activity + 1) / Math.log(maxActivity + 1);
        const shadeIndex = Math.min(redShades.length - 1, Math.floor(intensity * redShades.length));
        return redShades[shadeIndex];
    };

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];

    container.appendChild(document.createElement('div'));
    for (let i = 0; i < 24; i++) {
        const hourLabel = document.createElement('div');
        hourLabel.className = 'heatmap-label';
        hourLabel.textContent = i.toString().padStart(2, '0');
        container.appendChild(hourLabel);
    }

    dayOrder.forEach(dayIndex => {
        const dayLabel = document.createElement('div');
        dayLabel.className = 'heatmap-label font-semibold';
        dayLabel.textContent = days[dayIndex];
        container.appendChild(dayLabel);

        for (let hour = 0; hour < 24; hour++) {
            const data = heatmapData[`${dayIndex}-${hour}`] || { total_calls: 0, total_sms: 0, total_duration: 0, recruiters: new Set(), total_activity: 0 };
            const cell = document.createElement('div');
            cell.className = `heatmap-cell ${colorScale(data.total_activity)}`;
            cell.dataset.day = dayIndex;
            cell.dataset.hour = hour;
            cell.dataset.dayName = days[dayIndex];
            cell.dataset.tooltipContent = `
                <div class="font-bold mb-1">${days[dayIndex]} at ${hour}:00</div>
                <div class="text-xs">Recruiters: <span class="font-mono text-sky-400">${data.recruiters.size}</span></div>
                <div class="text-xs">Calls: <span class="font-mono text-sky-400">${data.total_calls}</span></div>
                <div class="text-xs">SMS: <span class="font-mono text-green-400">${data.total_sms}</span></div>
                <div class="text-xs">Total Activity: <span class="font-mono text-blue-400">${data.total_activity}</span></div>
                <div class="text-xs">Duration: <span class="font-mono text-yellow-400">${Math.round(data.total_duration / 60)} min</span></div>`;
            container.appendChild(cell);
        }
    });
}

function displayInitialTopPerformers(filteredWHData) {
    const heatmapData = getHeatmapData(filteredWHData);
    if (Object.keys(heatmapData).length === 0) {
        state.whLastSelectedDay = null;
        updateTopPerformers(null, null, null);
        return;
    }

    const viewMode = document.getElementById('topPerformersViewSelect').value;
    let dayToSelect, hourToSelect, dayNameToSelect;

    const lastDayIsValid = state.whLastSelectedDay !== null && Object.values(heatmapData).some(d => d.day == state.whLastSelectedDay);

    if (lastDayIsValid) {
        dayToSelect = state.whLastSelectedDay;
    } else {
        const dailyActivity = {};
        Object.values(heatmapData).forEach(slot => {
            dailyActivity[slot.day] = (dailyActivity[slot.day] || 0) + slot.total_activity;
        });
        if (Object.keys(dailyActivity).length > 0) {
            dayToSelect = Object.keys(dailyActivity).reduce((a, b) => dailyActivity[a] > dailyActivity[b] ? a : b);
        } else {
            updateTopPerformers(null, null, null);
            return;
        }
    }

    if (viewMode === 'by_hour') {
        const mostActiveHourForDay = Object.values(heatmapData)
            .filter(d => d.day == dayToSelect)
            .reduce((max, current) => current.total_activity > max.total_activity ? current : max, { hour: 0, total_activity: -1 });
        hourToSelect = mostActiveHourForDay.hour;
    } else {
        hourToSelect = null;
    }

    dayNameToSelect = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayToSelect];

    updateTopPerformers(dayToSelect, hourToSelect, dayNameToSelect);
}

export function updateTopPerformers(day, hour, dayName) {
    const performersContent = document.getElementById('topPerformersContent');
    const topPerformersHeadline = document.getElementById('topPerformersHeadline');
    const viewMode = document.getElementById('topPerformersViewSelect').value;

    selectHeatmapCells(day, hour);

    if (day === null) {
        topPerformersHeadline.textContent = 'Top Performers';
        performersContent.innerHTML = `<p class="text-gray-400 text-sm pt-4">No activity to display.</p>`;
        return;
    }

    state.whLastSelectedDay = day;

    const slotData = getFilteredWHData().filter(d => {
        const date = new Date(d.timestamp);
        if (viewMode === 'by_hour' && hour !== null) {
            return date.getUTCDay() == day && date.getUTCHours() == hour;
        } else {
            return date.getUTCDay() == day;
        }
    });

    let headlineText;
    if (viewMode === 'by_hour' && hour !== null) {
        const hourStr = hour.toString().padStart(2, '0');
        headlineText = `Top Performers for ${dayName}, ${hourStr}:00 - ${hourStr}:59`;
    } else {
        headlineText = `Top Performers for ${dayName}`;
    }

    if (slotData.length === 0) {
        topPerformersHeadline.textContent = headlineText;
        performersContent.innerHTML = `<p class="text-gray-400 text-sm pt-4">No activity for this period.</p>`;
        return;
    }

    const recruiterStats = {};
    slotData.forEach(item => {
        if (!recruiterStats[item.recruiter_name]) {
            recruiterStats[item.recruiter_name] = { name: item.recruiter_name, team: item.team_name, calls: 0, sms: 0, duration: 0, activity: 0 };
        }
        if (item.event_type === 'call') {
            recruiterStats[item.recruiter_name].calls++;
            recruiterStats[item.recruiter_name].duration += item.duration || 0;
        } else {
            recruiterStats[item.recruiter_name].sms++;
        }
        recruiterStats[item.recruiter_name].activity = recruiterStats[item.recruiter_name].calls + recruiterStats[item.recruiter_name].sms;
    });

    const sortedPerformers = Object.values(recruiterStats).sort((a, b) => b.activity - a.activity);
    topPerformersHeadline.textContent = headlineText;

    const formatDuration = (seconds) => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${Math.round(seconds % 60)}s`;
    };

    let html = `
        <div class="pt-2"><table class="w-full text-left text-xs">
            <thead class="sticky top-0 z-10"><tr class="border-b border-gray-700">
                <th class="table-header-cell py-1.5 pr-2 font-semibold">Recruiter</th>
                <th class="table-header-cell py-1.5 px-1 font-semibold text-center">Calls</th>
                <th class="table-header-cell py-1.5 px-1 font-semibold text-center">SMS</th>
                <th class="table-header-cell py-1.5 pl-2 font-semibold text-right">Duration</th>
            </tr></thead><tbody>`;
    sortedPerformers.forEach(stats => {
        html += `<tr class="border-b border-gray-800">
            <td class="py-1.5 pr-2 text-gray-300 truncate">${stats.name}<br><span class="text-xs text-gray-500">${stats.team}</span></td>
            <td class="py-1.5 px-1 text-center font-mono text-sky-400">${stats.calls}</td>
            <td class="py-1.5 px-1 text-center font-mono text-green-400">${stats.sms}</td>
            <td class="py-1.5 pl-2 text-right font-mono text-yellow-400">${formatDuration(stats.duration)}</td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    performersContent.innerHTML = html;
}

// --- CHARTING FUNCTIONS ---
function getCallStatusData(filteredData) {
    const statusCounts = {};
    filteredData.forEach(item => {
        if (item.event_type === 'call' && item.status) statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    });
    return { labels: Object.keys(statusCounts), data: Object.values(statusCounts) };
}

function getCallTypeData(filteredData) {
    const typeCounts = {};
    filteredData.forEach(item => {
        if (item.event_type === 'call' && item.call_type) typeCounts[item.call_type] = (typeCounts[item.call_type] || 0) + 1;
    });
    return { labels: Object.keys(typeCounts), data: Object.values(typeCounts) };
}

function getSmsStatusData(filteredData) {
    const statusCounts = {};
    filteredData.forEach(item => {
        if (item.event_type === 'sms' && item.status) statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    });
    return { labels: Object.keys(statusCounts), data: Object.values(statusCounts) };
}

function getSmsTypeData(filteredData) {
    const typeCounts = {};
    filteredData.forEach(item => {
        if (item.event_type === 'sms' && item.sms_type) typeCounts[item.sms_type] = (typeCounts[item.sms_type] || 0) + 1;
    });
    return { labels: Object.keys(typeCounts), data: Object.values(typeCounts) };
}

function getHourlyActivity(filteredData) {
    const hourlyActivity = Array(24).fill(0).map((_, hour) => ({ hour, activity: 0 }));
    filteredData.forEach(item => {
        const hour = new Date(item.timestamp).getUTCHours();
        hourlyActivity[hour].activity++;
    });
    return hourlyActivity;
}

function getTop5Hours(d) { return getHourlyActivity(d).sort((a,b)=>b.activity-a.activity).slice(0,5).map(h=>({label: `${h.hour}:00`, value: h.activity})) }
function getWorst5Hours(d) { return getHourlyActivity(d).filter(h=>h.activity>0).sort((a,b)=>a.activity-b.activity).slice(0,5).map(h=>({label: `${h.hour}:00`, value: h.activity})) }

function getOutboundCallDurationByDay(filteredData) {
    const dailyDuration = Array(7).fill(0);
    filteredData.forEach(item => {
        if (item.event_type === 'call' && item.call_type === 'outbound' && item.duration) {
            dailyDuration[new Date(item.timestamp).getUTCDay()] += item.duration;
        }
    });
    const orderedLabels = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];
    const orderedData = [ dailyDuration[1], dailyDuration[2], dailyDuration[3], dailyDuration[4], dailyDuration[5], dailyDuration[6], dailyDuration[0] ];
    return { labels: orderedLabels, data: orderedData.map(d => Math.round(d / 60)) };
}

function getMostActiveTeamByDay(filteredData) {
    const dayMap = new Map();
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    filteredData.forEach(item => {
        if ((item.event_type === 'call' && item.call_type === 'outbound') || item.event_type === 'sms') {
            const day = new Date(item.timestamp).getUTCDay();
            const team = item.team_name || 'Unassigned';
            if (!dayMap.has(day)) dayMap.set(day, new Map());
            const teamStats = dayMap.get(day);
            teamStats.set(team, (teamStats.get(team) || 0) + 1);
        }
    });

    const resultLabels = [];
    const resultData = [];
    const orderedDays = [1, 2, 3, 4, 5, 6, 0];
    orderedDays.forEach(dayIndex => {
        const teamsForDay = dayMap.get(dayIndex);
        if (teamsForDay && teamsForDay.size > 0) {
            let mostActiveTeam = [...teamsForDay.entries()].reduce((a, b) => b[1] > a[1] ? b : a);
            resultLabels.push(`${daysOfWeek[dayIndex]} (${mostActiveTeam[0]})`);
            resultData.push(mostActiveTeam[1]);
        } else {
            resultLabels.push(`${daysOfWeek[dayIndex]} (N/A)`);
            resultData.push(0);
        }
    });
    return { labels: resultLabels, data: resultData };
}

function getMostActiveRecruiterByDay(filteredData) {
    const dayMap = new Map();
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    filteredData.forEach(item => {
         if ((item.event_type === 'call' && item.call_type === 'outbound') || item.event_type === 'sms') {
            const day = new Date(item.timestamp).getUTCDay();
            const recruiter = item.recruiter_name || 'Unassigned';
            if (!dayMap.has(day)) dayMap.set(day, new Map());
            const recruiterStats = dayMap.get(day);
            recruiterStats.set(recruiter, (recruiterStats.get(recruiter) || 0) + 1);
        }
    });

    const resultLabels = [];
    const resultData = [];
    const orderedDays = [1, 2, 3, 4, 5, 6, 0];
    orderedDays.forEach(dayIndex => {
        const recruitersForDay = dayMap.get(dayIndex);
         if (recruitersForDay && recruitersForDay.size > 0) {
            let mostActive = [...recruitersForDay.entries()].reduce((a, b) => b[1] > a[1] ? b : a);
            resultLabels.push(`${daysOfWeek[dayIndex]} (${mostActive[0]})`);
            resultData.push(mostActive[1]);
        } else {
            resultLabels.push(`${daysOfWeek[dayIndex]} (N/A)`);
            resultData.push(0);
        }
    });
    return { labels: resultLabels, data: resultData };
}

function renderHourlyActivityChart() {
    const ctx = document.getElementById('hourlyActivityChart').getContext('2d');
    if (state.hourlyActivityChart) state.hourlyActivityChart.destroy();

    const filteredData = getFilteredWHData();
    const hourlyData = getHourlyActivity(filteredData);

    state.hourlyActivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hourlyData.map(d => d.hour.toString().padStart(2,'0')),
            datasets: [{
                label: 'Total Activity',
                data: hourlyData.map(d => d.activity),
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: false
                }
            },
            scales: {
                x: { ticks: { color: '#9ca3af', font: {size: 10} }, grid: { color: '#374151' } },
                y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' }, beginAtZero: true, title: { display: true, text: 'Activity Count', color: '#9ca3af', font:{size: 10} } }
            }
        }
    });
}

function populateInsightChartSelect() {
    const selectEl = document.getElementById('insightChartSelect');
    selectEl.innerHTML = whChartConfigs.map((config, index) =>
        `<option value="${index}">${config.title}</option>`
    ).join('');
}

function renderFutureChart(chartIndex, filteredData) {
    const ctx = document.getElementById('futureChart').getContext('2d');
    const headline = document.getElementById('activityInsightsHeadline');

    const config = whChartConfigs[chartIndex];
    document.getElementById('insightChartSelect').value = chartIndex;
    headline.textContent = config.title;

    if (state.futureChartInstance) state.futureChartInstance.destroy();

    const result = chartDataFunctions[config.dataFn](filteredData);

    const labels = Array.isArray(result) ? result.map(d => d.label) : result.labels;
    const data = Array.isArray(result) ? result.map(d => d.value) : result.data;

    let chartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: {
               display: config.type === 'pie',
               position: 'bottom',
               labels: { color: '#9ca3af', boxWidth: 12, padding: 15, font: {size: 10} }
            },
            datalabels: {
                display: false
            }
        }
    };

    if (config.type === 'bar' && (config.title.includes('Top Team') || config.title.includes('Top Recruiter'))) {
        chartOptions.plugins.datalabels = {
            display: true,
            formatter: (value, context) => {
                const fullLabel = context.chart.data.labels[context.dataIndex];
                const match = fullLabel.match(/\(([^)]+)\)/);
                return match ? match[1] : fullLabel;
            },
            rotation: -90,
            color: '#ffffff',
            font: {
                weight: '600',
                size: 11,
            },
            anchor: 'start',
            align: 'end',
            offset: 8,
            clamp: true
        };
        chartOptions.scales = {
            x: {
                ticks: {
                    color: '#9ca3af',
                    font: { size: 10 },
                    callback: function(value) {
                        return this.getLabelForValue(value)?.split(' ')[0];
                    }
                },
                grid: { color: '#374151' }
            },
            y: {
                ticks: { color: '#9ca3af' },
                grid: { color: '#374151' },
                beginAtZero: true
            }
        };
        chartOptions.plugins.legend = { display: false };

    } else if (config.type === 'bar') {
        chartOptions.scales = {
            x: { ticks: { color: '#9ca3af', font:{size:10} }, grid: { color: '#374151' } },
            y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' }, beginAtZero: true }
        };
        chartOptions.plugins.legend = { display: false };
    }

    state.futureChartInstance = new Chart(ctx, {
        type: config.type,
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#3B82F6', '#EF4444', '#FCD34D', '#10B981', '#8B5CF6', '#EC4899', '#6366F1', '#F59E0B'],
                borderColor: '#111827',
                borderWidth: config.type === 'pie' ? 2 : 1
            }]
        },
        options: chartOptions
    });
}
function selectHeatmapCells(day, hour) {
    document.querySelectorAll('.heatmap-cell.selected').forEach(c => c.classList.remove('selected'));
    if (day === null) return;

    const viewMode = document.getElementById('topPerformersViewSelect').value;
    if (viewMode === 'by_day') {
        document.querySelectorAll(`.heatmap-cell[data-day="${day}"]`).forEach(c => c.classList.add('selected'));
    } else if (hour !== null) {
        const cell = document.querySelector(`.heatmap-cell[data-day="${day}"][data-hour="${hour}"]`);
        if (cell) cell.classList.add('selected');
    }
}
