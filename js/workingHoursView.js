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
}

export function rerenderWorkingHoursView() {
    const filteredData = getFilteredWHData();
    renderHeatmap(filteredData);
    renderHourlyActivityChart(filteredData);
    renderFutureChart(state.currentFutureChartIndex, filteredData);
    displayInitialTopPerformers(filteredData);
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

// --- HEATMAP AND TOP PERFORMERS ---
function getHeatmapData(filteredData) {
    const heatmapData = {};
    filteredData.forEach(item => {
        const date = new Date(item.timestamp);
        const day = date.getUTCDay(); // Use UTC day
        const hour = date.getUTCHours(); // Use UTC hour
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
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

    container.appendChild(document.createElement('div')); // Empty corner
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
        state.whLastSelectedDay = null; // Reset
        updateTopPerformers(null, null, null);
        return;
    }

    const viewMode = document.getElementById('topPerformersViewSelect').value;
    let dayToSelect, hourToSelect, dayNameToSelect;

    // Use the last selected day if it exists in the current filtered data
    const lastDayIsValid = state.whLastSelectedDay !== null && Object.values(heatmapData).some(d => d.day == state.whLastSelectedDay);

    if (lastDayIsValid) {
        dayToSelect = state.whLastSelectedDay;
    } else {
        // Otherwise, find the most active day in the current view
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
    
    // Determine the hour to select based on the view mode
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

    selectHeatmapCells(day, hour); // Centralize cell selection

    if (day === null) {
        topPerformersHeadline.textContent = 'Top Performers';
        performersContent.innerHTML = `<p class="text-gray-400 text-sm pt-4">No activity to display.</p>`;
        return;
    }

    state.whLastSelectedDay = day; // Keep track of the last viewed day

    const slotData = getFilteredWHData().filter(d => {
        const date = new Date(d.timestamp);
        if (viewMode === 'by_hour' && hour !== null) {
            return date.getUTCDay() == day && date.getUTCHours() == hour;
        } else { // by_day
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
        const hour = new Date(item.timestamp).getUTCHours(); // Use UTC hour
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
            dailyDuration[new Date(item.timestamp).getUTCDay()] += item.duration; // Use UTC day
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
            const day = new Date(item.timestamp).getUTCDay(); // Use UTC day
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
            const day = new Date(item.timestamp).getUTCDay(); // Use UTC day
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
