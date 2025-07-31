// js/app.js

import { fetchAllData } from './api.js';
import { columnsConfig } from './config.js';
import { state } from './state.js';
import { 
    populateAllDropdowns, renderColumnCheckboxes, loadProfilesFromStorage, loadProfile,
    handleSidebarCollapse, openModal, closeModal 
} from './ui.js';
import { 
    applyAllFiltersAndRender, sortData, renderTable, renderTableHeaders 
} from './leadRiskView.js';
import { 
    initializeWorkingHours, rerenderWorkingHoursView, updateTopPerformers 
} from './workingHoursView.js';
import {
    openSettingsModal, openChartModal, addModalEventListeners
} from './modals.js';
import { initializeLeadAssignmentView, rerenderLeadAssignmentView } from './leadAssignmentView.js';
import { initializeLeadLifecycleView, rerenderLeadLifecycleView } from './leadLifecycleView.js';
import { initializePastDueView } from './pastDueView.js';
import { initializeArrivalsView } from './arrivalsView.js';
import { initializeTimeToEngageView, rerenderTimeToEngageView } from './timeToEngageView.js';
import { initializeDelegationView, rerenderDelegationView } from './delegationView.js';
import { initializeRankingsView, rerenderRankingsView } from './rankingsView.js';
import { initializeSwitchboardView, renderAllSwitchboard } from './switchboardView.js';



// Register Chart.js plugins globally
Chart.register(ChartDataLabels);

// --- FUNCTION DEFINITIONS ---

function getYesterdayDateString() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}


function initializeApp() {
    fetchAllData().then(data => {
        if (!data) {
            console.error("Failed to fetch critical data. Application cannot start.");
            return;
        }

        // --- Data Processing (No changes here) ---
        state.allData = data.leadRiskData ? data.leadRiskData.map(row => ({
            ...row, date: new Date(row.date),
            unique_phone_reveals: Number(row.unique_phone_reveals || 0), total_phone_reveals: Number(row.total_phone_reveals || 0),
            call_duration_seconds: Number(row.call_duration_seconds || 0), unique_calls: Number(row.unique_calls || 0),
            outbound_calls: Number(row.outbound_calls || 0),
            outbound_sms: Number(row.outbound_sms || 0),
            unique_sms: Number(row.unique_sms || 0),
            new_leads_assigned_on_date: Number(row.new_leads_assigned_on_date || 0),
            old_leads_assigned_on_date: Number(row.old_leads_assigned_on_date || 0),
            hot_leads_assigned: (Number(row.new_hot_leads_assigned_on_date) || 0) + (Number(row.old_hot_leads_assigned_on_date) || 0),
            fresh_leads_assigned_on_date: Number(row.fresh_leads_assigned_on_date || 0), 
            profiles_profiled: Number(row.total_profiled_leads_on_date || 0),
            profiles_completed: Number(row.closed_on_date || 0),
            median_time_to_profile: row.median_time_to_profile || "N/A",
            median_call_duration: Number(row.median_call_duration) || null,
            median_call_duration_all: Number(row.median_call_duration_all) || null,
        })).sort((a, b) => b.date - a.date) : [];

        state.workingHoursData = data.whData || [];
        state.arrivalsData = data.arrivalsData ? data.arrivalsData.map(row => ({
            ...row, 
            date: new Date(row.date),
            total_arrivals: 1 
        })) : [];
        state.drugTestsData = data.drugTestsData ? data.drugTestsData.map(row => ({
            ...row,
            date: new Date(row.date),
            total_drug_tests: 1,
        })) : [];
        state.recruiterData = data.recruiterData ? data.recruiterData.map(row => {
            const newRow = {
                date: new Date(row.date),
                recruiter_name: row.recruiter, 
                team_name: row.team,           
            };
            for (const key in row) {
                if (key !== 'date' && key !== 'recruiter' && key !== 'team') {
                    newRow[key] = Number(row[key]) || 0;
                }
            }
            return newRow;
        }) : [];
        
        state.profilerData = data.profilerData ? data.profilerData.map(row => {
            const newRow = {
                date: new Date(row.date),
                recruiter_name: row.profiler, 
                team_name: row.team,
            };
            for (const key in row) {
                if (key !== 'date' && key !== 'profiler' && key !== 'team') {
                    newRow[key] = Number(row[key]) || 0;
                }
            }
            return newRow;
        }) : [];

        const transformedMvrPspCdlData = [];
        const docTypes = ['mvr', 'psp', 'cdl'];
        const contractTypes = ['ALL', 'CPM', 'CPML', 'LOO', 'LPOO', 'MCLOO', 'MCOO', 'OO', 'POG', 'TCPM', 'TCPML'];
        const companies = [
            { suffix: 'eb', name: 'EB Infinity' },
            { suffix: 'smj', name: 'SMJ' },
            { suffix: 'amongus', name: 'AmongUs' },
            { suffix: 'all', name: 'ALL' }
        ];
        if (data.mvrPspCdlData && Array.isArray(data.mvrPspCdlData)) {
            data.mvrPspCdlData.forEach(row => {
                contractTypes.forEach(contract => {
                    companies.forEach(company => {
                        const hasData = docTypes.some(doc => {
                            const key = `${doc}_${contract}_${company.suffix}`;
                            return row[key] && Number(row[key]) > 0;
                        });

                        if (hasData) {
                            const newRow = {
                                date: new Date(row.date),
                                recruiter_name: row.entity, // Standardize
                                team_name: row.team,        // Standardize
                                company_name: company.name,
                                contract_type: contract,
                                mvr_collected_all: Number(row[`mvr_${contract}_${company.suffix}`] || 0),
                                psp_collected_all: Number(row[`psp_${contract}_${company.suffix}`] || 0),
                                cdl_collected_all: Number(row[`cdl_${contract}_${company.suffix}`] || 0),
                            };
                            transformedMvrPspCdlData.push(newRow);
                        }
                    });
                });
            });
        }
        state.mvrPspCdlData = transformedMvrPspCdlData;
        state.leadLifecycleData = data.leadLifecycleData || [];
        state.combinedDataForRankings = [...state.allData, ...state.drugTestsData, ...state.mvrPspCdlData, ...state.recruiterData, ...state.profilerData];

        if (data.updatesData && data.updatesData.version) {
            const latestVersion = data.updatesData.version;
            const lastSeenVersion = localStorage.getItem('lastSeenUpdateVersion');
            if (String(latestVersion) !== lastSeenVersion) {
                openUpdateModal(data.updatesData);
            }
        }

        // --- UI Initialization (No changes here) ---
        if (state.allData.length > 0) {
            const latestDate = state.allData[0].date;
            const dateString = latestDate.toISOString().split('T')[0];
            document.getElementById('dateFromFilter').value = dateString;
            document.getElementById('dateToFilter').value = dateString;
            document.getElementById('whDateToFilter').value = dateString;
            document.getElementById('laDateToFilter').value = dateString;
            document.getElementById('rankingsDateToFilter').value = dateString;
            document.getElementById('arrivalsDateToFilter').value = dateString;
            const sevenDaysAgo = new Date(latestDate);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
            document.getElementById('whDateFromFilter').value = sevenDaysAgoStr;
            document.getElementById('laDateFromFilter').value = sevenDaysAgoStr;
            document.getElementById('rankingsDateFromFilter').value = sevenDaysAgoStr;
            document.getElementById('arrivalsDateFromFilter').value = sevenDaysAgoStr;
        }

        const yesterdayDate = getYesterdayDateString();
        document.getElementById('tteDateFromFilter').value = yesterdayDate;
        document.getElementById('tteDateToFilter').value = yesterdayDate;

        loadProfilesFromStorage();
        populateAllDropdowns();
        initializeLeadAssignmentView();
        initializeLeadLifecycleView(); // Initialize the new view
        initializeWorkingHours();
        initializePastDueView();
        initializeArrivalsView();
        initializeTimeToEngageView();
        initializeDelegationView();
        initializeRankingsView();
        initializeSwitchboardView();
        renderColumnCheckboxes();
        addEventListeners();
        addModalEventListeners();
        applyAllFiltersAndRender();

    }).catch(error => {
        console.error('Initialization failed:', error);
    }).finally(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        loadingScreen.classList.add('opacity-0');
        setTimeout(() => loadingScreen.classList.add('hidden'), 500);
    });
}

function addEventListeners() {
    const navButtons = {
        delegation: document.getElementById('navDelegation'),
        rankings: document.getElementById('navRankings'),
        leadAssignment: document.getElementById('navLeadAssignment'),
        leadLifecycle: document.getElementById('navLeadLifecycle'), // Add new button
        leadRisk: document.getElementById('navLeadRisk'),
        workingHours: document.getElementById('navWorkingHours'),
        pastDue: document.getElementById('navPastDue'),
        arrivals: document.getElementById('navArrivals'),
        timeToEngage: document.getElementById('navTimeToEngage'),
        switchboard: document.getElementById('navSwitchboard'),
    };

    const views = {
        delegation: document.getElementById('delegationView'),
        rankings: document.getElementById('rankingsView'),
        leadAssignment: document.getElementById('leadAssignmentView'),
        leadLifecycle: document.getElementById('leadLifecycleView'), // Add new view
        leadRisk: document.getElementById('leadRiskView'),
        workingHours: document.getElementById('workingHoursView'),
        pastDue: document.getElementById('pastDueView'),
        arrivals: document.getElementById('arrivalsView'),
        timeToEngage: document.getElementById('timeToEngageView'),
        switchboard: document.getElementById('switchboardView'),
    };

    function setActiveView(activeView) {
        for (const key in navButtons) {
            navButtons[key].classList.toggle('active', key === activeView);
        }
        for (const key in views) {
            views[key].classList.toggle('hidden', key !== activeView);
        }
    }

    navButtons.delegation.addEventListener('click', () => {
        setActiveView('delegation');
        rerenderDelegationView();
    });
    navButtons.rankings.addEventListener('click', () => { setActiveView('rankings'); rerenderRankingsView(); });
    navButtons.leadAssignment.addEventListener('click', () => { setActiveView('leadAssignment'); rerenderLeadAssignmentView(); });
    navButtons.leadLifecycle.addEventListener('click', () => { setActiveView('leadLifecycle'); rerenderLeadLifecycleView(); });
    navButtons.leadRisk.addEventListener('click', () => setActiveView('leadRisk'));
    navButtons.workingHours.addEventListener('click', () => { setActiveView('workingHours'); rerenderWorkingHoursView(); });
    navButtons.pastDue.addEventListener('click', () => setActiveView('pastDue'));
    navButtons.arrivals.addEventListener('click', () => setActiveView('arrivals'));
    navButtons.timeToEngage.addEventListener('click', () => { setActiveView('timeToEngage'); rerenderTimeToEngageView(); });
    navButtons.switchboard.addEventListener('click', () => { setActiveView('switchboard'); renderAllSwitchboard(); });
    

    document.getElementById('collapseBtn').addEventListener('click', handleSidebarCollapse);

    document.getElementById('filtersBtn').addEventListener('click', () => {
        document.getElementById('filtersPanel').classList.toggle('hidden');
        document.querySelector('#filtersBtn .fa-chevron-down').classList.toggle('rotate-180');
    });

    const leadRiskFilters = ['dateFromFilter', 'dateToFilter', 'contractFilter', 'companyFilter', 'recruiterFilter'];
    leadRiskFilters.forEach(id => document.getElementById(id).addEventListener('change', applyAllFiltersAndRender));
    
    document.getElementById('teamFilter').addEventListener('change', () => {
        populateAllDropdowns(document.getElementById('teamFilter').value);
        applyAllFiltersAndRender();
    });

    document.getElementById('tableHeader').addEventListener('click', (e) => {
        const header = e.target.closest('.sortable');
        if (header) sortData(header.dataset.sortKey);
    });
    
    document.getElementById('tableBody').addEventListener('click', (e) => {
        const row = e.target.closest('.table-body-row');
        if(row?.dataset.recruiter) openChartModal(row.dataset.recruiter);
    });

    document.getElementById('viewStubBtn').addEventListener('click', () => {
        state.viewMode = 'stub';
        document.getElementById('viewStubBtn').classList.add('active');
        document.getElementById('viewAggregatedBtn').classList.remove('active');
        applyAllFiltersAndRender();
    });

    document.getElementById('viewAggregatedBtn').addEventListener('click', () => {
        state.viewMode = 'aggregated';
        document.getElementById('viewAggregatedBtn').classList.add('active');
        document.getElementById('viewStubBtn').classList.remove('active');
        applyAllFiltersAndRender();
    });
    
    document.getElementById('columnToggleBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('columnToggleDropdown');
        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
            dropdown.classList.remove('hidden');
            setTimeout(() => dropdown.classList.remove('opacity-0', 'scale-95'), 10);
        } else {
            dropdown.classList.add('opacity-0', 'scale-95');
            setTimeout(() => dropdown.classList.add('hidden'), 200);
        }
    });

    document.getElementById('columnCheckboxes').addEventListener('change', e => {
        if (e.target.matches('input[type="checkbox"]')) {
            columnsConfig[e.target.dataset.key].visible = e.target.checked;
            renderTableHeaders();
            renderTable();
        }
    });

    document.getElementById('profilesDropdown').addEventListener('change', (e) => {
         if (e.target.value === '__add_new__') {
            openSettingsModal('create');
         } else {
            loadProfile(e.target.value);
         }
    });
    
    document.getElementById('settingsBtn').addEventListener('click', () => openSettingsModal('edit', state.activeProfileName));
    
   const whFilters = ['whRecruiterFilter', 'whTeamFilter', 'whDateFromFilter', 'whDateToFilter', 'whCompanyFilter', 'whCallTypeFilter', 'whCallStatusFilter', 'whSmsTypeFilter', 'whSmsStatusFilter', 'heatmapDataTypeSelect', 'hourlyActivityDayFilter'];
   whFilters.forEach(id => document.getElementById(id).addEventListener('change', rerenderWorkingHoursView));

    document.getElementById('insightChartSelect').addEventListener('change', (e) => {
        state.currentFutureChartIndex = parseInt(e.target.value, 10);
        rerenderWorkingHoursView();
    });

    document.getElementById('topPerformersViewSelect').addEventListener('change', rerenderWorkingHoursView);

    const heatmapContainer = document.getElementById('heatmapContainer');
    const heatmapTooltip = document.getElementById('heatmapTooltip');
    heatmapContainer.addEventListener('mouseover', e => {
        const cell = e.target.closest('.heatmap-cell');
        if (cell?.dataset.tooltipContent) {
            heatmapTooltip.innerHTML = cell.dataset.tooltipContent;
            heatmapTooltip.classList.remove('hidden');
        }
    });
    heatmapContainer.addEventListener('mousemove', e => {
        if (!heatmapTooltip.classList.contains('hidden')) {
            heatmapTooltip.style.left = `${e.pageX + 15}px`;
            heatmapTooltip.style.top = `${e.pageY + 15}px`;
        }
    });
    heatmapContainer.addEventListener('mouseout', () => heatmapTooltip.classList.add('hidden'));
    heatmapContainer.addEventListener('click', e => {
        const cell = e.target.closest('.heatmap-cell');
        if (cell) {
            const { day, hour, dayName } = cell.dataset;
            updateTopPerformers(day, hour, dayName);
        }
    });

    document.addEventListener('click', (e) => {
        const columnDropdown = document.getElementById('columnToggleDropdown');
        if (!e.target.closest('#columnToggleBtn') && !e.target.closest('#columnToggleDropdown')) {
            columnDropdown.classList.add('opacity-0', 'scale-95');
            setTimeout(() => columnDropdown.classList.add('hidden'), 200);
        }
    });
}
// --- NEW: Function to open the update modal ---
function openUpdateModal(update) {
    const modal = document.getElementById('updateModal');
    if (!modal) return;
    
    document.getElementById('updateModalTitle').textContent = update.title;
    
    document.getElementById('updateModalContent').innerHTML = update.notes;

    openModal('updateModal');

    // Close button event listener for the new modal
    document.getElementById('closeUpdateModalBtn').addEventListener('click', () => {
        closeModal('updateModal');
        if (update.version) {
            localStorage.setItem('lastSeenUpdateVersion', update.version);
        }
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);
