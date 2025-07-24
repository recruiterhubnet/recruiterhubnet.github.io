// js/leadAssignmentView.js

import { state } from './state.js';
import { laColumnsConfig } from './config.js';

let isInitialized = false;
let activeTooltip = null;

// --- HELPER FUNCTIONS ---

function formatNumber(value, decimals = 0) {
    const num = Number(value);
    if (isNaN(num)) return 0;
    return num.toFixed(decimals);
}

function calculateColumnStats(values) {
    if (values.length === 0) return { sum: 0, average: 0, median: 0, min: 0, max: 0 };
    const sum = values.reduce((acc, v) => acc + v, 0);
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return { sum, average: sum / values.length, median, min: sorted[0] || 0, max: sorted[sorted.length - 1] || 0 };
}


// --- INITIALIZATION AND EVENT LISTENERS ---

export function initializeLeadAssignmentView() {
    if (isInitialized) return;

    const leadAssignmentView = document.getElementById('leadAssignmentView');

    const filterIds = ['laRecruiterFilter', 'laTeamFilter', 'laCompanyFilter', 'laContractFilter', 'laDateFromFilter', 'laDateToFilter'];
    filterIds.forEach(id => document.getElementById(id)?.addEventListener('change', renderLeadAssignmentView));
    
    document.getElementById('laTableHeader')?.addEventListener('click', (e) => {
        const header = e.target.closest('.sortable');
        if (header) {
            sortLAData(header.dataset.sortKey);
        }
    });

    document.getElementById('laViewStubBtn').addEventListener('click', () => {
        if (state.laViewMode === 'stub') return;
        state.laViewMode = 'stub';
        document.getElementById('laViewStubBtn').classList.add('active');
        document.getElementById('laViewAggregatedBtn').classList.remove('active');
        renderLeadAssignmentView();
    });

    document.getElementById('laViewAggregatedBtn').addEventListener('click', () => {
        if (state.laViewMode === 'aggregated') return;
        state.laViewMode = 'aggregated';
        document.getElementById('laViewAggregatedBtn').classList.add('active');
        document.getElementById('laViewStubBtn').classList.remove('active');
        renderLeadAssignmentView();
    });
    
    // --- NEW: Universal Tooltip Logic ---
    leadAssignmentView.addEventListener('mouseover', (e) => {
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
            position: fixed; /* Use fixed positioning to escape containers */
            z-index: 110; /* Ensure it's above other elements */
            width: 350px;
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

    leadAssignmentView.addEventListener('mouseout', (e) => {
        const icon = e.target.closest('.tooltip-icon');
        if (icon && activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    });


    isInitialized = true;
    renderLeadAssignmentView();
}

export function rerenderLeadAssignmentView() {
    renderLeadAssignmentView();
}


// --- DATA PROCESSING AND SORTING ---

function sortLAData(key) {
    const { laSortConfig } = state;
    if (key) {
        if (laSortConfig.key === key) {
            laSortConfig.direction = laSortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            laSortConfig.key = key;
            laSortConfig.direction = 'asc';
        }
    }
    renderLeadAssignmentView();
}

function processAndSortLAData() {
    const recruiterFilter = document.getElementById('laRecruiterFilter').value;
    const teamFilter = document.getElementById('laTeamFilter').value;
    const companyFilter = document.getElementById('laCompanyFilter').value;
    const contractFilter = document.getElementById('laContractFilter').value;
    const fromDateStr = document.getElementById('laDateFromFilter').value;
    const toDateStr = document.getElementById('laDateToFilter').value;

    const fromDate = new Date(fromDateStr + 'T00:00:00');
    const toDate = new Date(toDateStr + 'T00:00:00');

    const baseFilteredData = state.allData.filter(row => 
        (!recruiterFilter || row.recruiter_name === recruiterFilter) &&
        (!teamFilter || row.team_name === teamFilter) &&
        (!companyFilter || row.company_name === companyFilter) &&
        (!contractFilter || row.contract_type === contractFilter)
    );

    let processedData;

    if (state.laViewMode === 'stub') {
        processedData = baseFilteredData
            .filter(row => {
                const rowDate = new Date(row.date);
                return rowDate >= fromDate && rowDate <= toDate;
            })
            .map(row => ({
                ...row,
                recruiter_new_leads_at_assignment: Number(row.recruiter_new_leads_at_assignment) || 0,
                recruiter_old_leads_at_assignment: Number(row.recruiter_old_leads_at_assignment) || 0,
                new_leads_assigned_on_date: Number(row.new_leads_assigned_on_date) || 0,
                old_leads_assigned_on_date: Number(row.old_leads_assigned_on_date) || 0,
                hot_leads_assigned: Number(row.hot_leads_assigned) || 0,
            }));
    } else {
        const aggregatedMap = new Map();
        
        baseFilteredData.forEach(row => {
            if (!aggregatedMap.has(row.recruiter_name)) {
                aggregatedMap.set(row.recruiter_name, {
                    recruiter_name: row.recruiter_name,
                    team_name: row.team_name,
                    new_leads_assigned_on_date: 0,
                    old_leads_assigned_on_date: 0,
                    hot_leads_assigned: 0,
                    recruiter_new_leads_at_assignment: 0,
                    recruiter_old_leads_at_assignment: 0,
                });
            }
            
            const recruiterData = aggregatedMap.get(row.recruiter_name);
            const rowDate = new Date(row.date);

            if (rowDate >= fromDate && rowDate <= toDate) {
                recruiterData.new_leads_assigned_on_date += Number(row.new_leads_assigned_on_date) || 0;
                recruiterData.old_leads_assigned_on_date += Number(row.old_leads_assigned_on_date) || 0;
                recruiterData.hot_leads_assigned += Number(row.hot_leads_assigned) || 0;
            }

            if (row.date.toISOString().split('T')[0] === toDate.toISOString().split('T')[0]) {
                recruiterData.recruiter_new_leads_at_assignment = Number(row.recruiter_new_leads_at_assignment) || 0;
                recruiterData.recruiter_old_leads_at_assignment = Number(row.recruiter_old_leads_at_assignment) || 0;
            }
        });
        processedData = Array.from(aggregatedMap.values());
    }

    const { key, direction } = state.laSortConfig;
    const dir = direction === 'asc' ? 1 : -1;

    processedData.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1 * dir;
        if (valB == null) return -1 * dir;
        
        const config = state.laViewMode === 'stub' ? { date: { type: 'date' }, ...laColumnsConfig } : laColumnsConfig;
        if (config[key]?.type === 'number') {
            return (Number(valA) - Number(valB)) * dir;
        }
        return String(valA).localeCompare(String(valB)) * dir;
    });

    return processedData;
}


// --- RENDERING ---

function renderLeadAssignmentView() {
    renderLATableHeaders();
    const processedData = processAndSortLAData();
    renderLATable(processedData);
    renderLATableFooter(processedData);
    renderLATrendChart();
    renderLADistributionChart(processedData);
}

function renderLATableHeaders() {
    const header = document.getElementById('laTableHeader');
    if (!header) return;

    const columns = state.laViewMode === 'stub'
        ? { date: { label: 'Date', type: 'date' }, ...laColumnsConfig }
        : laColumnsConfig;

    // Defines the tooltip text for the relevant columns
    const tooltips = {
        new_leads_assigned_on_date: 'Sum of leads assigned in the selected date range that are 14 days old or less, based on their creation date.',
        old_leads_assigned_on_date: 'Sum of leads assigned in the selected date range that are more than 14 days old, based on their creation date.',
        recruiter_new_leads_at_assignment: 'Total count of leads in the recruiter\'s portfolio (as of yesterday) that are 14 days old or less.',
        recruiter_old_leads_at_assignment: 'Total count of leads in the recruiter\'s portfolio (as of yesterday) that are more than 14 days old.'
    };

    header.innerHTML = Object.entries(columns).map(([key, conf]) => {
        const { key: sortKey, direction: sortDir } = state.laSortConfig;
        const isSorted = sortKey === key;
        const sortClasses = isSorted ? `sorted-${sortDir}` : '';

        // Creates the tooltip HTML only if a tooltip exists for this column
        const tooltipHtml = tooltips[key]
        ? `<div class="tooltip-container ml-1"><i class="fas fa-question-circle tooltip-icon text-gray-400 hover:text-white cursor-pointer"></i><div class="tooltip-text" style="display: none;">${tooltips[key]}</div></div>`
        : '';

        return `
            <th scope="col" class="table-header-cell sortable ${sortClasses} py-2 px-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer" data-sort-key="${key}">
                <div class="flex items-center">
                    <span>${conf.label}</span>
                    ${tooltipHtml}
                    <span class="sort-icon sort-icon-up ml-auto"><i class="fas fa-arrow-up"></i></span>
                    <span class="sort-icon sort-icon-down"><i class="fas fa-arrow-down"></i></span>
                </div>
            </th>`;
    }).join('');
}

function renderLATable(data) {
    const tableBody = document.getElementById('laTableBody');
    if (!tableBody) return;

    const columns = state.laViewMode === 'stub' 
        ? { date: { label: 'Date', type: 'date' }, ...laColumnsConfig } 
        : laColumnsConfig;

    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${Object.keys(columns).length}" class="text-center p-8 text-gray-500">No matching records found for the selected filters.</td></tr>`;
        return;
    }

    tableBody.innerHTML = data.map(row => {
        const cells = Object.keys(columns).map(key => {
            let value = row[key];
            let cellClass = 'py-2 px-2 whitespace-nowrap';
            
            if (key === 'date' && value) {
                value = new Date(value).toLocaleDateString();
            } else if (columns[key]?.type === 'number') {
                cellClass += ' text-center font-mono';
                value = formatNumber(value, 0);
            }

            if (key === 'recruiter_name') cellClass += ' text-sky-400';
            if (key === 'team_name') cellClass += ' text-gray-400';

            return `<td class="${cellClass}">${value != null ? value : ''}</td>`;
        }).join('');
        return `<tr class="table-body-row hover:bg-gray-800/50 transition-colors">${cells}</tr>`;
    }).join('');
}

function renderLATableFooter(data) {
    const footer = document.getElementById('laTableFooter');
    if (!footer) return;

    const columns = state.laViewMode === 'stub' 
        ? { date: { label: 'Date', type: 'date' }, ...laColumnsConfig } 
        : laColumnsConfig;

    const footerCellsHtml = Object.entries(columns).map(([key, config], index) => {
        let cellContent = '';
        const summaryDropdownIndex = state.laViewMode === 'stub' ? 1 : 0;

        if (index === summaryDropdownIndex) {
             cellContent = `
                <select id="laSummaryStatSelect" class="control-deck-select text-xs w-full">
                     <option value="sum" ${state.laSummaryStat === 'sum' ? 'selected' : ''}>Sum</option>
                     <option value="average" ${state.laSummaryStat === 'average' ? 'selected' : ''}>Average</option>
                     <option value="median" ${state.laSummaryStat === 'median' ? 'selected' : ''}>Median</option>
                     <option value="min" ${state.laSummaryStat === 'min' ? 'selected' : ''}>Min</option>
                     <option value="max" ${state.laSummaryStat === 'max' ? 'selected' : ''}>Max</option>
                </select>`;
        } else if (config.type === 'number') {
            const values = data.map(row => Number(row[key])).filter(v => !isNaN(v));
            if (values.length > 0) {
                const stats = calculateColumnStats(values);
                cellContent = formatNumber(stats[state.laSummaryStat] || 0, 1);
            }
        }
        return `<td class="table-footer-cell py-1 px-2 text-center font-mono text-gray-500">${cellContent}</td>`;
    }).join('');

    footer.innerHTML = `<tr>${footerCellsHtml}</tr>`;

    document.getElementById('laSummaryStatSelect')?.addEventListener('change', (e) => {
        state.laSummaryStat = e.target.value;
        renderLATableFooter(data);
    });
}

function renderLATrendChart() {
    const ctx = document.getElementById('laTrendChart')?.getContext('2d');
    if (!ctx) return;
    if (state.laTrendChartInstance) state.laTrendChartInstance.destroy();

    const fromDateStr = document.getElementById('laDateFromFilter').value;
    const toDateStr = document.getElementById('laDateToFilter').value;
    // --- FIX: Get the recruiter and team filters ---
    const recruiterFilter = document.getElementById('laRecruiterFilter').value;
    const teamFilter = document.getElementById('laTeamFilter').value;


    const filteredChartData = state.allData.filter(row => {
        const rowDate = row.date.toISOString().split('T')[0];
        const dateMatch = rowDate >= fromDateStr && rowDate <= toDateStr;
        // --- FIX: Apply the filters to the data ---
        const recruiterMatch = !recruiterFilter || row.recruiter_name === recruiterFilter;
        const teamMatch = !teamFilter || row.team_name === teamFilter;
        return dateMatch && recruiterMatch && teamMatch;
    });

    const dailyData = new Map();
    filteredChartData.forEach(row => {
        const date = row.date.toISOString().split('T')[0];
        if (!dailyData.has(date)) {
            dailyData.set(date, { new_leads: 0, old_leads: 0 });
        }
        const day = dailyData.get(date);
        day.new_leads += Number(row.new_leads_assigned_on_date) || 0;
        day.old_leads += Number(row.old_leads_assigned_on_date) || 0;
    });

    const sortedDates = Array.from(dailyData.keys()).sort();
    
    const verticalHoverLine = {
        id: 'verticalHoverLine',
        afterDraw: (chart) => {
            if (chart.tooltip?._active?.length) {
                const ctx = chart.ctx;
                const x = chart.tooltip._active[0].element.x;
                const topY = chart.scales.y.top;
                const bottomY = chart.scales.y.bottom;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, topY);
                ctx.lineTo(x, bottomY);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    state.laTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: [
                {
                    label: 'New Leads Assigned',
                    data: sortedDates.map(date => dailyData.get(date).new_leads),
                    borderColor: 'rgb(59, 130, 246)',
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                },
                {
                    label: 'Old Leads Assigned',
                    data: sortedDates.map(date => dailyData.get(date).old_leads),
                    borderColor: 'rgb(249, 115, 22)',
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 0,
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
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        color: '#9ca3af',
                        usePointStyle: true,
                        pointStyle: 'line',
                    } 
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                },
                datalabels: {
                    display: false
                }
            },
            scales: {
                x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
                y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' }, beginAtZero: true, title: { display: true, text: 'Leads Assigned', color: '#9ca3af' } }
            }
        },
        plugins: [verticalHoverLine]
    });
}

// Helper function to aggregate data for different pie charts
function getDistributionData(data, groupBy) {
    const distribution = new Map();
    data.forEach(row => {
        const key = row[groupBy] || 'N/A';
        const totalLeads = (Number(row.new_leads_assigned_on_date) || 0) + (Number(row.old_leads_assigned_on_date) || 0);
        distribution.set(key, (distribution.get(key) || 0) + totalLeads);
    });

    // Sort by value for better visualization and get top 10
    const sortedDistribution = [...distribution.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    return {
        labels: sortedDistribution.map(d => d[0]),
        data: sortedDistribution.map(d => d[1])
    };
}

// Carousel Rendering Function
function renderLACarousel(containerId, chartsData, dotsContainerId) {
    const container = document.getElementById(containerId);
    const dotsContainer = document.getElementById(dotsContainerId);
    if (!container) return;

    if (state.laCarouselTimer) clearInterval(state.laCarouselTimer);
    container.innerHTML = chartsData.map((chart, index) => `
        <div class="chart-carousel-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
            <canvas id="${chart.id}"></canvas>
        </div>
    `).join('');

    if (dotsContainer) {
        dotsContainer.innerHTML = `<div class="carousel-dots">
            ${chartsData.map((_, index) => `<div class="carousel-dot ${index === 0 ? 'active' : ''}" data-slide-to="${index}"></div>`).join('')}
        </div>`;
    }


    chartsData.forEach(chartInfo => {
        const ctx = document.getElementById(chartInfo.id)?.getContext('2d');
        if (ctx) {
            if (state[chartInfo.instanceKey]) state[chartInfo.instanceKey].destroy();
            state[chartInfo.instanceKey] = new Chart(ctx, {
                type: chartInfo.type,
                data: chartInfo.data,
                options: chartInfo.options
            });
        }
    });

    if (chartsData.length > 1 && dotsContainer) {
        let currentIndex = 0;
        const slides = container.querySelectorAll('.chart-carousel-slide');
        const dots = dotsContainer.querySelectorAll('.carousel-dot');

        const showSlide = (index) => {
            slides.forEach((s, i) => s.classList.toggle('active', i === index));
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        };

        const startTimer = () => {
            clearInterval(state.laCarouselTimer);
            state.laCarouselTimer = setInterval(() => {
                currentIndex = (currentIndex + 1) % slides.length;
                showSlide(currentIndex);
            }, 7000);
        };

        dots.forEach(dot => {
            dot.addEventListener('click', () => {
                currentIndex = parseInt(dot.dataset.slideTo);
                showSlide(currentIndex);
                startTimer();
            });
        });

        startTimer();
    }
}


function renderLADistributionChart(data) {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { color: '#9ca3af', boxWidth: 12, padding: 25 }
            },
            datalabels: {
                color: '#FFFFFF',
                font: { weight: 'bold', size: 14 },
                formatter: (value) => new Intl.NumberFormat().format(value)
            }
        }
    };

    // Create a separate options object for the team chart to hide the legend
    const teamChartOptions = {
        ...chartOptions,
        plugins: {
            ...chartOptions.plugins,
            legend: {
                display: false // This will hide the legend for the team chart
            }
        }
    };

    const totalNewLeads = data.reduce((sum, row) => sum + (Number(row.new_leads_assigned_on_date) || 0), 0);
    const totalOldLeads = data.reduce((sum, row) => sum + (Number(row.old_leads_assigned_on_date) || 0), 0);
    const teamData = getDistributionData(data, 'team_name');

    const charts = [
        {
            id: 'laChartLeadType',
            type: 'doughnut',
            instanceKey: 'laDistributionChartInstance',
            data: {
                labels: ['New Leads', 'Old Leads'],
                datasets: [{ data: [totalNewLeads, totalOldLeads], backgroundColor: ['#22C55E', '#8B5CF6'], borderColor: '#111827', borderWidth: 2 }]
            },
            options: chartOptions
        },
        {
            id: 'laChartTeam',
            type: 'pie',
            instanceKey: 'laTeamChartInstance',
            data: {
                labels: teamData.labels,
                datasets: [{ data: teamData.data, backgroundColor: ['#A855F7', '#E11D48', '#22D3EE', '#FBBF24', '#34D399', '#FB7185'], borderColor: '#111827', borderWidth: 2 }]
            },
            options: teamChartOptions // Use the special options for this chart
        }
    ];

    renderLACarousel('laDistributionCarousel', charts, 'laCarouselDots');
}