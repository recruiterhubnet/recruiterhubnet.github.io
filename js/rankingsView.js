import { state, defaultRankingWeights, defaultRankingWeightsProfiler } from './state.js';
import { openModal, closeModal, populateMultiSelectFilter, formatNumber, formatDuration, populateFilters } from './ui.js';

let isInitialized = false;

// --- HELPER FUNCTIONS ---
function parseTTEValue(value) {
    if (value === "N/A" || value === null || value === undefined) {
        return null; // No data
    }
    if (value === "-") {
        return Infinity; // Had a lead, but never reached
    }
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

// ---- HELPER FOR TTE AND LEADS REACHED, INSIDE THE RANKINGS POPUP ---
function calculateMetricForPopup(entityName, entityMode, metricType, calculationMode) {
    // --- FIX: Get the currently selected Company and Contract filters ---
    const selectedCompanies = getSelectedValues(document.getElementById('rankingsCompanyFilterDropdown'));
    const selectedContracts = getSelectedValues(document.getElementById('rankingsContractFilterDropdown'));

    const fromDateStr = document.getElementById('rankingsDateFromFilter').value;
    const toDateStr = document.getElementById('rankingsDateToFilter').value;
    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(new Date(toDateStr).getTime() + (24 * 60 * 60 * 1000 - 1)) : null;

    const relevantData = state.allData.filter(row => {
        const nameMatch = entityMode === 'team' ? row.team_name === entityName : row.recruiter_name === entityName;
        const rowDate = new Date(row.date);
        const dateMatch = rowDate >= fromDate && rowDate <= toDate;

        // --- FIX: Apply the Company and Contract filters to the dataset ---
        const companyMatch = selectedCompanies.length === 0 || selectedCompanies.includes(row.company_name);
        const contractMatch = selectedContracts.length === 0 || selectedContracts.includes(row.contract_type);

        return nameMatch && dateMatch && companyMatch && contractMatch;
    });

    if (relevantData.length === 0) {
        return metricType === 'TTE' ? null : 0;
    }

    const values = [];
    const isProfiler = state.rankingsMode === 'profiler';
    const settings = isProfiler ? state.rankingSettingsProfiler : state.rankingSettings;
    // The percentile and lead type are correctly sourced from settings, which is what we want.
    const tteLeadType = settings.tteLeadType;
    const leadsReachedLeadType = settings.leadsReachedLeadType;

    if (metricType === 'TTE') {
        const pValueTTE = settings.ttePValue.substring(1);
        let tteKey;
        if (calculationMode === 'hot') {
            tteKey = `p_${pValueTTE}_engage`;
        } else if (calculationMode === 'fresh') {
            tteKey = `p_${pValueTTE}_engage_fresh_leads`;
        } else { // 'standard'
            tteKey = `p_${pValueTTE}_engage_${tteLeadType}`;
        }

        relevantData.forEach(row => {
            const tteValue = parseTTEValue(row[tteKey]);
            if (tteValue !== null) values.push(tteValue);
        });

        if (values.length === 0) return null;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (isFinite(sorted[mid - 1]) && isFinite(sorted[mid])) ? (sorted[mid - 1] + sorted[mid]) / 2 : Infinity;
        } else {
            return sorted[mid];
        }

    } else { // LeadsReached
        relevantData.forEach(row => {
            let dailyReached = null;
            let encounteredInfinity = false;

            for (let i = 100; i >= 10; i -= 10) {
                let leadsReachedKey;
                 if (calculationMode === 'hot') {
                    leadsReachedKey = `p_${i}_engage`;
                } else if (calculationMode === 'fresh') {
                    leadsReachedKey = `p_${i}_engage_fresh_leads`;
                } else { // 'standard'
                    leadsReachedKey = `p_${i}_engage_${leadsReachedLeadType}`;
                }
                const pValue = parseTTEValue(row[leadsReachedKey]);

                if (pValue !== null) {
                    if (isFinite(pValue)) {
                        dailyReached = i;
                        break;
                    }
                    encounteredInfinity = true;
                }
            }
            if (dailyReached === null && encounteredInfinity) dailyReached = 0;
            if (dailyReached !== null) values.push(dailyReached);
        });

        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
}

// --- SETTINGS MODAL LOGIC ---

function initializeRankingsSettingsModal() {
    const modal = document.getElementById('rankingsSettingsModal');
    if (!modal) return;

    const drugTestFilterEl = document.getElementById('rankingsDrugTestFilter');
    populateFilters(drugTestFilterEl, state.drugTestsData, 'drug_test_type', 'All Types');

    document.getElementById('closeRankingsSettingsBtn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('saveRankingsSettingsBtn').addEventListener('click', saveRankingsSettings);

    modal.querySelectorAll('.settings-nav-btn').forEach(button => {
        button.addEventListener('click', () => {
            modal.querySelectorAll('.settings-nav-btn').forEach(btn => btn.classList.remove('active', 'border-blue-500', 'text-white'));
            button.classList.add('active', 'border-blue-500', 'text-white');
            modal.querySelectorAll('.settings-section').forEach(section => section.classList.add('hidden'));
            document.getElementById(button.dataset.section).classList.remove('hidden');
        });
    });

    // --- ACCORDION LOGIC ---
    const secondaryFiltersSection = document.getElementById('secondaryFiltersSection');
    secondaryFiltersSection.addEventListener('click', (e) => {
        const header = e.target.closest('.settings-accordion-header');
        if (header) {
            const item = header.parentElement;
            item.classList.toggle('is-open');
        }
    });

    // Event listener for showing/hiding lead type dropdowns
    document.getElementById('tteSource').addEventListener('change', (e) => {
        document.getElementById('tteLeadTypeContainer').style.display = e.target.value === 'standard' ? 'block' : 'none';
    });
    document.getElementById('leadsReachedSource').addEventListener('change', (e) => {
        document.getElementById('leadsReachedLeadTypeContainer').style.display = e.target.value === 'standard' ? 'block' : 'none';
    });

    // New listeners for the Profiler-specific dropdowns
    document.getElementById('tteSourceProfiler').addEventListener('change', (e) => {
        document.getElementById('tteLeadTypeContainer').style.display = e.target.value === 'standard' ? 'block' : 'none';
    });
    document.getElementById('leadsReachedSourceProfiler').addEventListener('change', (e) => {
        document.getElementById('leadsReachedLeadTypeContainer').style.display = e.target.value === 'standard' ? 'block' : 'none';
    });


    // Exclusion Rules Logic
    document.getElementById('addExclusionRuleBtn').addEventListener('click', () => addExclusionRule());
    document.getElementById('exclusionRulesContainer').addEventListener('click', (e) => {
        if (e.target.closest('.remove-exclusion-rule-btn')) {
            e.target.closest('.exclusion-rule-item').remove();
            if (!document.querySelector('.exclusion-rule-item')) {
                 document.getElementById('exclusionRulesContainer').innerHTML = `<p class="text-gray-500 text-sm">No exclusion rules defined.</p>`;
            }
        }
    });

    document.getElementById('exclusionLogicAND').addEventListener('click', (e) => setExclusionLogic(e.target.dataset.logic));
    document.getElementById('exclusionLogicOR').addEventListener('click', (e) => setExclusionLogic(e.target.dataset.logic));
}

function openRankingsSettingsModal() {
    const isProfilerMode = state.rankingsMode === 'profiler';
    const titleEl = document.getElementById('rankingsSettingsModalTitle');
    titleEl.textContent = isProfilerMode ? "Advanced Settings (Profilers)" : "Advanced Settings (Recruiter/Team)";

    const tteSourceContainer = document.getElementById('tteSourceContainer');
    const leadsReachedSourceContainer = document.getElementById('leadsReachedSourceContainer');
    const tteSourceProfilerContainer = document.getElementById('tteSourceProfilerContainer');
    const leadsReachedSourceProfilerContainer = document.getElementById('leadsReachedSourceProfilerContainer');

    if (isProfilerMode) {
        tteSourceContainer.style.display = 'none';
        leadsReachedSourceContainer.style.display = 'none';
        tteSourceProfilerContainer.style.display = 'block';
        leadsReachedSourceProfilerContainer.style.display = 'block';
        document.getElementById('tteLeadTypeContainer').style.display = 'block';
        document.getElementById('leadsReachedLeadTypeContainer').style.display = 'block';
    } else {
        tteSourceContainer.style.display = 'block';
        leadsReachedSourceContainer.style.display = 'block';
        tteSourceProfilerContainer.style.display = 'none';
        leadsReachedSourceProfilerContainer.style.display = 'none';
    }

    loadSettingsToModal();
    openModal('rankingsSettingsModal');
}

function loadSettingsToModal() {
    const isProfilerMode = state.rankingsMode === 'profiler';
    const settings = isProfilerMode ? state.rankingSettingsProfiler : state.rankingSettings;

    const { 
        activeDayRules, ttePValue, tteLeadType, tteSource, tteSourceProfiler,
        leadsReachedLeadType, leadsReachedSource, leadsReachedSourceProfiler, drugTestType, 
        exclusionRules, exclusionLogic, callSmsDataSource, medianCallDurationSource
    } = settings;

    document.getElementById('workday_activeDayConditions').value = activeDayRules.workdays.conditionsToMeet;
    document.getElementById('workday_minCalls').value = activeDayRules.workdays.calls;
    document.getElementById('workday_minDuration').value = activeDayRules.workdays.duration;
    document.getElementById('workday_minSms').value = activeDayRules.workdays.sms;

    document.getElementById('weekend_activeDayConditions').value = activeDayRules.weekends.conditionsToMeet;
    document.getElementById('weekend_minCalls').value = activeDayRules.weekends.calls;
    document.getElementById('weekend_minDuration').value = activeDayRules.weekends.duration;
    document.getElementById('weekend_minSms').value = activeDayRules.weekends.sms;

    document.getElementById('callSmsDataSource').value = callSmsDataSource || 'all';
    document.getElementById('medianCallDurationSource').value = medianCallDurationSource || 'all_leads';

    // TTE Settings
    document.getElementById('tteSource').value = tteSource || 'standard';
    document.getElementById('tteLeadType').value = tteLeadType;
    document.getElementById('ttePercentileSelect').value = ttePValue;
    if (!isProfilerMode) {
        document.getElementById('tteLeadTypeContainer').style.display = (tteSource || 'standard') === 'standard' ? 'block' : 'none';
    }


    // Leads Reached Settings
    document.getElementById('leadsReachedSource').value = leadsReachedSource || 'standard';
    document.getElementById('leadsReachedLeadType').value = leadsReachedLeadType;
    if (isProfilerMode) {
        // For Profiler, check the Profiler-specific dropdown value
        const tteSourceProfilerValue = document.getElementById('tteSourceProfiler').value;
        document.getElementById('tteLeadTypeContainer').style.display = tteSourceProfilerValue === 'standard' ? 'block' : 'none';

        const leadsReachedSourceProfilerValue = document.getElementById('leadsReachedSourceProfiler').value;
        document.getElementById('leadsReachedLeadTypeContainer').style.display = leadsReachedSourceProfilerValue === 'standard' ? 'block' : 'none';
    } else {
        // For Recruiter/Team, check the standard dropdown value
        document.getElementById('tteLeadTypeContainer').style.display = (tteSource || 'standard') === 'standard' ? 'block' : 'none';
        document.getElementById('leadsReachedLeadTypeContainer').style.display = (leadsReachedSource || 'standard') === 'standard' ? 'block' : 'none';
    }

    // Load the new profiler-specific settings
    document.getElementById('tteSourceProfiler').value = tteSourceProfiler || 'standard';
    document.getElementById('leadsReachedSourceProfiler').value = leadsReachedSourceProfiler || 'standard';

    document.getElementById('rankingsDrugTestFilter').value = drugTestType;

    const perLeadContainer = document.getElementById('perLeadMetricsContainer');
    const perLeadMetrics = settings.perLeadMetrics || {};
    const metricLabels = {
        outbound_calls: 'Total Calls', unique_calls: 'Unique Calls', call_duration_seconds: 'Call Duration',
        outbound_sms: 'Total SMS', unique_sms: 'Unique SMS', profiles_profiled: 'Profiles Profiled',
        profiles_completed: 'Profiles Completed', total_drug_tests: 'Drug Tests', onboarded: 'Onboarded'
    };

    perLeadContainer.innerHTML = Object.keys(metricLabels).map(key => `
        <label class="flex items-center space-x-3 p-1 rounded-md hover:bg-gray-700/50 cursor-pointer">
            <input type="checkbox" data-key="${key}" class="per-lead-checkbox h-4 w-4 rounded border-gray-500 bg-gray-600 text-blue-600 focus:ring-blue-500" ${perLeadMetrics[key] ? 'checked' : ''}>
            <span class="text-sm text-gray-300">${metricLabels[key]}</span>
        </label>
    `).join('');

    renderExclusionRules(exclusionRules);
    setExclusionLogic(exclusionLogic);
}

function saveRankingsSettings() {
    const isProfilerMode = state.rankingsMode === 'profiler';
    const settingsToUpdate = isProfilerMode ? state.rankingSettingsProfiler : state.rankingSettings;

    settingsToUpdate.activeDayRules.workdays.conditionsToMeet = parseInt(document.getElementById('workday_activeDayConditions').value, 10);
    settingsToUpdate.activeDayRules.workdays.calls = parseInt(document.getElementById('workday_minCalls').value, 10);
    settingsToUpdate.activeDayRules.workdays.duration = parseInt(document.getElementById('workday_minDuration').value, 10);
    settingsToUpdate.activeDayRules.workdays.sms = parseInt(document.getElementById('workday_minSms').value, 10);

    settingsToUpdate.activeDayRules.weekends.conditionsToMeet = parseInt(document.getElementById('weekend_activeDayConditions').value, 10);
    settingsToUpdate.activeDayRules.weekends.calls = parseInt(document.getElementById('weekend_minCalls').value, 10);
    settingsToUpdate.activeDayRules.weekends.duration = parseInt(document.getElementById('weekend_minDuration').value, 10);
    settingsToUpdate.activeDayRules.weekends.sms = parseInt(document.getElementById('weekend_minSms').value, 10);

    settingsToUpdate.callSmsDataSource = document.getElementById('callSmsDataSource').value;
    settingsToUpdate.medianCallDurationSource = document.getElementById('medianCallDurationSource').value;
    settingsToUpdate.tteLeadType = document.getElementById('tteLeadType').value;
    settingsToUpdate.ttePValue = document.getElementById('ttePercentileSelect').value;
    settingsToUpdate.leadsReachedLeadType = document.getElementById('leadsReachedLeadType').value;
    settingsToUpdate.drugTestType = document.getElementById('rankingsDrugTestFilter').value;
    
    if (isProfilerMode) {
        settingsToUpdate.tteSourceProfiler = document.getElementById('tteSourceProfiler').value;
        settingsToUpdate.leadsReachedSourceProfiler = document.getElementById('leadsReachedSourceProfiler').value;
    } else {
        settingsToUpdate.tteSource = document.getElementById('tteSource').value;
        settingsToUpdate.leadsReachedSource = document.getElementById('leadsReachedSource').value;
    }
    
    settingsToUpdate.perLeadMetrics = settingsToUpdate.perLeadMetrics || {};
    document.querySelectorAll('.per-lead-checkbox').forEach(checkbox => {
        settingsToUpdate.perLeadMetrics[checkbox.dataset.key] = checkbox.checked;
    });

    settingsToUpdate.exclusionRules = [];
    document.querySelectorAll('.exclusion-rule-item').forEach(item => {
        settingsToUpdate.exclusionRules.push({
            metric: item.querySelector('.exclusion-metric').value,
            operator: item.querySelector('.exclusion-operator').value,
            value: Number(item.querySelector('.exclusion-value').value)
        });
    });
    settingsToUpdate.exclusionLogic = document.querySelector('.exclusion-logic-btn.active').dataset.logic;

    const storageKey = isProfilerMode ? 'rankingSettingsProfiler' : 'rankingSettings';
    localStorage.setItem(storageKey, JSON.stringify(settingsToUpdate));

    closeModal('rankingsSettingsModal');
    rerenderRankingsView();
}

function getExclusionMetricOptions() {
    return [
        { value: 'total_leads', label: 'Min Total Leads' },
        { value: 'outbound_calls', label: 'Min Total Calls' },
        { value: 'call_duration_seconds', label: 'Min Call Duration (s)' },
        { value: 'unique_sms', label: 'Min Unique SMS' },
        { value: 'active_days', label: 'Min Active Days' },
        { value: 'onboarded', label: 'Min Onboarded' },
        { value: 'total_drug_tests', label: 'Min Drug Tests' },
        { value: 'profiler_note_lenght_all', label: 'Min Note Lenght' }
    ];
}

function renderExclusionRules(rules) {
    const container = document.getElementById('exclusionRulesContainer');
    container.innerHTML = '';
    if (rules && rules.length > 0) {
        rules.forEach(rule => addExclusionRule(rule));
    } else {
        container.innerHTML = `<p class="text-gray-500 text-sm">No exclusion rules defined.</p>`;
    }
}

function addExclusionRule(rule = null) {
    const container = document.getElementById('exclusionRulesContainer');
    if (container.querySelector('p')) {
        container.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = 'exclusion-rule-item flex items-center gap-2';

    const metricOptions = getExclusionMetricOptions().map(opt =>
        `<option value="${opt.value}" ${rule && rule.metric === opt.value ? 'selected' : ''}>${opt.label}</option>`
    ).join('');

    const operatorOptions = ['>=', '<=', '='].map(op =>
        `<option value="${op}" ${rule && rule.operator === op ? 'selected' : ''}>${op}</option>`
    ).join('');

    item.innerHTML = `
        <select class="modal-select exclusion-metric flex-grow">${metricOptions}</select>
        <select class="modal-select exclusion-operator w-24">${operatorOptions}</select>
        <input type="number" class="modal-input exclusion-value w-24" value="${rule ? rule.value : 0}" min="0">
        <button class="remove-exclusion-rule-btn icon-btn hover:bg-red-500/20 hover:text-red-400 p-2"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(item);
}

function setExclusionLogic(logic) {
    document.getElementById('exclusionLogicAND').classList.toggle('active', logic === 'AND');
    document.getElementById('exclusionLogicOR').classList.toggle('active', logic === 'OR');
}

// --- RANKING WEIGHTS MODAL ---

function initializeRankingWeightsModal() {
    const modal = document.getElementById('rankingWeightsModal');
    if (!modal) return;

    document.getElementById('closeRankingWeightsBtn').addEventListener('click', () => closeModal('rankingWeightsModal'));
    document.getElementById('saveRankingWeightsBtn').addEventListener('click', saveRankingWeights);
    
    document.getElementById('resetRankingWeightsBtn').addEventListener('click', () => {
        if (!confirm("Are you sure you want to reset the weights to their default values? This cannot be undone.")) {
            return;
        }

        const isProfilerMode = state.rankingsMode === 'profiler';
        
        if (isProfilerMode) {
            // Get the true default weights, deep-cloned
            const newDefaults = JSON.parse(JSON.stringify(defaultRankingWeightsProfiler));
            
            // Update the current state
            state.rankingWeightsProfiler = newDefaults;
            
            // Remove the old, incorrect data from storage
            localStorage.removeItem('rankingWeightsProfiler');
            
            // Re-render the modal with the correct default data
            openRankingWeightsModal(newDefaults);
        } else {
            // This is the added logic for Recruiter/Team
            const newDefaults = JSON.parse(JSON.stringify(defaultRankingWeights)); // Resets to the initial state values for Recruiter/Team
            state.rankingWeights = newDefaults;
            localStorage.removeItem('rankingWeights');
            openRankingWeightsModal(newDefaults);
        }
    });

    modal.addEventListener('input', e => {
        if (e.target.classList.contains('weight-input')) {
            const groupContainer = e.target.closest('.weight-group');
            if (groupContainer) {
                updateGroupTotal(groupContainer);
            }
        }
    });

    modal.addEventListener('click', e => {
        const row = e.target.closest('.weight-item-row.is-expandable');
        if (row) {
            row.parentElement.classList.toggle('is-open');
            const childrenContainer = row.nextElementSibling;
            if (childrenContainer) {
                childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'flex' : 'none';
            }
        }
    });
}

function openRankingWeightsModal(weightsToLoad = null) {
    const isProfilerMode = state.rankingsMode === 'profiler';
    const weights = weightsToLoad || (isProfilerMode ? state.rankingWeightsProfiler : state.rankingWeights);
    const modalTitle = isProfilerMode ? "Profiler Ranking Weights" : "Recruiter/Team Ranking Weights";

    document.getElementById('rankingWeightsModalTitle').textContent = modalTitle;
    const container = document.getElementById('rankingWeightsContainer');

    const complianceChildren = isProfilerMode ? [
        { key: 'tte_percentile', label: 'Time To Engage', icon: 'fa-user-clock' },
        { key: 'leads_reached_percentile', label: 'Leads Reached', icon: 'fa-address-book' },
        { key: 'median_call_duration_percentile', label: 'Median Call Duration', icon: 'fa-headset' },
        { key: 'profiles_score', title: 'Profile Score', icon: 'fa-id-card' },
        { key: 'documents_score', title: 'Documents Score', icon: 'fa-file-alt' }
    ] : [
        { key: 'tte_percentile', label: 'Time To Engage', icon: 'fa-user-clock' },
        { key: 'leads_reached_percentile', label: 'Leads Reached', icon: 'fa-address-book' },
        { key: 'median_call_duration_percentile', label: 'Median Call Duration', icon: 'fa-headset' },
        { key: 'profiles_completed_percentile', label: 'Profiles Closed', icon: 'fa-id-card' },
        { key: 'documents_score', title: 'Documents Score', icon: 'fa-file-alt' },
        { key: 'past_due_ratio_percentile', label: 'Past Due Ratio', icon: 'fa-calendar-times' }
    ];

    const structure = [
        { key: 'final_score', title: 'Final Score', icon: 'fa-award', children: [
            { key: 'effort_score', title: 'Effort Score', icon: 'fa-running' },
            { key: 'compliance_score', title: 'Compliance Score', icon: 'fa-check-double' },
            { key: 'arrivals_score', title: 'Arrivals Score', icon: 'fa-plane-arrival' }
        ]},
        { key: 'effort_score', children: [
            { key: 'calls_score', title: 'Calls Score', icon: 'fa-phone-alt' },
            { key: 'sms_score', title: 'SMS Score', icon: 'fa-comment-alt' },
            { key: 'profiler_note_lenght_percentile', label: 'Note Length', icon: 'fa-sticky-note' },
            { key: 'active_days_percentile', label: 'Active Days', icon: 'fa-calendar-check' },
            { key: 'median_time_to_profile_percentile', label: 'Time to Profile', icon: 'fa-user-clock' }
        ]},
        { key: 'compliance_score', children: complianceChildren },
        { key: 'calls_score', children: [ { key: 'outbound_calls_percentile', label: 'Total' }, { key: 'unique_calls_percentile', label: 'Unique' }, { key: 'call_duration_seconds_percentile', label: 'Duration' } ]},
        { key: 'sms_score', children: [ { key: 'outbound_sms_percentile', label: 'Total' }, { key: 'unique_sms_percentile', label: 'Unique' } ]},
        { key: 'profiles_score', children: [ { key: 'profiles_profiled_percentile', label: 'Profiled' }, { key: 'profiles_completed_percentile', label: 'Completed' } ]},
        { key: 'documents_score', children: [ { key: 'mvr_percentile', label: 'MVR' }, { key: 'psp_percentile', label: 'PSP' }, { key: 'cdl_percentile', label: 'CDL' } ]},
        { key: 'arrivals_score', children: [ { key: 'total_drug_tests_percentile', label: 'Drug Tests' }, { key: 'onboarded_percentile', label: 'Onboarded' } ]},
    ];

    const generateHtmlRecursive = (items, parentWeights) => {
        let filteredItems = items;
        if (isProfilerMode) {
            // No specific items to filter out for profilers in this simplified logic,
            // as complianceChildren already handles the main differences.
        } else {
            // For recruiters, hide profiler-specific effort metrics
            filteredItems = items.filter(item => 
                item.key !== 'profiler_note_lenght_percentile' && 
                item.key !== 'median_time_to_profile_percentile'
            );
        }
        
        return filteredItems
            .map(item => {
                const hasChildren = structure.some(s => s.key === item.key);
                const title = item.title || item.label;
                const value = parentWeights ? parentWeights[item.key] : 0;
                const icon = item.icon || 'fa-chart-bar';

                const childrenHtml = hasChildren ? `
                    <div class="weight-children-container" style="display: none;">
                        <div class="weight-group" data-group-key="${item.key}">
                            ${generateHtmlRecursive(structure.find(s => s.key === item.key).children, weights[item.key])}
                            <div class="group-total-display"></div>
                        </div>
                    </div>` : '';

                return `
                    <div class="weight-item-row ${hasChildren ? 'is-expandable' : ''}">
                        <div class="item-main">
                            <i class="fas ${icon} item-icon"></i>
                            <span class="item-title">${title}</span>
                        </div>
                        <i class="fas fa-chevron-right expander-arrow" style="visibility: ${hasChildren ? 'visible' : 'hidden'}"></i>
                        <div class="weight-input-wrapper" style="visibility: ${item.key !== 'final_score' ? 'visible' : 'hidden'}">
                            <input type="number" data-key="${item.key}" class="weight-input" min="0" max="100" value="${value || 0}">
                            <span class="percent-sign">%</span>
                        </div>
                    </div>
                    ${childrenHtml}
                `;
            }).join('');
    };

    container.innerHTML = `<div class="weight-group">${generateHtmlRecursive(structure.find(s => s.key === 'final_score').children, weights.final_score)}<div class="group-total-display"></div></div>`;

    container.querySelectorAll('.weight-group').forEach(updateGroupTotal);

    openModal('rankingWeightsModal');
}

function updateGroupTotal(groupEl) {
    let total = 0;
    const totalDisplay = groupEl.querySelector(':scope > .group-total-display');

    groupEl.querySelectorAll(':scope > .weight-item-row .weight-input').forEach(input => {
        total += parseInt(input.value, 10) || 0;
    });

    if (totalDisplay) {
        totalDisplay.textContent = `Total: ${total}%`;
        totalDisplay.classList.toggle('is-valid', total === 100);
        totalDisplay.classList.toggle('is-invalid', total !== 100);
    }
}

function saveRankingWeights() {
    const errorMsg = document.getElementById('weightsErrorMsg');
    errorMsg.textContent = '';
    let allValid = true;

    document.querySelectorAll('#rankingWeightsContainer .weight-group').forEach(groupEl => {
        const totalDisplay = groupEl.querySelector(':scope > .group-total-display');
        if (totalDisplay && !totalDisplay.classList.contains('is-valid')) {
            allValid = false;
        }
    });

    if (!allValid) {
        errorMsg.textContent = 'All groups must sum to 100%.';
        return;
    }

    const isProfilerMode = state.rankingsMode === 'profiler';
    const weightsToSave = isProfilerMode
        ? JSON.parse(JSON.stringify(state.rankingWeightsProfiler))
        : JSON.parse(JSON.stringify(state.rankingWeights));

    document.querySelectorAll('#rankingWeightsContainer .weight-input').forEach(input => {
        const itemKey = input.dataset.key;
        const parentRow = input.closest('.weight-item-row');
        const groupEl = parentRow.closest('.weight-group[data-group-key]');

        if (groupEl) {
            const groupKey = groupEl.dataset.groupKey;
            if (weightsToSave[groupKey] && weightsToSave[groupKey].hasOwnProperty(itemKey)) {
                weightsToSave[groupKey][itemKey] = parseInt(input.value, 10) || 0;
            }
        } else {
            if (weightsToSave.final_score && weightsToSave.final_score.hasOwnProperty(itemKey)) {
                weightsToSave.final_score[itemKey] = parseInt(input.value, 10) || 0;
            }
        }
    });

    if (isProfilerMode) {
        state.rankingWeightsProfiler = weightsToSave;
        localStorage.setItem('rankingWeightsProfiler', JSON.stringify(weightsToSave));
    } else {
        state.rankingWeights = weightsToSave;
        localStorage.setItem('rankingWeights', JSON.stringify(weightsToSave));
    }

    closeModal('rankingWeightsModal');
    rerenderRankingsView();
}


// --- CORE VIEW LOGIC ---

function getPercentile(value, sortedArray, inverted = false) {
    if (value === null || typeof value === 'undefined' || !isFinite(value)) {
        return 0;
    }

    const finiteValues = sortedArray.filter(v => isFinite(v));
    if (finiteValues.length < 2) {
        return 100;
    }

    const minVal = finiteValues[0];
    const maxVal = finiteValues[finiteValues.length - 1];

    if (maxVal === minVal) {
        return 100;
    }

    if (!inverted) {
        if (value >= maxVal) return 100;
        if (value <= minVal) return 0;
    } else {
        if (value <= minVal) return 100;
        if (value >= maxVal) return 0;
    }

    const index = finiteValues.findIndex(v => v >= value);
    
    let percentile;
    if (index === -1) {
        percentile = 100;
    } else {
        percentile = (index / (finiteValues.length - 1)) * 100;
    }
    
    return inverted ? 100 - percentile : percentile;
}


const getSelectedValues = (dropdownEl) => {
    if (!dropdownEl) return [];
    return Array.from(dropdownEl.querySelectorAll('input:not([data-role="select-all"]):checked')).map(cb => cb.value);
};

export function initializeRankingsView() {
    if (isInitialized) return;

    const savedSettings = localStorage.getItem('rankingSettings');
    if (savedSettings && savedSettings !== 'undefined') {
        try {
            state.rankingSettings = { ...state.rankingSettings, ...JSON.parse(savedSettings) };
        } catch (e) {
            console.error("Failed to parse rankingSettings from localStorage.", e);
            localStorage.setItem('rankingSettings', JSON.stringify(state.rankingSettings));
        }
    } else {
        localStorage.setItem('rankingSettings', JSON.stringify(state.rankingSettings));
    }

    const savedProfilerSettings = localStorage.getItem('rankingSettingsProfiler');
    if (savedProfilerSettings && savedProfilerSettings !== 'undefined') {
        try {
            state.rankingSettingsProfiler = { ...state.rankingSettingsProfiler, ...JSON.parse(savedProfilerSettings) };
        } catch (e) {
            console.error("Failed to parse rankingSettingsProfiler from localStorage.", e);
            localStorage.setItem('rankingSettingsProfiler', JSON.stringify(state.rankingSettingsProfiler));
        }
    } else {
        localStorage.setItem('rankingSettingsProfiler', JSON.stringify(state.rankingSettingsProfiler));
    }

    const savedRecruiterWeights = localStorage.getItem('rankingWeights');
    if (savedRecruiterWeights && savedRecruiterWeights !== 'undefined') {
        try {
            state.rankingWeights = JSON.parse(savedRecruiterWeights);
        } catch (e) {
            console.error("Failed to parse rankingWeights from localStorage.", e);
        }
    }

    const savedProfilerWeights = localStorage.getItem('rankingWeightsProfiler');
    if (savedProfilerWeights && savedProfilerWeights !== 'undefined') {
        try {
            state.rankingWeightsProfiler = JSON.parse(savedProfilerWeights);
        } catch (e) {
            console.error("Failed to parse rankingWeightsProfiler from localStorage.", e);
        }
    }


    populateRankingsFilters();
    addRankingsEventListeners();
    initializeRankingsSettingsModal();
    initializeRankingWeightsModal();
    initializeBreakdownModal();

    renderRankings();
    isInitialized = true;
}

export function rerenderRankingsView() {
    renderRankings();
}
// PREVIOUS CODE: function populateRankingsFilters() {
    //let teamData;
    //if (state.rankingsMode === 'profiler') {
     //   teamData = state.combinedDataForRankings.filter(d => d.team_name === 'Profilers');
    //} else {
     //   teamData = state.combinedDataForRankings.filter(d => d.team_name !== 'Profilers');
    //}

    //populateMultiSelectFilter(document.getElementById('rankingsTeamFilterBtn'), document.getElementById('rankingsTeamFilterDropdown'), teamData, 'team_name', 'All Teams');
    //populateMultiSelectFilter(document.getElementById('rankingsCompanyFilterBtn'), document.getElementById('rankingsCompanyFilterDropdown'), state.combinedDataForRankings, 'company_name', 'All Companies');
    //populateMultiSelectFilter(document.getElementById('rankingsContractFilterBtn'), document.getElementById('rankingsContractFilterDropdown'), state.combinedDataForRankings, 'contract_type', 'All Contracts');
//} //
function populateRankingsFilters() {
    let teamData;
    if (state.rankingsMode === 'profiler') {
        teamData = state.combinedDataForRankings.filter(d => d.team_name === 'Profilers');
    } else {
        teamData = state.combinedDataForRankings.filter(d => d.team_name !== 'Profilers');
    }

    populateMultiSelectFilter(document.getElementById('rankingsTeamFilterBtn'), document.getElementById('rankingsTeamFilterDropdown'), teamData, 'team_name', 'All Teams');
    populateMultiSelectFilter(document.getElementById('rankingsCompanyFilterBtn'), document.getElementById('rankingsCompanyFilterDropdown'), state.combinedDataForRankings, 'company_name', 'All Companies');

    // --- NEW: Use a default, hardcoded list for contracts ---
    const defaultContracts = [
        'ALL', 'CPM', 'CPML', 'LOO', 'LPOO', 'MCLOO', 'MCOO', 'OO', 'POG', 'TCPM', 'TCPML'
    ];
    
    const allContractsList = defaultContracts.map(contractName => ({ contract_type: contractName }));

    // Populate the filter with the default list
    populateMultiSelectFilter(document.getElementById('rankingsContractFilterBtn'), document.getElementById('rankingsContractFilterDropdown'), allContractsList, 'contract_type', 'All Contracts');
}

function addRankingsEventListeners() {
    const teamFilterContainer = document.getElementById('rankingsTeamFilterContainer');

    document.getElementById('rankingsProfilerModeBtn').addEventListener('click', () => {
        if (state.rankingsMode === 'profiler') return;
        state.rankingsMode = 'profiler';
        document.getElementById('rankingsProfilerModeBtn').classList.add('active');
        document.getElementById('rankingsRecruiterModeBtn').classList.remove('active');
        document.getElementById('rankingsTeamModeBtn').classList.remove('active');
        teamFilterContainer.style.display = 'none';
        populateRankingsFilters();
        renderRankings();
    });

    document.getElementById('rankingsRecruiterModeBtn').addEventListener('click', () => {
        if (state.rankingsMode === 'recruiter') return;
        state.rankingsMode = 'recruiter';
        document.getElementById('rankingsRecruiterModeBtn').classList.add('active');
        document.getElementById('rankingsProfilerModeBtn').classList.remove('active');
        document.getElementById('rankingsTeamModeBtn').classList.remove('active');
        teamFilterContainer.style.display = 'block';
        populateRankingsFilters();
        renderRankings();
    });

    document.getElementById('rankingsTeamModeBtn').addEventListener('click', () => {
        if (state.rankingsMode === 'team') return;
        state.rankingsMode = 'team';
        document.getElementById('rankingsTeamModeBtn').classList.add('active');
        document.getElementById('rankingsProfilerModeBtn').classList.remove('active');
        document.getElementById('rankingsRecruiterModeBtn').classList.remove('active');
        teamFilterContainer.style.display = 'none'; 
        populateRankingsFilters();
        renderRankings();
    });

    document.getElementById('rankingsSettingsBtn').addEventListener('click', openRankingsSettingsModal);
    document.getElementById('rankingWeightsBtn').addEventListener('click', () => openRankingWeightsModal());

    const filters = ['rankingsDateFromFilter', 'rankingsDateToFilter'];
    filters.forEach(id => document.getElementById(id).addEventListener('change', renderRankings));

    const multiSelects = [
        { btn: 'rankingsTeamFilterBtn', dropdown: 'rankingsTeamFilterDropdown' },
        { btn: 'rankingsCompanyFilterBtn', dropdown: 'rankingsCompanyFilterDropdown' },
        { btn: 'rankingsContractFilterBtn', dropdown: 'rankingsContractFilterDropdown' },
    ];

    multiSelects.forEach(sel => {
        const btnEl = document.getElementById(sel.btn);
        const dropdownEl = document.getElementById(sel.dropdown);
        btnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownEl.classList.toggle('hidden');
        });
        dropdownEl.addEventListener('change', renderRankings);
    });

    document.addEventListener('click', (e) => {
        multiSelects.forEach(sel => {
            const btnEl = document.getElementById(sel.btn);
            const dropdownEl = document.getElementById(sel.dropdown);
            if (btnEl && dropdownEl && !btnEl.contains(e.target) && !dropdownEl.contains(e.target)) {
                dropdownEl.classList.add('hidden');
            }
        });
    });

    document.getElementById('rankingsTableHeader').addEventListener('click', (e) => {
        const header = e.target.closest('.sortable');
        if (header) {
            sortRankingsData(header.dataset.sortKey);
        }
    });
}

function getTotalDaysInSelectedPeriod() {
    const fromDateStr = document.getElementById('rankingsDateFromFilter').value;
    const toDateStr = document.getElementById('rankingsDateToFilter').value;

    if (!fromDateStr || !toDateStr) {
        return 0;
    }

    const startDate = new Date(fromDateStr);
    const endDate = new Date(toDateStr);

    startDate.setHours(0, 0, 0, 0); 
    endDate.setHours(0, 0, 0, 0);   

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
}

function calculateActiveDays(dailyData, rules) {
    const aggregatedDailyStats = new Map();

    dailyData.forEach(day => {
        const recruiter = day.recruiter_name;
        if (!recruiter || !day.date) return;

        const dateKey = day.date.toISOString().split('T')[0];
        const recruiterDateKey = `${recruiter}|${dateKey}`;

        if (!aggregatedDailyStats.has(recruiterDateKey)) {
            aggregatedDailyStats.set(recruiterDateKey, {
                date: day.date,
                recruiter_name: recruiter,
                outbound_calls: 0,
                call_duration_seconds: 0,
                outbound_sms: 0
            });
        }

        const stats = aggregatedDailyStats.get(recruiterDateKey);
        stats.outbound_calls += Number(day.outbound_calls) || 0;
        stats.call_duration_seconds += Number(day.call_duration_seconds) || 0;
        stats.outbound_sms += Number(day.outbound_sms) || 0;
    });

    const activeDaysByRecruiter = new Map();
    aggregatedDailyStats.forEach(stats => {
        const dayOfWeek = stats.date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const applicableRules = isWeekend ? rules.weekends : rules.workdays;

        const { calls, duration, sms, conditionsToMeet } = applicableRules;
        const durationInSeconds = duration * 60;

        let conditionsMet = 0;
        if (stats.outbound_calls >= calls) conditionsMet++;
        if (stats.call_duration_seconds >= durationInSeconds) conditionsMet++;
        if (stats.outbound_sms >= sms) conditionsMet++;

        if (conditionsMet >= conditionsToMeet) {
            const recruiterName = stats.recruiter_name;
            activeDaysByRecruiter.set(recruiterName, (activeDaysByRecruiter.get(recruiterName) || 0) + 1);
        }
    });

    return activeDaysByRecruiter;
}

function applyExclusionRules(aggregatedData, settings) {
    const { exclusionRules, exclusionLogic } = settings;

    if (!exclusionRules || exclusionRules.length === 0) {
        return aggregatedData;
    }

    return aggregatedData.filter(entity => {
        const totalLeads = (entity.new_leads_assigned_on_date || 0) + (entity.old_leads_assigned_on_date || 0);

        const ruleResults = exclusionRules.map(rule => {
            const entityValue = rule.metric === 'total_leads' ? totalLeads : (entity[rule.metric] || 0);
            const ruleValue = rule.value;
            switch (rule.operator) {
                case '>=': return entityValue >= ruleValue;
                case '<=': return entityValue <= ruleValue;
                case '=':  return entityValue == ruleValue;
                default: return false;
            }
        });

        if (exclusionLogic === 'AND') {
            return !ruleResults.every(result => result === true);
        } else {
            return !ruleResults.some(result => result === true);
        }
    });
}

export function calculateRankings(allFilteredData, mode, forceCompanies = null, forceContracts = null) {
    const effectiveMode = (mode === 'profiler') ? 'recruiter' : mode;
    
    const settings = (mode === 'profiler') ? state.rankingSettingsProfiler : state.rankingSettings;
    const { 
        ttePValue, tteLeadType, tteSource, tteSourceProfiler,
        leadsReachedLeadType, leadsReachedSource, leadsReachedSourceProfiler,
        drugTestType, callSmsDataSource, medianCallDurationSource
    } = settings;

    const weights = mode === 'profiler' ? state.rankingWeightsProfiler : state.rankingWeights;
    const activeDaysMap = calculateActiveDays(allFilteredData, settings.activeDayRules);
    
    const aggregatedMap = new Map();
    const allEntities = new Map();

    const companySuffixMap = { 'EB Infinity': 'eb', 'SMJ': 'smj', 'AmongUs': 'amongus', 'ALL': 'all' };
    const selectedCompanies = forceCompanies || getSelectedValues(document.getElementById('rankingsCompanyFilterDropdown'));
    const selectedContracts = forceContracts || getSelectedValues(document.getElementById('rankingsContractFilterDropdown'));

    allFilteredData.forEach(row => {
        const name = effectiveMode === 'recruiter' ? row.recruiter_name : row.team_name;
        if (name && !allEntities.has(name)) {
            allEntities.set(name, row.team_name);
        }
    });

    allEntities.forEach((team, name) => {
        aggregatedMap.set(name, {
            name: name,
            team: team,
            recruiters: new Set(),
            outbound_calls: 0, unique_calls: 0, call_duration_seconds: 0,
            outbound_sms: 0, unique_sms: 0,
            original_outbound_calls: 0, original_call_duration_seconds: 0,
            original_unique_calls: 0, original_unique_sms: 0,
            original_outbound_sms: 0, original_new_leads_assigned_on_date: 0,
            original_old_leads_assigned_on_date: 0, total_drug_tests: 0,
            onboarded: 0, mvr: 0, psp: 0, cdl: 0,
            active_days: (effectiveMode === 'recruiter' || effectiveMode === 'profiler') ? (activeDaysMap.get(name) || 0) : 0,
            tte_values: [], daily_leads_reached: [], num_recruiters: 0,
            new_leads_assigned_on_date: 0, old_leads_assigned_on_date: 0,
            hot_leads_assigned: 0,
            fresh_leads_assigned_on_date: 0,
            profiles_profiled: 0, profiles_completed: 0,
            total_past_due: 0, total_contacted: 0, total_not_due_yet: 0,
            profiler_note_lenght_all: 0,
            profiler_note_day_count: 0,
            median_time_to_profile_values: [],
            median_call_duration_values: [],
        });
    });

    allFilteredData.forEach(row => {
        const key = effectiveMode === 'recruiter' ? row.recruiter_name : row.team_name;
        if (!aggregatedMap.has(key)) return;
    
        const entry = aggregatedMap.get(key);
        if (row.recruiter_name) entry.recruiters.add(row.recruiter_name);
    
        if (row.hasOwnProperty('median_time_to_profile')) {
            const timeValue = parseTTEValue(row.median_time_to_profile);
            if (timeValue !== null) {
                entry.median_time_to_profile_values.push(timeValue);
            }
        }

        const durationKey = medianCallDurationSource === 'assigned_on_date' ? 'median_call_duration' : 'median_call_duration_all';
        if (row[durationKey] !== null && row[durationKey] !== undefined) {
            entry.median_call_duration_values.push(row[durationKey]);
        }

        if (row.hasOwnProperty('past_due_all_all')) {
            ['past_due', 'contacted', 'not_due_yet'].forEach(status => {
                selectedContracts.forEach(contract => {
                    selectedCompanies.forEach(company => {
                        const companySuffix = companySuffixMap[company];
                        if (companySuffix) {
                            const contractKey = contract === 'ALL' ? 'all' : contract;
                            const dataKey = `${status}_${contractKey}_${companySuffix}`;
                            entry[`total_${status}`] += Number(row[dataKey]) || 0;
                        }
                    });
                });
            });
        } else if (row.hasOwnProperty('total_drug_tests')) {
            const typeMatch = !drugTestType || drugTestType === 'All Types' || row.drug_test_type === drugTestType;
            if (typeMatch) entry.total_drug_tests += Number(row.total_drug_tests) || 0;
        } else if (row.hasOwnProperty('mvr_collected_all')) {
            entry.mvr += Number(row.mvr_collected_all) || 0;
            entry.psp += Number(row.psp_collected_all) || 0;
            entry.cdl += Number(row.cdl_collected_all) || 0;
        } else if (row.hasOwnProperty('profiler_note_lenght_all')) {
            let noteLength = 0;
            if (selectedCompanies.length === 1 && selectedCompanies[0] !== 'ALL') {
                const companySuffix = companySuffixMap[selectedCompanies[0]];
                if (companySuffix) {
                    const noteLengthKey = `profiler_note_lenght_${companySuffix}`;
                    noteLength = Number(row[noteLengthKey]) || 0;
                }
            } else {
                noteLength = Number(row.profiler_note_lenght_all) || 0;
            }
            entry.profiler_note_lenght_all += noteLength;
            if (noteLength > 0) {
                entry.profiler_note_day_count++;
            }
        } else if (row.hasOwnProperty('outbound_calls')) {
            if (callSmsDataSource === 'assigned_on_date') {
                entry.outbound_calls += Number(row.outbound_calls_assigned_on_date) || 0;
                entry.unique_calls += Number(row.unique_calls_assigned_on_date) || 0;
                entry.call_duration_seconds += Number(row.call_duration_assigned_on_date) || 0;
                entry.outbound_sms += Number(row.outbound_sms_assigned_on_date) || 0;
                entry.unique_sms += Number(row.unique_sms_assigned_on_date) || 0;
            } else {
                entry.outbound_calls += Number(row.outbound_calls) || 0;
                entry.unique_calls += Number(row.unique_calls) || 0;
                entry.call_duration_seconds += Number(row.call_duration_seconds) || 0;
                entry.outbound_sms += Number(row.outbound_sms) || 0;
                entry.unique_sms += Number(row.unique_sms) || 0;
            }
    
            entry.original_outbound_calls += Number(row.outbound_calls) || 0;
            entry.original_call_duration_seconds += Number(row.call_duration_seconds) || 0;
            entry.original_outbound_sms += Number(row.outbound_sms) || 0;
            entry.original_unique_calls += Number(row.unique_calls) || 0;
            entry.original_unique_sms += Number(row.unique_sms) || 0;
            
            entry.new_leads_assigned_on_date += Number(row.new_leads_assigned_on_date) || 0;
            entry.old_leads_assigned_on_date += Number(row.old_leads_assigned_on_date) || 0;
            entry.hot_leads_assigned += (Number(row.new_hot_leads_assigned_on_date) || 0) + (Number(row.old_hot_leads_assigned_on_date) || 0);
            entry.fresh_leads_assigned_on_date += Number(row.fresh_leads_assigned_on_date) || 0;
            
            entry.original_new_leads_assigned_on_date += Number(row.new_leads_assigned_on_date) || 0;
            entry.original_old_leads_assigned_on_date += Number(row.old_leads_assigned_on_date) || 0;
    
            const pValueTTE = ttePValue.substring(1);
            let tteKey;
            const effectiveTTESource = mode === 'profiler' ? tteSourceProfiler : tteSource;
            if (effectiveTTESource === 'hot') {
                tteKey = `p_${pValueTTE}_engage`;
            } else if (effectiveTTESource === 'fresh') {
                tteKey = `p_${pValueTTE}_engage_fresh_leads`;
            } else {
                tteKey = `p_${pValueTTE}_engage_${tteLeadType}`;
            }
            const tteValue = parseTTEValue(row[tteKey]);
            if (tteValue !== null) entry.tte_values.push(tteValue);

            let dailyReached = null;
            let encounteredInfinity = false;

            for (let i = 100; i >= 10; i -= 10) {
                let leadsReachedKey;
                const effectiveLeadsReachedSource = mode === 'profiler' ? leadsReachedSourceProfiler : leadsReachedSource;
                if (effectiveLeadsReachedSource === 'hot') {
                    leadsReachedKey = `p_${i}_engage`;
                } else if (effectiveLeadsReachedSource === 'fresh') {
                    leadsReachedKey = `p_${i}_engage_fresh_leads`;
                } else {
                    leadsReachedKey = `p_${i}_engage_${leadsReachedLeadType}`;
                }
                const pValue = parseTTEValue(row[leadsReachedKey]);

                if (pValue !== null) {
                    if (isFinite(pValue)) {
                        dailyReached = i;
                        break;
                    } else if (!isFinite(pValue) && pValue === Infinity) {
                        encounteredInfinity = true;
                    }
                }
            }

            if (dailyReached === null && encounteredInfinity) {
                dailyReached = 0;
            }

            if (dailyReached !== null) {
                entry.daily_leads_reached.push(dailyReached);
            }

        } else {
            entry.onboarded++;
        }

        if (row.hasOwnProperty('profiles_profiled')) {
            entry.profiles_profiled += Number(row.profiles_profiled) || 0;
        }
        if (row.hasOwnProperty('profiles_completed')) {
            entry.profiles_completed += Number(row.profiles_completed) || 0;
        }
    });

    let aggregatedData = Array.from(aggregatedMap.values());

    if (mode === 'team') {
        aggregatedData.forEach(teamEntry => {
            let teamActiveDays = 0;
            teamEntry.recruiters.forEach(recruiterName => {
                teamActiveDays += activeDaysMap.get(recruiterName) || 0;
            });
            teamEntry.active_days = teamEntry.recruiters.size > 0 ? teamActiveDays / teamEntry.recruiters.size : 0;
            teamEntry.num_recruiters = teamEntry.recruiters.size;
        });
    }

    let rankedData = applyExclusionRules(aggregatedData, settings);

    rankedData.forEach(entry => {
        const relevantTTEValues = entry.tte_values.filter(v => v !== null);
        const finiteOnlyTTEValues = relevantTTEValues.filter(v => isFinite(v));
        const infiniteOnlyTTEValuesCount = relevantTTEValues.filter(v => !isFinite(v)).length;
        const valuesForMedianTTE = [...finiteOnlyTTEValues];
        for (let i = 0; i < infiniteOnlyTTEValuesCount; i++) {
            valuesForMedianTTE.push(Infinity);
        }

        if (valuesForMedianTTE.length > 0) {
            const sorted = [...valuesForMedianTTE].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);

            if (sorted.length % 2 === 0) {
                if (isFinite(sorted[mid - 1]) && isFinite(sorted[mid])) {
                    entry.tte_value = (sorted[mid - 1] + sorted[mid]) / 2;
                } else {
                    entry.tte_value = Infinity;
                }
            } else {
                entry.tte_value = sorted[mid];
            }
        } else {
            entry.tte_value = null;
        }
            
           const validDailyLeadsReached = entry.daily_leads_reached.filter(val => val !== null);
           if (validDailyLeadsReached.length > 0) {
               const sorted = [...validDailyLeadsReached].sort((a, b) => a - b);
               const mid = Math.floor(sorted.length / 2);
               entry.leads_reached = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
           } else {
               entry.leads_reached = 0;
           }

           const relevantTimeToProfileValues = entry.median_time_to_profile_values.filter(v => v !== null);
            if (relevantTimeToProfileValues.length > 0) {
                const sorted = [...relevantTimeToProfileValues].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                entry.median_time_to_profile = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
            } else {
                entry.median_time_to_profile = null;
            }
            
            const relevantCallDurationValues = entry.median_call_duration_values.filter(v => v !== null);
            if (relevantCallDurationValues.length > 0) {
                const sorted = [...relevantCallDurationValues].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                entry.median_call_duration = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
            } else {
                entry.median_call_duration = null;
            }

        const totalLeads = entry.new_leads_assigned_on_date + entry.old_leads_assigned_on_date;
        if (totalLeads > 0) {
            const perLeadSettings = settings.perLeadMetrics;
            if (perLeadSettings.outbound_calls) entry.outbound_calls /= totalLeads;
            if (perLeadSettings.unique_calls) entry.unique_calls /= totalLeads;
            if (perLeadSettings.call_duration_seconds) entry.call_duration_seconds /= totalLeads;
            if (perLeadSettings.outbound_sms) entry.outbound_sms /= totalLeads;
            if (perLeadSettings.unique_sms) entry.unique_sms /= totalLeads;
            if (perLeadSettings.profiles_profiled) entry.profiles_profiled /= totalLeads;
            if (perLeadSettings.profiles_completed) entry.profiles_completed /= totalLeads;
            if (perLeadSettings.total_drug_tests) entry.total_drug_tests /= totalLeads;
            if (perLeadSettings.onboarded) entry.onboarded /= totalLeads;
        }

        const totalPastDueLeads = entry.total_past_due + entry.total_contacted + entry.total_not_due_yet;
        entry.past_due_ratio = totalPastDueLeads > 0 ? (entry.total_past_due / totalPastDueLeads) * 100 : 0;
    
        if (entry.profiler_note_day_count > 0) {
            entry.profiler_note_lenght_all = entry.profiler_note_lenght_all / entry.profiler_note_day_count;
        }
    });

    const allOutboundCalls = rankedData.map(d => d.outbound_calls).sort((a, b) => a - b);
    const allUniqueCalls = rankedData.map(d => d.unique_calls).sort((a, b) => a - b);
    const allCallDurations = rankedData.map(d => d.call_duration_seconds).sort((a, b) => a - b);
    const allOutboundSms = rankedData.map(d => d.outbound_sms).sort((a, b) => a - b);
    const allUniqueSms = rankedData.map(d => d.unique_sms).sort((a, b) => a - b);
    const allDrugTestValues = rankedData.map(d => d.total_drug_tests);
    const maxDrugTests = Math.max(0, ...allDrugTestValues);
    const allActiveDays = rankedData.map(d => d.active_days);
    const maxActiveDays = Math.max(0, ...allActiveDays);
    const allTTEValues = rankedData.map(d => d.tte_value).filter(v => v !== null).sort((a, b) => a - b);
    const allLeadsReached = rankedData.map(d => d.leads_reached).sort((a, b) => a - b);
    const allOnboarded = rankedData.map(d => d.onboarded).sort((a, b) => a - b);
    const maxOnboarded = Math.max(0, ...allOnboarded);
    const allMvr = rankedData.map(d => d.mvr).sort((a, b) => a - b);
    const allPsp = rankedData.map(d => d.psp).sort((a, b) => a - b);
    const allCdl = rankedData.map(d => d.cdl).sort((a, b) => a - b);
    const allPastDueRatios = rankedData.map(d => d.past_due_ratio).sort((a, b) => a - b);
    const allProfilerNoteLenghts = rankedData.map(d => d.profiler_note_lenght_all).sort((a, b) => a - b);
    const allMedianTimeToProfile = rankedData.map(d => d.median_time_to_profile).filter(v => v !== null).sort((a, b) => a - b);
    const allMedianCallDurations = rankedData.map(d => d.median_call_duration).filter(v => v !== null).sort((a, b) => a - b);

    rankedData.forEach(entry => {
        entry.outbound_calls_percentile = getPercentile(entry.outbound_calls, allOutboundCalls);
        entry.unique_calls_percentile = getPercentile(entry.unique_calls, allUniqueCalls);
        entry.call_duration_seconds_percentile = getPercentile(entry.call_duration_seconds, allCallDurations);
        entry.outbound_sms_percentile = getPercentile(entry.outbound_sms, allOutboundSms);
        entry.unique_sms_percentile = getPercentile(entry.unique_sms, allUniqueSms);
        entry.total_drug_tests_percentile = maxDrugTests > 0 ? (entry.total_drug_tests / maxDrugTests) * 100 : 0;
        entry.onboarded_percentile = maxOnboarded > 0 ? (entry.onboarded / maxOnboarded) * 100 : 0;
        entry.active_days_percentile = maxActiveDays > 0 ? (entry.active_days / maxActiveDays) * 100 : 0;
        entry.tte_percentile = getPercentile(entry.tte_value, allTTEValues, true);
        entry.leads_reached_percentile = getPercentile(entry.leads_reached, allLeadsReached);
        entry.profiles_profiled_percentile = getPercentile(entry.profiles_profiled, rankedData.map(d => d.profiles_profiled).sort((a, b) => a - b));
        entry.profiles_completed_percentile = getPercentile(entry.profiles_completed, rankedData.map(d => d.profiles_completed).sort((a, b) => a - b));
        entry.mvr_percentile = getPercentile(entry.mvr, allMvr);
        entry.psp_percentile = getPercentile(entry.psp, allPsp);
        entry.cdl_percentile = getPercentile(entry.cdl, allCdl);
        entry.past_due_ratio_percentile = getPercentile(entry.past_due_ratio, allPastDueRatios, true);
        entry.profiler_note_lenght_percentile = getPercentile(entry.profiler_note_lenght_all, allProfilerNoteLenghts);
        entry.median_time_to_profile_percentile = getPercentile(entry.median_time_to_profile, allMedianTimeToProfile, true);
        entry.median_call_duration_percentile = getPercentile(entry.median_call_duration, allMedianCallDurations); 

        const w = weights;
        const callsWeights = w.calls_score || {};
        const smsWeights = w.sms_score || {};
        const effortWeights = w.effort_score || {};
        const arrivalsWeights = w.arrivals_score || {};
        const finalWeights = w.final_score || {};
        const complianceWeights = w.compliance_score || {};
        const profilesWeights = w.profiles_score || {};
        const documentsWeights = w.documents_score || {};

        entry.calls_score = (entry.outbound_calls_percentile * (callsWeights.outbound_calls_percentile || 0) +
                             entry.unique_calls_percentile * (callsWeights.unique_calls_percentile || 0) +
                             entry.call_duration_seconds_percentile * (callsWeights.call_duration_seconds_percentile || 0)) / 100;

        entry.sms_score = (entry.outbound_sms_percentile * (smsWeights.outbound_sms_percentile || 0) +
                           entry.unique_sms_percentile * (smsWeights.unique_sms_percentile || 0)) / 100;
                           
        entry.effort_score = (entry.calls_score * (effortWeights.calls_score || 0) +
                              entry.sms_score * (effortWeights.sms_score || 0) +
                              entry.profiler_note_lenght_percentile * (effortWeights.profiler_note_lenght_percentile || 0) +
                              entry.active_days_percentile * (effortWeights.active_days_percentile || 0) +
                              entry.median_time_to_profile_percentile * (effortWeights.median_time_to_profile_percentile || 0)) / 100;
        
        entry.documents_score = (entry.mvr_percentile * (documentsWeights.mvr_percentile || 0) +
                                     entry.psp_percentile * (documentsWeights.psp_percentile || 0) +
                                     entry.cdl_percentile * (documentsWeights.cdl_percentile || 0)) / 100;

        if (mode === 'profiler') {
            entry.profiles_score = (entry.profiles_profiled_percentile * (profilesWeights.profiles_profiled_percentile || 0) +
                                    entry.profiles_completed_percentile * (profilesWeights.profiles_completed_percentile || 0)) / 100;

            entry.compliance_score = (entry.tte_percentile * (complianceWeights.tte_percentile || 0) +
                                      entry.leads_reached_percentile * (complianceWeights.leads_reached_percentile || 0) +
                                      entry.profiles_score * (complianceWeights.profiles_score || 0) +
                                      entry.documents_score * (complianceWeights.documents_score || 0) +
                                      entry.median_call_duration_percentile * (complianceWeights.median_call_duration_percentile || 0)) / 100;
        } else { // Recruiter or Team mode
            entry.compliance_score = (entry.tte_percentile * (complianceWeights.tte_percentile || 0) +
                                      entry.leads_reached_percentile * (complianceWeights.leads_reached_percentile || 0) +
                                      entry.documents_score * (complianceWeights.documents_score || 0) +
                                      entry.past_due_ratio_percentile * (complianceWeights.past_due_ratio_percentile || 0) +
                                      entry.profiles_completed_percentile * (complianceWeights.profiles_completed_percentile || 0) +
                                      entry.median_call_duration_percentile * (complianceWeights.median_call_duration_percentile || 0)) / 100;
            entry.profiles_score = 0;
        }

        entry.arrivals_score = (entry.total_drug_tests_percentile * (arrivalsWeights.total_drug_tests_percentile || 0) +
                                entry.onboarded_percentile * (arrivalsWeights.onboarded_percentile || 0)) / 100;

        entry.final_score = (entry.effort_score * (finalWeights.effort_score || 0) +
                             entry.compliance_score * (finalWeights.compliance_score || 0) +
                             entry.arrivals_score * (finalWeights.arrivals_score || 0)) / 100;
    });

    rankedData.sort((a, b) => b.final_score - a.final_score);
    rankedData.forEach((entry, index) => {
        entry.rank = index + 1;
    });

    return rankedData;
}

function sortRankingsData(key) {
    const { rankingsSortConfig } = state;
    if (key) {
        if (rankingsSortConfig.key === key) {
            rankingsSortConfig.direction = rankingsSortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            rankingsSortConfig.key = key;
            rankingsSortConfig.direction = 'asc';
        }
    }
    renderRankings();
}

function renderRankings() {
    const selectedTeams = getSelectedValues(document.getElementById('rankingsTeamFilterDropdown'));
    const selectedCompanies = getSelectedValues(document.getElementById('rankingsCompanyFilterDropdown'));
    const selectedContracts = getSelectedValues(document.getElementById('rankingsContractFilterDropdown'));
    const fromDateStr = document.getElementById('rankingsDateFromFilter').value;
    const toDateStr = document.getElementById('rankingsDateToFilter').value;
    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(new Date(toDateStr).getTime() + (24 * 60 * 60 * 1000 - 1)) : null;

    const matchesDateAndTeam = (row) => {
        const rowDate = row.date ? new Date(row.date) : null;
        const dateMatch = (!fromDate || !toDate) || (rowDate && (!fromDate || rowDate >= fromDate) && (!toDate || rowDate <= toDate));
        const teamName = row.team_name || row.team; 

        if (state.rankingsMode === 'profiler') {
            return dateMatch && teamName === 'Profilers';
        }

        const teamMatch = selectedTeams.length === 0 || selectedTeams.includes(teamName);
        return dateMatch && teamMatch;
    };

    const standardFilter = (row) => {
        if (!matchesDateAndTeam(row)) return false;
        const companyMatch = selectedCompanies.includes(row.company_name);
        const contractMatch = selectedContracts.includes(row.contract_type);
        return companyMatch && contractMatch;
    };

    if (selectedCompanies.length === 0 || selectedContracts.length === 0) {
        state.rankedData = [];
    } else {
        const filteredLeadRiskData = state.allData.filter(standardFilter);
        const filteredMvrPspCdlData = state.mvrPspCdlData.filter(standardFilter);
        const filteredPastDueData = state.recruiterData.filter(row => {
            return matchesDateAndTeam(row);
        });
        const filteredProfilerData = state.profilerData.filter(row => {
            return matchesDateAndTeam(row);
        });

        const arrivalsFilter = (row) => {
            if (!matchesDateAndTeam(row)) return false;
            const companyMatch = selectedCompanies.includes('ALL') || selectedCompanies.includes(row.company_name);
            const contractMatch = selectedContracts.includes('ALL') || selectedContracts.includes(row.contract_type);
            return companyMatch && contractMatch;
        };

        const filteredArrivalsData = state.arrivalsData.filter(arrivalsFilter);
        const filteredDrugTestsData = state.drugTestsData.filter(arrivalsFilter);

        const rawData = [
            ...filteredLeadRiskData,
            ...filteredMvrPspCdlData,
            ...filteredPastDueData,
            ...filteredProfilerData,
            ...filteredArrivalsData,
            ...filteredDrugTestsData
        ];

        state.rankedData = calculateRankings(rawData, state.rankingsMode);
    }
    
    const { key, direction } = state.rankingsSortConfig;
    if (key) {
        const dir = direction === 'asc' ? 1 : -1;
        state.rankedData.sort((a, b) => {
            const valA = a[key];
            const valB = b[key];
            if (valA == null && valB == null) return 0;
            if (valA == null) return 1 * dir;
            if (valB == null) return -1 * dir;
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * dir;
            }
            return String(valA).localeCompare(String(valB)) * dir;
        });
    }

    renderRankingsHeaders();
    renderRankingsTable(state.rankedData);
    renderRankingsFooter(state.rankedData);
}

function renderRankingsHeaders() {
    const header = document.getElementById('rankingsTableHeader');
    if (!header) return;

    header.closest('table').classList.add('rankings-table');

    const mode = state.rankingsMode;

    const headerConfig = {
        base: [
            { key: 'rank', label: 'RANK', type: 'number' },
            { key: 'name', label: mode === 'team' ? 'TEAM' : 'RECRUITER', type: 'string' },
            { key: 'team', label: 'TEAM', type: 'string', hidden: mode !== 'recruiter' },
            { key: 'num_recruiters', label: '# RECS', type: 'number', hidden: mode !== 'team' },
            { key: 'new_leads_assigned_on_date', label: 'NEW', type: 'number' },
            { key: 'old_leads_assigned_on_date', label: 'OLD', type: 'number' },
            { key: mode === 'profiler' ? 'fresh_leads_assigned_on_date' : 'hot_leads_assigned', label: mode === 'profiler' ? 'FRESH' : 'HOT', type: 'number' },
            { key: 'final_score', label: 'FINAL SCORE', type: 'number', colorClass: 'final-score-header' },
        ],
        mainGroups: [
            {
                label: 'EFFORT',
                cssClass: 'th-effort-group',
                scoreKey: 'effort_score',
                subGroups: [
                    { label: 'CALLS', scoreKey: 'calls_score', columns: ['outbound_calls', 'unique_calls', 'call_duration_seconds'] },
                    { label: 'SMS', scoreKey: 'sms_score', columns: ['outbound_sms', 'unique_sms'] },
                    { label: 'NOTES', columns: ['profiler_note_lenght_all'], hidden: mode !== 'profiler' },
                    { label: 'ACTIVE DAYS', columns: ['active_days'] },
                    { label: 'TIME TO PROFILE', columns: ['median_time_to_profile'], hidden: mode !== 'profiler' }
                ]
            },
            {
                label: 'COMPLIANCE',
                cssClass: 'th-compliance-group',
                scoreKey: 'compliance_score',
                subGroups: [
                    { label: 'TIME TO ENGAGE', columns: ['tte_value'] },
                    { label: 'LEADS REACHED', columns: ['leads_reached'] },
                    { label: 'MEDIAN CALL DURATION', columns: ['median_call_duration'] },
                    { label: 'PROFILE COMPLETION', columns: ['profiles_completed'], hidden: mode === 'profiler' },
                    { label: 'PROFILE COMPLETION', scoreKey: 'profiles_score', columns: ['profiles_profiled', 'profiles_completed'], hidden: mode !== 'profiler' },
                    { label: 'DOCUMENTS', scoreKey: 'documents_score', columns: ['mvr', 'psp', 'cdl'] },
                    { label: 'PAST DUE', columns: ['past_due_ratio'], hidden: mode === 'profiler' }
                ]
            },
            {
                label: 'ARRIVALS',
                cssClass: 'th-arrivals-group',
                scoreKey: 'arrivals_score',
                subGroups: [
                    { label: 'DRUG TESTS', columns: ['total_drug_tests'] },
                    { label: 'ONBOARDED', columns: ['onboarded'] },
                ]
            }
        ],
        columnDetails: {
            effort_score: { label: 'Effort Score', type: 'number' },
            compliance_score: { label: 'Compliance Score', type: 'number' },
            arrivals_score: { label: 'Arrivals Score', type: 'number' },
            calls_score: { label: 'Calls Score', type: 'number' },
            sms_score: { label: 'SMS Score', type: 'number' },
            outbound_calls: { label: 'Total', type: 'number' },
            unique_calls: { label: 'Unq', type: 'number' },
            call_duration_seconds: { label: 'Duration', type: 'number' },
            outbound_sms: { label: 'Total', type: 'number' },
            unique_sms: { label: 'Unq', type: 'number' },
            active_days: { label: 'Days', type: 'number' },
            leads_reached: { label: 'Reached', type: 'number' },
            tte_value: { label: 'TTE', type: 'number' },
            median_call_duration: { label: 'Duration', type: 'number' },
            past_due_ratio: { label: 'Past Due %', type: 'number' },
            total_drug_tests: { label: 'DT', type: 'number' },
            onboarded: { label: 'Onboarded', type: 'number' },
            profiles_score: { label: 'Profiles Score', type: 'number' },
            profiles_profiled: { label: 'Profiled', type: 'number' },
            profiles_completed: { label: 'Completed', type: 'number' },
            documents_score: { label: 'Docs Score', type: 'number' },
            mvr: { label: 'MVR', type: 'number' },
            psp: { label: 'PSP', type: 'number' },
            cdl: { label: 'CDL', type: 'number' },
            profiler_note_lenght_all: { label: 'Note Length', type: 'number' },
            median_time_to_profile: { label: 'Time', type: 'number' },
        }
    };

    const settings = mode === 'profiler' ? state.rankingSettingsProfiler : state.rankingSettings;
    const perLeadSettings = settings.perLeadMetrics;
    const dynamicLabels = {
        outbound_calls: { label: perLeadSettings.outbound_calls ? 'Calls/Ld' : 'Total' },
        unique_calls: { label: perLeadSettings.unique_calls ? 'Unq/Ld' : 'Unq' },
        call_duration_seconds: { label: perLeadSettings.call_duration_seconds ? 'Dur/Ld' : 'Duration' },
        outbound_sms: { label: perLeadSettings.outbound_sms ? 'SMS/Ld' : 'Total' },
        unique_sms: { label: perLeadSettings.unique_sms ? 'Unq/Ld' : 'Unq' },
        total_drug_tests: { label: perLeadSettings.total_drug_tests ? 'DT/Ld' : 'DT' },
        onboarded: { label: perLeadSettings.onboarded ? 'Onb/Ld' : 'Onboarded' },
        profiles_profiled: { label: perLeadSettings.profiles_profiled ? 'Prof/Ld' : 'Profiled' },
        profiles_completed: { label: perLeadSettings.profiles_completed ? 'Comp/Ld' : 'Completed' },
    };

    for (const key in dynamicLabels) {
        if (headerConfig.columnDetails[key]) {
            headerConfig.columnDetails[key].label = dynamicLabels[key].label;
        }
    }

    const buildHeaderCell = (key, conf, rowspan, colspan, extraClass = '') => {
        const { key: sortKey, direction: sortDir } = state.rankingsSortConfig;
        const isSorted = sortKey === key;
        const sortClasses = isSorted ? `sorted-${sortDir}` : '';
        const alignClass = conf.type === 'number' ? 'text-center' : 'text-left';

        return `<th scope="col" class="table-header-cell sortable ${sortClasses} ${extraClass} ${conf.colorClass || ''} py-1 px-1.5 ${alignClass} cursor-pointer" rowspan="${rowspan}" colspan="${colspan}" data-sort-key="${key}">
            <div class="flex items-center ${alignClass === 'text-center' ? 'justify-center' : ''}">
                <span>${conf.label}</span>
                <span class="sort-icon sort-icon-up ml-1"><i class="fas fa-arrow-up"></i></span>
                <span class="sort-icon sort-icon-down ml-1"><i class="fas fa-arrow-down"></i></span>
            </div>
        </th>`;
    };

    let row1Html = '';
    let row2Html = '';
    let row3Html = '';

    headerConfig.base.filter(c => !c.hidden).forEach(conf => {
        row1Html += buildHeaderCell(conf.key, conf, 3, 1, 'th-base th-rowspan-3');
    });

    headerConfig.mainGroups.forEach((mainGroup) => {
        if (mainGroup.hidden) return;
        let mainGroupColspan = 1; 
        mainGroup.subGroups.filter(sg => !sg.hidden).forEach(subGroup => {
            mainGroupColspan += subGroup.columns.length * 2 + (subGroup.scoreKey ? 1 : 0);
        });
        row1Html += `<th colspan="${mainGroupColspan}" class="th-main-group text-center py-1 border-l-main ${mainGroup.cssClass}">${mainGroup.label}</th>`;

        let scoreHeaderClass = `border-l-main score-summary-cell ${mainGroup.scoreKey.replace('_', '-')}-header`;
        row2Html += buildHeaderCell(mainGroup.scoreKey, headerConfig.columnDetails[mainGroup.scoreKey], 2, 1, scoreHeaderClass);

        mainGroup.subGroups.filter(sg => !sg.hidden).forEach((subGroup) => {
            let subGroupColspan = subGroup.columns.length * 2 + (subGroup.scoreKey ? 1 : 0);
            row2Html += `<th colspan="${subGroupColspan}" class="th-sub-group text-center py-1 border-l-sub-group">${subGroup.label}</th>`;

            if (subGroup.scoreKey) {
                row3Html += buildHeaderCell(subGroup.scoreKey, headerConfig.columnDetails[subGroup.scoreKey], 1, 1, 'border-l-sub-group score-summary-cell');
            }

            subGroup.columns.forEach((colKey, colIndex) => {
                const colConf = headerConfig.columnDetails[colKey];
                let valueCellExtraClass = 'th-col-label';
                if (colIndex === 0 && !subGroup.scoreKey) {
                     valueCellExtraClass += ' border-l-sub-group';
                }

                row3Html += buildHeaderCell(colKey, colConf, 1, 1, valueCellExtraClass);
                row3Html += buildHeaderCell(`${colKey}_percentile`, {label: '%', type: 'number'}, 1, 1, 'th-col-label percentile-cell');
            });
        });
    });

    header.innerHTML = `<tr>${row1Html}</tr><tr>${row2Html}</tr><tr>${row3Html}</tr>`;
}

function renderRankingsTable(data) {
    const tableBody = document.getElementById('rankingsTableBody');
    if (!tableBody) return;

    const mode = state.rankingsMode;

    const columnsInOrder = [
        'rank', 'name',
        ...(mode === 'recruiter' ? ['team'] : []),
        ...(mode === 'team' ? ['num_recruiters'] : []),
        'new_leads_assigned_on_date',
        'old_leads_assigned_on_date',
        mode === 'profiler' ? 'fresh_leads_assigned_on_date' : 'hot_leads_assigned',
        'final_score',
        'effort_score',
        'calls_score',
        'outbound_calls', 'outbound_calls_percentile',
        'unique_calls', 'unique_calls_percentile',
        'call_duration_seconds', 'call_duration_seconds_percentile',
        'sms_score',
        'outbound_sms', 'outbound_sms_percentile',
        'unique_sms', 'unique_sms_percentile',
        ...(mode === 'profiler' ? ['profiler_note_lenght_all', 'profiler_note_lenght_percentile'] : []),
        'active_days', 'active_days_percentile',
        ...(mode === 'profiler' ? ['median_time_to_profile', 'median_time_to_profile_percentile'] : []),
        'compliance_score',
        'tte_value', 'tte_percentile',
        'leads_reached', 'leads_reached_percentile',
        'median_call_duration', 'median_call_duration_percentile',
        ...(mode !== 'profiler' ? ['profiles_completed', 'profiles_completed_percentile'] : []),
        ...(mode === 'profiler' ? ['profiles_score', 'profiles_profiled', 'profiles_profiled_percentile', 'profiles_completed', 'profiles_completed_percentile'] : []),
        'documents_score',
        'mvr', 'mvr_percentile',
        'psp', 'psp_percentile',
        'cdl', 'cdl_percentile',
        ...(mode !== 'profiler' ? ['past_due_ratio', 'past_due_ratio_percentile'] : []),
        'arrivals_score',
        'total_drug_tests', 'total_drug_tests_percentile',
        'onboarded', 'onboarded_percentile',
    ];

    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${columnsInOrder.length}" class="text-center p-8 text-gray-500">No matching records found.</td></tr>`;
        return;
    }
    
    const settings = mode === 'profiler' ? state.rankingSettingsProfiler : state.rankingSettings;
    const perLeadSettings = settings.perLeadMetrics;

    tableBody.innerHTML = data.map((row, index) => {
        const cells = columnsInOrder.map(key => {
            let value = row[key];
            let cellClass = 'py-1.5 px-1.5 whitespace-nowrap';

            let isNumber = typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)) && isFinite(value));
            const isPerLeadMetric = perLeadSettings[key];

            if ((key === 'tte_value' || key === 'median_call_duration') && !isFinite(value)) {
                 value = '∞';
                 isNumber = false;
            }

            if (isNumber) {
                cellClass += ' text-center font-mono';
                if (key.includes('percentile') || key.includes('_score') || key === 'leads_reached' || key === 'past_due_ratio') {
                    value = formatNumber(value, 1) + '%';
                } else if (key === 'tte_value' || key === 'median_time_to_profile' || key === 'median_call_duration' || (isPerLeadMetric && key === 'call_duration_seconds')) {
                    value = formatDuration(value);
                } else if (isPerLeadMetric) {
                     value = formatNumber(value, 2);
                } else {
                    value = formatNumber(value, 0);
                }
            } else if (value === null || value === undefined) {
                value = 'N/A';
                if (['tte_value', 'past_due_ratio', 'median_time_to_profile', 'median_call_duration'].includes(key)) cellClass += ' text-center font-mono';
            }

            if (key === 'name') cellClass += ' text-sky-400 font-semibold td-name';
            if (key === 'team') cellClass += ' text-gray-400 td-team';
            if (key === 'rank') cellClass += ' font-bold text-lg td-rank';
            if (key === 'final_score') cellClass += ' final-score-cell td-final-score';
            else if (key === 'effort_score') cellClass += ' effort-score-cell';
            else if (key === 'compliance_score') cellClass += ' compliance-score-cell';
            else if (key === 'arrivals_score') cellClass += ' arrivals-score-cell';
            else if (key.includes('_score')) cellClass += ' score-summary-cell';

            if(key.includes('percentile')) cellClass += ' percentile-cell';
            if (key === 'tte_value') cellClass += ' td-tte';
            if (key === 'past_due_ratio') cellClass += ' td-past-due';

            if (key === 'effort_score' || key === 'compliance_score' || key === 'arrivals_score' || key === 'final_score') {
                cellClass += ' border-l-main';
            } else if (['calls_score', 'sms_score', 'profiler_note_lenght_all', 'active_days', 'median_time_to_profile', 'tte_value', 'leads_reached', 'median_call_duration', 'profiles_score', 'profiles_completed', 'documents_score', 'past_due_ratio', 'total_drug_tests', 'onboarded'].includes(key)) {
                cellClass += ' border-l-sub-group';
            }

            return `<td class="${cellClass}">${value}</td>`;
        }).join('');
        return `<tr class="table-body-row hover:bg-gray-800/50 transition-colors" data-entity-index="${index}">${cells}</tr>`;
    }).join('');
}

function renderRankingsFooter(data) {
    const footerRow = document.getElementById('rankingsTableFooter');
    if (!footerRow) return;
    footerRow.innerHTML = '';

    const mode = state.rankingsMode;

    const columnsInOrder = [
        'rank', 'name',
        ...(mode === 'recruiter' ? ['team'] : []),
        ...(mode === 'team' ? ['num_recruiters'] : []),
        'new_leads_assigned_on_date',
        'old_leads_assigned_on_date',
        mode === 'profiler' ? 'fresh_leads_assigned_on_date' : 'hot_leads_assigned',
        'final_score',
        'effort_score',
        'calls_score',
        'outbound_calls', 'outbound_calls_percentile',
        'unique_calls', 'unique_calls_percentile',
        'call_duration_seconds', 'call_duration_seconds_percentile',
        'sms_score',
        'outbound_sms', 'outbound_sms_percentile',
        'unique_sms', 'unique_sms_percentile',
        ...(mode === 'profiler' ? ['profiler_note_lenght_all', 'profiler_note_lenght_percentile'] : []),
        'active_days', 'active_days_percentile',
        ...(mode === 'profiler' ? ['median_time_to_profile', 'median_time_to_profile_percentile'] : []),
        'compliance_score',
        'tte_value', 'tte_percentile',
        'leads_reached', 'leads_reached_percentile',
        'median_call_duration', 'median_call_duration_percentile',
        ...(mode !== 'profiler' ? ['profiles_completed', 'profiles_completed_percentile'] : []),
        ...(mode === 'profiler' ? ['profiles_score', 'profiles_profiled', 'profiles_profiled_percentile', 'profiles_completed', 'profiles_completed_percentile'] : []),
        'documents_score',
        'mvr', 'mvr_percentile',
        'psp', 'psp_percentile',
        'cdl', 'cdl_percentile',
        ...(mode !== 'profiler' ? ['past_due_ratio', 'past_due_ratio_percentile'] : []),
        'arrivals_score',
        'total_drug_tests', 'total_drug_tests_percentile',
        'onboarded', 'onboarded_percentile'
    ];

    const settings = mode === 'profiler' ? state.rankingSettingsProfiler : state.rankingSettings;
    const perLeadSettings = settings.perLeadMetrics;

    const footerCellsHtml = columnsInOrder.map((key) => {
        let cellContent = '';
        let cellClasses = 'py-1 px-1.5';

        if (key === 'name') {
            cellContent = `
                <select id="rankingsSummaryStatSelect" class="control-deck-select text-xs w-full">
                     <option value="sum" ${state.rankingsSummaryStat === 'sum' ? 'selected' : ''}>Sum</option>
                     <option value="average" ${state.rankingsSummaryStat === 'average' ? 'selected' : ''}>Average</option>
                     <option value="median" ${state.rankingsSummaryStat === 'median' ? 'selected' : ''}>Median</option>
                     <option value="min" ${state.rankingsSummaryStat === 'min' ? 'selected' : ''}>Min</option>
                     <option value="max" ${state.rankingsSummaryStat === 'max' ? 'selected' : ''}>Max</option>
                </select>
            `;
        } else if (key !== 'rank' && key !== 'team' && key !== 'num_recruiters') {
            cellClasses += ' whitespace-nowrap text-center font-mono text-gray-500';
            const values = data.map(row => Number(row[key])).filter(v => !isNaN(v) && isFinite(v));

            const isPerLeadMetric = perLeadSettings[key];

            if (values.length > 0) {
                const sum = values.reduce((acc, v) => acc + v, 0);
                const sorted = [...values].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
                const stats = {
                    sum: sum,
                    average: sum / values.length,
                    median: median,
                    min: sorted[0],
                    max: sorted[sorted.length - 1]
                };

                const statValue = stats[state.rankingsSummaryStat] || 0;
                if (key.includes('percentile') || key.includes('_score') || key === 'leads_reached' || key === 'past_due_ratio') {
                    cellContent = formatNumber(statValue, 1) + '%';
                } else if (key === 'tte_value' || key === 'median_time_to_profile' || key === 'median_call_duration' || (isPerLeadMetric && key === 'call_duration_seconds')) {
                    cellContent = formatDuration(statValue);
                } else if (isPerLeadMetric) {
                     cellContent = formatNumber(statValue, 2);
                } else {
                    cellContent = formatNumber(statValue, 0);
                }
            } else {
                cellContent = 'N/A';
            }
        }

        if (key === 'final_score') cellClasses += ' final-score-cell';
        else if (key === 'effort_score') cellClasses += ' effort-score-cell';
        else if (key === 'compliance_score') cellClasses += ' compliance-score-cell';
        else if (key === 'arrivals_score') cellClasses += ' arrivals-score-cell';
        else if (key.includes('_score')) cellClasses += ' score-summary-cell';

        if(key.includes('percentile')) cellClasses += ' percentile-cell';

        if (key === 'effort_score' || key === 'compliance_score' || key === 'arrivals_score' || key === 'final_score') {
            cellClasses += ' border-l-main';
        } else if (['calls_score', 'sms_score', 'profiler_note_lenght_all', 'active_days', 'median_time_to_profile', 'tte_value', 'leads_reached', 'median_call_duration', 'profiles_score', 'profiles_completed', 'documents_score', 'past_due_ratio', 'total_drug_tests', 'onboarded'].includes(key)) {
            cellClasses += ' border-l-sub-group';
        }

        return `<td class="${cellClasses}">${cellContent}</td>`;
    }).join('');

    footerRow.innerHTML = `<tr>${footerCellsHtml}</tr>`;

    const rankingsSummaryStatSelect = document.getElementById('rankingsSummaryStatSelect');
    if (rankingsSummaryStatSelect) {
        rankingsSummaryStatSelect.onchange = (e) => {
            state.rankingsSummaryStat = e.target.value;
            renderRankingsFooter(data);
        };
    }
}

// --- DETAILED BREAKDOWN MODAL ---

let currentBreakdownIndex = 0;
let carouselTimers = {};

function initializeBreakdownModal() {
    const modal = document.getElementById('detailedBreakdownModal');
    if (!modal) return;

    document.getElementById('closeBreakdownBtn').addEventListener('click', () => {
        closeModal('detailedBreakdownModal');
        Object.values(carouselTimers).forEach(timer => clearInterval(timer));
    });

    document.getElementById('breakdownNextBtn').addEventListener('click', () => navigateBreakdown(1));
    document.getElementById('breakdownPrevBtn').addEventListener('click', () => navigateBreakdown(-1));

    modal.querySelectorAll('.breakdown-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            modal.querySelectorAll('.breakdown-tab-btn').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            modal.querySelectorAll('.breakdown-tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
        });
    });
}

function openDetailedBreakdown(entityIndex) {
    currentBreakdownIndex = entityIndex;
    const entity = state.rankedData[currentBreakdownIndex];
    if (!entity) return;

    Object.values(carouselTimers).forEach(timer => clearInterval(timer));

    populateBreakdownData(entity);
    openModal('detailedBreakdownModal');
}

function navigateBreakdown(direction) {
    const newIndex = currentBreakdownIndex + direction;
    if (newIndex >= 0 && newIndex < state.rankedData.length) {
        openDetailedBreakdown(newIndex);
    }
}

function populateBreakdownData(entity) {
    document.getElementById('breakdownTitle').textContent = `Detailed Breakdown for ${entity.name}`;
    document.getElementById('breakdownRank').textContent = `Rank: ${entity.rank} of ${state.rankedData.length}`;
    document.getElementById('breakdownPrevBtn').disabled = currentBreakdownIndex === 0;
    document.getElementById('breakdownNextBtn').disabled = currentBreakdownIndex === state.rankedData.length - 1;

    document.querySelectorAll('.breakdown-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'effort'));
    document.querySelectorAll('.breakdown-tab-content').forEach(content => content.classList.toggle('hidden', content.id !== 'tab-content-effort'));

    populateEffortTab(entity);
    populateComplianceTab(entity);
    populateArrivalsTab(entity);
}

function getSmsVsCallsData(totalCalls, totalSms) {
    return {
        labels: [`Calls (${formatNumber(totalCalls, 0)})`, `SMS (${formatNumber(totalSms, 0)})`],
        datasets: [{
            data: [totalCalls, totalSms],
            backgroundColor: ['#3B82F6', '#10B981'],
            borderWidth: 2,
            borderColor: '#1f2937'
        }]
    };
}

function getCommunicationByDayData(entityName) {
    const dailyData = {};
    const dayCounts = {}; // To store the count of unique days for averaging
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const filteredRawData = state.allData.filter(row => {
        if (state.rankingsMode === 'recruiter' || state.rankingsMode === 'profiler') {
            return row.recruiter_name === entityName;
        }
        return row.team_name === entityName;
    });

    // First, collect totals and count the number of unique days for each weekday
    filteredRawData.forEach(row => {
        const dayOfWeek = row.date.getDay();
        const dateString = row.date.toISOString().split('T')[0];

        if (!dailyData[dayOfWeek]) {
            dailyData[dayOfWeek] = { calls: 0, sms: 0, duration: 0 };
            dayCounts[dayOfWeek] = new Set();
        }
        dailyData[dayOfWeek].calls += row.outbound_calls || 0;
        dailyData[dayOfWeek].sms += row.outbound_sms || 0;
        dailyData[dayOfWeek].duration += row.call_duration_seconds || 0;
        dayCounts[dayOfWeek].add(dateString); // Add the unique date to count it
    });

    const orderedData = [];
    const orderedLabels = [];
    const tooltipData = [];

    // Now, calculate the average for each day
    [1, 2, 3, 4, 5, 6, 0].forEach(dayIndex => {
        orderedLabels.push(dayLabels[dayIndex]);
        const dayStats = dailyData[dayIndex] || { calls: 0, sms: 0, duration: 0 };
        const count = dayCounts[dayIndex] ? dayCounts[dayIndex].size : 0;

        const totalCommunication = dayStats.calls + dayStats.sms;
        const averageCommunication = count > 0 ? totalCommunication / count : 0;

        const avgCalls = count > 0 ? dayStats.calls / count : 0;
        const avgSms = count > 0 ? dayStats.sms / count : 0;
        const avgDuration = count > 0 ? dayStats.duration / count : 0;

        orderedData.push(averageCommunication);
        tooltipData.push({ total: averageCommunication, calls: avgCalls, sms: avgSms, duration: avgDuration });
    });

    return {
        labels: orderedLabels,
        datasets: [{
            label: 'Average Communications (Calls + SMS)',
            data: orderedData,
            tooltipData: tooltipData,
            backgroundColor: '#F59E0B'
        }]
    };
}

function getArrivalsHistoryData(entityName) {
    const history = new Map();
    const arrivalsData = state.arrivalsData.filter(row => {
        const rowDate = new Date(row.date);
        if (isNaN(rowDate.getTime())) {
            return false;
        }
        if (state.rankingsMode === 'recruiter') return row.recruiter_name === entityName;
        return row.team_name === entityName;
    });
    const drugTestsData = state.drugTestsData.filter(row => {
        const rowDate = new Date(row.date);
        if (isNaN(rowDate.getTime())) {
            return false;
        }
        if (state.rankingsMode === 'recruiter') return row.recruiter_name === entityName;
        return row.team_name === entityName;
    });

    drugTestsData.forEach(row => {
        const rowDate = new Date(row.date);
        if (!isNaN(rowDate.getTime())) {
            const dateKey = rowDate.toISOString().split('T')[0];
            if (!history.has(dateKey)) {
                history.set(dateKey, { drugTests: 0, onboarded: 0 });
            }
            history.get(dateKey).drugTests++;
        }
    });

    arrivalsData.forEach(row => {
        const rowDate = new Date(row.date);
        if (!isNaN(rowDate.getTime())) {
            const dateKey = rowDate.toISOString().split('T')[0];
            if (!history.has(dateKey)) {
                history.set(dateKey, { drugTests: 0, onboarded: 0 });
            }
            history.get(dateKey).onboarded++;
        }
    });

    const sortedHistory = new Map([...history.entries()].sort());

    return {
        labels: [...sortedHistory.keys()],
        datasets: [
            { label: 'Drug Tests', data: [...sortedHistory.values()].map(d => d.drugTests), borderColor: '#22C55E', tension: 0.1 },
            { label: 'Onboarded', data: [...sortedHistory.values()].map(d => d.onboarded), borderColor: '#8B5CF6', tension: 0.1 }
        ]
    };
}

function getArrivalsByContractData(entityName) {
    const byContract = {};
    const drugTestsData = state.drugTestsData.filter(row => {
        const rowDate = new Date(row.date);
        if (isNaN(rowDate.getTime())) {
            return false;
        }
        if (state.rankingsMode === 'recruiter') return row.recruiter_name === entityName;
        return row.team_name === entityName;
    });

    drugTestsData.forEach(row => {
        const contract = row.contract_type || 'Unknown';
        byContract[contract] = (byContract[contract] || 0) + 1;
    });

    return {
        labels: Object.keys(byContract),
        datasets: [{
            data: Object.values(byContract),
            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
            borderWidth: 2,
            borderColor: '#1f2937'
        }]
    };
}

function populateEffortTab(entity) {
    // --- DATA SOURCE SELECTION ---
    const dataSource = state.breakdownDataSource; // 'all' or 'assigned_on_date'

    const fromDateStr = document.getElementById('rankingsDateFromFilter').value;
    const toDateStr = document.getElementById('rankingsDateToFilter').value;
    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(new Date(toDateStr).getTime() + (24 * 60 * 60 * 1000 - 1)) : null;

    const selectedCompanies = getSelectedValues(document.getElementById('rankingsCompanyFilterDropdown'));
    const selectedContracts = getSelectedValues(document.getElementById('rankingsContractFilterDropdown'));

    const relevantRawData = state.allData.filter(row => {
        const rowDate = new Date(row.date);
        const nameMatch = state.rankingsMode === 'team' ? row.team_name === entity.name : row.recruiter_name === entity.name;
        const dateMatch = rowDate >= fromDate && rowDate <= toDate;
        const companyMatch = selectedCompanies.length === 0 || selectedCompanies.includes(row.company_name);
        const contractMatch = selectedContracts.length === 0 || selectedContracts.includes(row.contract_type);
        return nameMatch && dateMatch && companyMatch && contractMatch;
    });

    // Calculate metrics based on the selected data source
    let calls = 0, unique_calls = 0, call_duration_seconds = 0, sms = 0, unique_sms = 0;
    relevantRawData.forEach(row => {
        if (dataSource === 'assigned_on_date') {
            calls += Number(row.outbound_calls_assigned_on_date) || 0;
            unique_calls += Number(row.unique_calls_assigned_on_date) || 0;
            call_duration_seconds += Number(row.call_duration_assigned_on_date) || 0;
            sms += Number(row.outbound_sms_assigned_on_date) || 0;
            unique_sms += Number(row.unique_sms_assigned_on_date) || 0;
        } else { // 'all'
            calls += Number(row.outbound_calls) || 0;
            unique_calls += Number(row.unique_calls) || 0;
            call_duration_seconds += Number(row.call_duration_seconds) || 0;
            sms += Number(row.outbound_sms) || 0;
            unique_sms += Number(row.unique_sms) || 0;
        }
    });

    const totalLeadsAssigned = (entity.original_new_leads_assigned_on_date || 0) + (entity.original_old_leads_assigned_on_date || 0);
    const totalDaysInPeriod = getTotalDaysInSelectedPeriod();

    const callsPerLead = totalLeadsAssigned > 0 ? (calls / totalLeadsAssigned) : 0;
    const smsPerLead = totalLeadsAssigned > 0 ? (sms / totalLeadsAssigned) : 0;
    const durationPerLead = totalLeadsAssigned > 0 ? (call_duration_seconds / totalLeadsAssigned) : 0;
    const uniqueCallsPerLead = totalLeadsAssigned > 0 ? (unique_calls / totalLeadsAssigned) : 0;
    const uniqueSmsPerLead = totalLeadsAssigned > 0 ? (unique_sms / totalLeadsAssigned) : 0;

    const getMetricRank = (metricKey, calculationFn, sortDirection = 'desc') => {
        const sortedData = [...state.rankedData].sort((a, b) => {
            const valueA = calculationFn(a);
            const valueB = calculationFn(b);
            if (sortDirection === 'asc') {
                if (valueA === null || !isFinite(valueA)) return 1;
                if (valueB === null || !isFinite(valueB)) return -1;
                return valueA - valueB;
            } else {
                return (valueB || 0) - (valueA || 0);
            }
        });
        const rankIndex = sortedData.findIndex(item => item.name === entity.name);
        return rankIndex !== -1 ? rankIndex + 1 : 'N/A';
    };

    const metricsToRank = {
        totalCalls: { calc: e => dataSource === 'all' ? e.original_outbound_calls : e.outbound_calls },
        callsPerLead: { calc: e => totalLeadsAssigned > 0 ? ((dataSource === 'all' ? e.original_outbound_calls : e.outbound_calls) / totalLeadsAssigned) : 0 },
        uniqueCalls: { calc: e => dataSource === 'all' ? e.original_unique_calls : e.unique_calls },
        uniqueCallsPerLead: { calc: e => totalLeadsAssigned > 0 ? ((dataSource === 'all' ? e.original_unique_calls : e.unique_calls) / totalLeadsAssigned) : 0 },
        callDuration: { calc: e => dataSource === 'all' ? e.original_call_duration_seconds : e.call_duration_seconds },
        durationPerLead: { calc: e => totalLeadsAssigned > 0 ? ((dataSource === 'all' ? e.original_call_duration_seconds : e.call_duration_seconds) / totalLeadsAssigned) : 0 },
        totalSms: { calc: e => dataSource === 'all' ? e.original_outbound_sms : e.outbound_sms },
        smsPerLead: { calc: e => totalLeadsAssigned > 0 ? ((dataSource === 'all' ? e.original_outbound_sms : e.outbound_sms) / totalLeadsAssigned) : 0 },
        uniqueSms: { calc: e => dataSource === 'all' ? e.original_unique_sms : e.unique_sms },
        uniqueSmsPerLead: { calc: e => totalLeadsAssigned > 0 ? ((dataSource === 'all' ? e.original_unique_sms : e.unique_sms) / totalLeadsAssigned) : 0 },
        noteLength: { calc: e => e.profiler_note_lenght_all || 0 },
        timeToProfile: { calc: e => e.median_time_to_profile, dir: 'asc' },
        activeDays: { calc: e => e.active_days || 0 }
    };

    const ranks = {};
    for (const key in metricsToRank) {
        ranks[key] = getMetricRank(key, metricsToRank[key].calc, metricsToRank[key].dir);
    }

    const isProfiler = state.rankingsMode === 'profiler';
    const hotOrFreshLeads = isProfiler ? entity.fresh_leads_assigned_on_date : entity.hot_leads_assigned;
    const hotOrFreshLabel = isProfiler ? 'Total Fresh Leads' : 'Total Hot Leads';

    let kpiHtml = `
        <div class="kpi-item"><div class="kpi-label">Total New Leads</div><div class="kpi-value">${formatNumber(entity.original_new_leads_assigned_on_date, 0)}</div></div>
        <div class="kpi-item"><div class="kpi-label">Total Old Leads</div><div class="kpi-value">${formatNumber(entity.original_old_leads_assigned_on_date, 0)}</div></div>
        <div class="kpi-item"><div class="kpi-label">${hotOrFreshLabel}</div><div class="kpi-value">${formatNumber(hotOrFreshLeads, 0)}</div></div>
    `;

    let tableRowsHtml = `
        <tr><td>Total Calls</td><td>${formatNumber(calls, 0)}<span class="rank-display">(Rank: ${ranks.totalCalls})</span></td></tr>
        <tr><td>Calls Per Lead</td><td>${formatNumber(callsPerLead, 2)}<span class="rank-display">(Rank: ${ranks.callsPerLead})</span></td></tr>
        <tr><td>Unique Calls</td><td>${formatNumber(unique_calls, 0)}<span class="rank-display">(Rank: ${ranks.uniqueCalls})</span></td></tr>
        <tr><td>Unique Calls Per Lead</td><td>${formatNumber(uniqueCallsPerLead, 2)}<span class="rank-display">(Rank: ${ranks.uniqueCallsPerLead})</span></td></tr>
        <tr><td>Call Duration</td><td>${formatDuration(call_duration_seconds)}<span class="rank-display">(Rank: ${ranks.callDuration})</span></td></tr>
        <tr><td>Duration Per Lead</td><td>${formatDuration(durationPerLead)}<span class="rank-display">(Rank: ${ranks.durationPerLead})</span></td></tr>
        <tr><td>Total SMS</td><td>${formatNumber(sms, 0)}<span class="rank-display">(Rank: ${ranks.totalSms})</span></td></tr>
        <tr><td>SMS Per Lead</td><td>${formatNumber(smsPerLead, 2)}<span class="rank-display">(Rank: ${ranks.smsPerLead})</span></td></tr>
        <tr><td>Unique SMS</td><td>${formatNumber(unique_sms, 0)}<span class="rank-display">(Rank: ${ranks.uniqueSms})</span></td></tr>
        <tr><td>Unique SMS Per Lead</td><td>${formatNumber(uniqueSmsPerLead, 2)}<span class="rank-display">(Rank: ${ranks.uniqueSmsPerLead})</span></td></tr>
    `;

    if (isProfiler) {
        tableRowsHtml += `
            <tr><td>Note Length</td><td>${formatNumber(entity.profiler_note_lenght_all, 0)}<span class="rank-display">(Rank: ${ranks.noteLength})</span></td></tr>
            <tr><td>Time to Profile</td><td>${formatDuration(entity.median_time_to_profile)}<span class="rank-display">(Rank: ${ranks.timeToProfile})</span></td></tr>
        `;
    }

    tableRowsHtml += `<tr><td>Active Days</td><td>${formatNumber(entity.active_days, 0)}/${totalDaysInPeriod}<span class="rank-display">(Rank: ${ranks.activeDays})</span></td></tr>`;

    document.getElementById('kpi-effort').innerHTML = kpiHtml;

    document.getElementById('table-effort').innerHTML = `
        <thead>
            <tr>
                <th colspan="2">
                    <div class="details-table-header-content">
                        <span>Effort Metrics</span>
                        <div class="flex items-center p-0.5 bg-gray-800 rounded-md text-xs">
                            <div class="breakdown-source-btn-wrapper">
                                <button data-source="all" class="breakdown-source-btn ${dataSource === 'all' ? 'active' : ''}">All Leads</button>
                                <span class="breakdown-tooltip-text">Calculates metrics using all calls/SMS made by the entity in the date range.</span>
                            </div>
                            <div class="breakdown-source-btn-wrapper">
                                <button data-source="assigned_on_date" class="breakdown-source-btn ${dataSource === 'assigned_on_date' ? 'active' : ''}">Assigned Leads</button>
                                <span class="breakdown-tooltip-text">Calculates metrics using only calls/SMS made to leads that were assigned on the same day.</span>
                            </div>
                        </div>
                    </div>
                </th>
            </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
    `;

    document.querySelectorAll('.breakdown-source-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.breakdownDataSource = btn.dataset.source;
            populateBreakdownData(entity);
        });
    });

    const charts = [
        { id: 'effort-chart-1', type: 'doughnut', data: getSmsVsCallsData(calls, sms), options: { plugins: { title: { display: true, text: 'Communication Mix' }, legend: { position: 'bottom' } } } },
        { id: 'effort-chart-2', type: 'bar', data: getCommunicationByDayData(entity.name), options: { plugins: { 
            title: { display: true, text: 'Communication by Day (Average, All Time)' }, // Title updated here
            legend: {display: false}, 
            datalabels: {display: false}, 
            tooltip: { callbacks: { label: (ctx) => {
                const dayStats = ctx.dataset.tooltipData[ctx.dataIndex];
                // Tooltip now shows averages
                return [ 
                    `Avg Total: ${formatNumber(dayStats.total, 2)}`, 
                    `Avg Calls: ${formatNumber(dayStats.calls, 2)}`, 
                    `Avg SMS: ${formatNumber(dayStats.sms, 2)}`, 
                    `Avg Duration: ${formatDuration(dayStats.duration)}` 
                ];
            } } } 
        } } }
    ];
    renderChartCarousel('carousel-effort', charts);
}

function populateComplianceTab(entity) {
    const isProfiler = state.rankingsMode === 'profiler';
    const settings = isProfiler ? state.rankingSettingsProfiler : state.rankingSettings;
    const ttePercentileLabel = settings.ttePValue.toUpperCase();
    const effectiveEntityMode = isProfiler ? 'recruiter' : state.rankingsMode;

    // --- Recalculate all metrics specifically for the popup to ensure they are independent of main page settings ---
    state.rankedData.forEach(e => {
        // Standard metrics (always use 'standard' calculation mode for the popup)
        e.temp_standard_tte = calculateMetricForPopup(e.name, effectiveEntityMode, 'TTE', 'standard');
        e.temp_standard_lr = calculateMetricForPopup(e.name, effectiveEntityMode, 'LeadsReached', 'standard');

        // Special metrics (hot for recruiters/teams, fresh for profilers)
        const specialMode = isProfiler ? 'fresh' : 'hot';
        e.temp_special_tte = calculateMetricForPopup(e.name, effectiveEntityMode, 'TTE', specialMode);
        e.temp_special_lr = calculateMetricForPopup(e.name, effectiveEntityMode, 'LeadsReached', specialMode);
    });

    // --- RANK CALCULATION START (using the temporary, correctly calculated values) ---
    const getMetricRank = (metricKey, sortDirection = 'desc') => {
        const sortedData = [...state.rankedData].sort((a, b) => {
            const valueA = a[metricKey];
            const valueB = b[metricKey];
            if (sortDirection === 'asc') {
                if (valueA === null || !isFinite(valueA)) return 1;
                if (valueB === null || !isFinite(valueB)) return -1;
                return valueA - valueB;
            }
            return (valueB || 0) - (valueA || 0);
        });
        const rankIndex = sortedData.findIndex(item => item.name === entity.name);
        return rankIndex !== -1 ? rankIndex + 1 : 'N/A';
    };

    const ranks = {
        // Ranks for the correctly calculated standard metrics
        standard_tte: getMetricRank('temp_standard_tte', 'asc'),
        standard_lr: getMetricRank('temp_standard_lr'),
        // Ranks for the special metrics
        special_tte: getMetricRank('temp_special_tte', 'asc'),
        special_lr: getMetricRank('temp_special_lr'),
        // Other existing metric ranks
        past_due_ratio: getMetricRank('past_due_ratio', 'asc'),
        mvr: getMetricRank('mvr'),
        psp: getMetricRank('psp'),
        cdl: getMetricRank('cdl'),
        profiles_profiled: getMetricRank('profiles_profiled'),
        profiles_completed: getMetricRank('profiles_completed'),
        median_call_duration: getMetricRank('median_call_duration')
    };
    // --- RANK CALCULATION END ---

    // Get the correct values for the currently displayed entity from the temporary properties
    const currentEntityData = state.rankedData.find(e => e.name === entity.name) || {};
    const standardTTE = currentEntityData.temp_standard_tte;
    const standardLR = currentEntityData.temp_standard_lr;
    const specialTTE = currentEntityData.temp_special_tte;
    const specialLR = currentEntityData.temp_special_lr;

    // --- START: MODIFIED KPI HTML SECTION ---
    const hotOrFreshLeads = isProfiler ? entity.fresh_leads_assigned_on_date : entity.hot_leads_assigned;
    const hotOrFreshLabel = isProfiler ? 'Total Fresh Leads' : 'Total Hot Leads';

    let kpiHtml = `
        <div class="kpi-item"><div class="kpi-label">Total New Leads</div><div class="kpi-value">${formatNumber(entity.original_new_leads_assigned_on_date, 0)}</div></div>
        <div class="kpi-item"><div class="kpi-label">Total Old Leads</div><div class="kpi-value">${formatNumber(entity.original_old_leads_assigned_on_date, 0)}</div></div>
        <div class="kpi-item"><div class="kpi-label">${hotOrFreshLabel}</div><div class="kpi-value">${formatNumber(hotOrFreshLeads, 0)}</div></div>
    `;
    // --- END: MODIFIED KPI HTML SECTION ---


    // --- Build the table rows using the corrected data ---
    let tableRowsHtml = `
        <tr><td>Avg. TTE (${ttePercentileLabel})</td><td>${!isFinite(standardTTE) ? '∞' : formatDuration(standardTTE)}<span class="rank-display">(Rank: ${ranks.standard_tte})</span></td></tr>
        <tr><td>Avg. Leads Reached</td><td>${formatNumber(standardLR, 1)}%<span class="rank-display">(Rank: ${ranks.standard_lr})</span></td></tr>
        <tr><td>Median Call Duration</td><td>${formatDuration(entity.median_call_duration)}<span class="rank-display">(Rank: ${ranks.median_call_duration})</span></td></tr>
    `;

    if (isProfiler) {
        tableRowsHtml += `
            <tr><td>Avg. TTE (Fresh Leads)</td><td>${!isFinite(specialTTE) ? '∞' : formatDuration(specialTTE)}<span class="rank-display">(Rank: ${ranks.special_tte})</span></td></tr>
            <tr><td>Avg. Leads Reached (Fresh Leads)</td><td>${formatNumber(specialLR, 1)}%<span class="rank-display">(Rank: ${ranks.special_lr})</span></td></tr>
            <tr><td>Profiles Profiled</td><td>${formatNumber(entity.profiles_profiled, 0)}<span class="rank-display">(Rank: ${ranks.profiles_profiled})</span></td></tr>
            <tr><td>Profiles Completed</td><td>${formatNumber(entity.profiles_completed, 0)}<span class="rank-display">(Rank: ${ranks.profiles_completed})</span></td></tr>
        `;
    } else { // Recruiter or Team
        tableRowsHtml += `
            <tr><td>Avg. TTE (Hot Leads)</td><td>${!isFinite(specialTTE) ? '∞' : formatDuration(specialTTE)}<span class="rank-display">(Rank: ${ranks.special_tte})</span></td></tr>
            <tr><td>Avg. Leads Reached (Hot Leads)</td><td>${formatNumber(specialLR, 1)}%<span class="rank-display">(Rank: ${ranks.special_lr})</span></td></tr>
            <tr><td>Profiles Completed</td><td>${formatNumber(entity.profiles_completed, 0)}<span class="rank-display">(Rank: ${ranks.profiles_completed})</span></td></tr>
            <tr><td>Past Due Ratio</td><td>${formatNumber(entity.past_due_ratio, 1)}%<span class="rank-display">(Rank: ${ranks.past_due_ratio})</span></td></tr>
        `;
    }

    tableRowsHtml += `
        <tr><td>MVRs Collected</td><td>${formatNumber(entity.mvr, 0)}<span class="rank-display">(Rank: ${ranks.mvr})</span></td></tr>
        <tr><td>PSPs Collected</td><td>${formatNumber(entity.psp, 0)}<span class="rank-display">(Rank: ${ranks.psp})</span></td></tr>
        <tr><td>CDLs Collected</td><td>${formatNumber(entity.cdl, 0)}<span class="rank-display">(Rank: ${ranks.cdl})</span></td></tr>
    `;

    document.getElementById('kpi-compliance').innerHTML = kpiHtml;
    document.getElementById('table-compliance').innerHTML = `
         <thead><tr><th colspan="2">Compliance Metrics</th></tr></thead>
         <tbody>${tableRowsHtml}</tbody>
    `;

    const lineChartOptions = {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: {
            x: { type: 'time', time: { unit: 'day', tooltipFormat: 'P' }, ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
            y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } }
        },
        plugins: {
            legend: { position: 'bottom', labels: { color: '#d1d5db', usePointStyle: true, pointStyle: 'line' } },
            datalabels: { display: false }
        }
    };

    // --- NEW: Multi-line tooltip callback function ---
    const multiLineTooltipCallback = (context, metricFormat) => {
        const { dataset, dataIndex, parsed } = context;
        const mainLabel = dataset.label || '';
        const leadsLabel = mainLabel === 'Standard' ? 'Standard Leads' : `${dataset.label} Leads`;
        const leadCount = dataset.customData[dataIndex] || 0;
        
        let value = 'N/A';
        if (parsed.y !== null) {
            value = metricFormat === 'duration' ? formatDuration(parsed.y) : `${formatNumber(parsed.y, 1)}%`;
        }

        return [
            `${mainLabel}: ${value}`,
            `${leadsLabel}: ${leadCount}`
        ];
    };

    const charts = [
        { id: 'compliance-chart-1', type: 'bar', data: getTTEPercentileData(entity),
            options: {
                plugins: {
                    title: { display: true, text: 'Time To Engage by Percentile' },
                    legend: { display: false },
                    datalabels: {
                        display: true, rotation: -90, color: '#ffffff', anchor: 'end', align: 'end',
                        offset: -4, font: { weight: 'bold' },
                        formatter: (value) => !isFinite(value) ? '∞' : formatDuration(value)
                    }
                },
                scales: { y: { ticks: { callback: (val) => formatDuration(val, true) } } }
            }
        },
        { 
            id: 'compliance-chart-2', 
            type: 'line', 
            data: getLeadsReachedHistoryData(entity.name),
            options: { 
                ...lineChartOptions, 
                plugins: { 
                    ...lineChartOptions.plugins, 
                    title: { display: true, text: 'Leads Reached History (%)' },
                    tooltip: {
                        callbacks: {
                            label: (context) => multiLineTooltipCallback(context, 'percentage')
                        }
                    }
                } 
            }
        },
        { 
            id: 'compliance-chart-3', 
            type: 'line', 
            data: getTTEHistoryData(entity.name),
            options: { 
                ...lineChartOptions, 
                scales: { ...lineChartOptions.scales, y: { ...lineChartOptions.scales.y, ticks: { ...lineChartOptions.scales.y.ticks, callback: (val) => formatDuration(val, true) } } },
                plugins: { 
                    ...lineChartOptions.plugins, 
                    title: { display: true, text: 'Time to Engage History' },
                    tooltip: {
                         callbacks: {
                            label: (context) => multiLineTooltipCallback(context, 'duration')
                        }
                    }
                } 
            }
        }
    ];
    renderChartCarousel('carousel-compliance', charts);
}

function populateArrivalsTab(entity) {
    // Helper function to calculate ranks for the metrics in this tab
    const getMetricRank = (metricKey, sortDirection = 'desc') => {
        const sortedData = [...state.rankedData].sort((a, b) => {
            const valueA = a[metricKey];
            const valueB = b[metricKey];
            if (sortDirection === 'asc') {
                if (valueA === null || !isFinite(valueA)) return 1;
                if (valueB === null || !isFinite(valueB)) return -1;
                return valueA - valueB;
            }
            return (valueB || 0) - (valueA || 0);
        });
        const rankIndex = sortedData.findIndex(item => item.name === entity.name);
        return rankIndex !== -1 ? rankIndex + 1 : 'N/A';
    };

    const ranks = {
        total_drug_tests: getMetricRank('total_drug_tests'),
        onboarded: getMetricRank('onboarded')
    };

    // --- NEW: KPI cards now show lead counts ---
    const isProfiler = state.rankingsMode === 'profiler';
    const hotOrFreshLeads = isProfiler ? entity.fresh_leads_assigned_on_date : entity.hot_leads_assigned;
    const hotOrFreshLabel = isProfiler ? 'Total Fresh Leads' : 'Total Hot Leads';

    document.getElementById('kpi-arrivals').innerHTML = `
        <div class="kpi-item"><div class="kpi-label">Total New Leads</div><div class="kpi-value">${formatNumber(entity.original_new_leads_assigned_on_date, 0)}</div></div>
        <div class="kpi-item"><div class="kpi-label">Total Old Leads</div><div class="kpi-value">${formatNumber(entity.original_old_leads_assigned_on_date, 0)}</div></div>
        <div class="kpi-item"><div class="kpi-label">${hotOrFreshLabel}</div><div class="kpi-value">${formatNumber(hotOrFreshLeads, 0)}</div></div>
    `;

    // --- NEW: Arrivals Metrics table now includes ranks ---
    document.getElementById('table-arrivals').innerHTML = `
         <thead><tr><th colspan="2">Arrivals Metrics</th></tr></thead>
         <tbody>
            <tr><td>Total Drug Tests</td><td>${formatNumber(entity.total_drug_tests, 0)}<span class="rank-display">(Rank: ${ranks.total_drug_tests})</span></td></tr>
            <tr><td>Onboarded</td><td>${formatNumber(entity.onboarded, 0)}<span class="rank-display">(Rank: ${ranks.onboarded})</span></td></tr>
         </tbody>
    `;

    // The chart logic remains the same
    const charts = [
        {
            id: 'arrivals-chart-1',
            type: 'line',
            data: getArrivalsHistoryData(entity.name),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: { display: true, text: 'Arrivals Over Time' },
                    legend: {
                        labels: {
                            color: '#9ca3af',
                            usePointStyle: true,
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: function(tooltipItems) {
                                if (tooltipItems.length > 0) {
                                    const date = new Date(tooltipItems[0].label);
                                    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                                }
                                return '';
                            },
                            label: function(tooltipItem) {
                                const datasetLabel = tooltipItem.dataset.label || '';
                                const value = tooltipItem.raw;
                                return `${datasetLabel}: ${value}`;
                            }
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
                            displayFormats: {
                                day: 'MMM d'
                            },
                            tooltipFormat: 'MM/dd/yyyy'
                        },
                        ticks: { color: '#9ca3af' },
                        grid: { color: '#374151' }
                    },
                    y: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: '#374151' },
                        beginAtZero: true
                    }
                }
            }
        },
        { id: 'arrivals-chart-2', type: 'pie', data: getArrivalsByContractData(entity.name), options: { plugins: { title: { display: true, text: 'Drug Tests by Contract' }, legend: { position: 'bottom' } } } }
    ];
    renderChartCarousel('carousel-arrivals', charts);
}

function renderChartCarousel(containerId, chartsData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        ${chartsData.map((chart, index) => `
            <div class="chart-carousel-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                <canvas id="${chart.id}"></canvas>
            </div>
        `).join('')}
        ${chartsData.length > 1 ? `
            <div class="carousel-dots">
                ${chartsData.map((_, index) => `<div class="carousel-dot ${index === 0 ? 'active' : ''}" data-slide-to="${index}"></div>`).join('')}
            </div>
        ` : ''}
    `;

    chartsData.forEach(chartInfo => {
        const ctx = document.getElementById(chartInfo.id)?.getContext('2d');
        if (ctx) {
            const commonOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#9ca3af',
                            usePointStyle: true,
                        }
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {}
                },
                scales: {}
            };

            const mergedOptions = Chart.helpers.merge(commonOptions, chartInfo.options);

            new Chart(ctx, { type: chartInfo.type, data: chartInfo.data, options: mergedOptions });
        }
    });

    if (chartsData.length > 1) {
        let currentIndex = 0;
        const slides = container.querySelectorAll('.chart-carousel-slide');
        const dots = container.querySelectorAll('.carousel-dot');

        const showSlide = (index) => {
            slides.forEach(s => s.classList.remove('active'));
            dots.forEach(d => d.classList.remove('active'));
            slides[index].classList.add('active');
            dots[index].classList.add('active');
        };

        const startTimer = () => {
            if (carouselTimers[containerId]) clearInterval(carouselTimers[containerId]);
            carouselTimers[containerId] = setInterval(() => {
                currentIndex = (currentIndex + 1) % slides.length;
                showSlide(currentIndex);
            }, 10000);
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

function getTTEPercentileData(entity) {
    const labels = [];
    const data = [];
    // --- FIX START ---
    // Correctly filter data for profilers by checking recruiter_name
    const rawData = state.allData.filter(row => {
         if (state.rankingsMode === 'recruiter' || state.rankingsMode === 'profiler') {
            return row.recruiter_name === entity.name;
         }
         return row.team_name === entity.name;
    });

    // Use the correct settings based on the current mode
    const settings = state.rankingsMode === 'profiler' ? state.rankingSettingsProfiler : state.rankingSettings;
    const tteSource = state.rankingsMode === 'profiler' ? settings.tteSourceProfiler : settings.tteSource;
    const tteLeadType = settings.tteLeadType;
    // --- FIX END ---

    for (let i = 10; i <= 100; i += 10) {
        let pKey;
        // Use the correct key based on the settings
        if (tteSource === 'hot') {
            pKey = `p_${i}_engage`;
        } else if (tteSource === 'fresh') {
            pKey = `p_${i}_engage_fresh_leads`;
        } else { // standard
            pKey = `p_${i}_engage_${tteLeadType}`;
        }

        const values = rawData.map(row => parseTTEValue(row[pKey])).filter(v => v !== null);
        
        if (values.length > 0) {
            const finiteValues = values.filter(v => isFinite(v));
            const infiniteCount = values.length - finiteValues.length;

            if (infiniteCount > 0 && finiteValues.length === 0) {
                 data.push(Infinity);
            } else if (finiteValues.length > 0) {
                const avg = finiteValues.reduce((a, b) => a + b, 0) / finiteValues.length;
                data.push(avg);
            } else {
                data.push(null); // No valid data at all
            }

        } else {
             data.push(null);
        }
        labels.push(`P${i}`);
    }
    return { labels, datasets: [{ label: 'Avg Time To Engage', data, backgroundColor: '#8B5CF6' }] };
}


// js/rankingsView.js

function getLeadsReachedHistoryData(entityName) {
    const isProfiler = state.rankingsMode === 'profiler';
    const settings = isProfiler ? state.rankingSettingsProfiler : state.rankingSettings;
    const leadsReachedLeadType = settings.leadsReachedLeadType;
    const specialMode = isProfiler ? 'fresh' : 'hot';

    const fromDateStr = document.getElementById('rankingsDateFromFilter').value;
    const toDateStr = document.getElementById('rankingsDateToFilter').value;
    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(toDateStr) : null;
    
    const selectedCompanies = getSelectedValues(document.getElementById('rankingsCompanyFilterDropdown'));
    const selectedContracts = getSelectedValues(document.getElementById('rankingsContractFilterDropdown'));

    const dates = [];
    if (fromDate && toDate) {
        for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }
    }

    const dailyStandard = [];
    const dailySpecial = [];
    const dailyStandardLeads = []; // Array for standard lead counts
    const dailySpecialLeads = [];  // Array for special lead counts


    dates.forEach(date => {
        const dateString = date.toISOString().split('T')[0];
        
        const dayDataRows = state.allData.filter(row => {
            const nameMatch = state.rankingsMode === 'team' 
                ? row.team_name === entityName 
                : row.recruiter_name === entityName;
            const companyMatch = selectedCompanies.length === 0 || selectedCompanies.includes(row.company_name);
            const contractMatch = selectedContracts.length === 0 || selectedContracts.includes(row.contract_type);
            return nameMatch && new Date(row.date).toISOString().split('T')[0] === dateString && companyMatch && contractMatch;
        });
        
        // --- NEW: Calculate Lead Counts for the day ---
        let standardLeadCount = 0;
        let specialLeadCount = 0;
        dayDataRows.forEach(row => {
            standardLeadCount += (row.new_leads_assigned_on_date || 0) + (row.old_leads_assigned_on_date || 0);
            if (isProfiler) {
                specialLeadCount += row.fresh_leads_assigned_on_date || 0;
            } else {
                specialLeadCount += row.hot_leads_assigned || 0;
            }
        });
        dailyStandardLeads.push(standardLeadCount);
        dailySpecialLeads.push(specialLeadCount);


        if (dayDataRows.length === 0) {
            dailyStandard.push(null);
            dailySpecial.push(null);
            return;
        }

        const getDailyMedian = (keyFn) => {
            const dailyValues = [];
            dayDataRows.forEach(row => {
                let dailyReached = null;
                let encounteredInfinity = false;
                for (let i = 100; i >= 10; i -= 10) {
                    const pValue = parseTTEValue(row[keyFn(i)]);
                    if (pValue !== null) {
                        if (isFinite(pValue)) {
                            dailyReached = i;
                            break; 
                        }
                        encounteredInfinity = true;
                    }
                }
                if (dailyReached === null && encounteredInfinity) dailyReached = 0;
                if (dailyReached !== null) dailyValues.push(dailyReached);
            });

            if (dailyValues.length === 0) return null;

            const sorted = [...dailyValues].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        };

        dailyStandard.push(getDailyMedian(i => `p_${i}_engage_${leadsReachedLeadType}`));
        const specialKeySuffix = specialMode === 'hot' ? '' : '_fresh_leads';
        dailySpecial.push(getDailyMedian(i => `p_${i}_engage${specialKeySuffix}`));
    });

    return {
        labels: dates,
        datasets: [
            { label: 'Standard', data: dailyStandard, borderColor: '#3B82F6', tension: 0.2, spanGaps: true, customData: dailyStandardLeads },
            { label: specialMode.charAt(0).toUpperCase() + specialMode.slice(1), data: dailySpecial, borderColor: '#F59E0B', tension: 0.2, spanGaps: true, customData: dailySpecialLeads }
        ]
    };
}

function getTTEHistoryData(entityName) {
    const isProfiler = state.rankingsMode === 'profiler';
    const settings = isProfiler ? state.rankingSettingsProfiler : state.rankingSettings;
    const tteLeadType = settings.tteLeadType;
    const pValueTTE = settings.ttePValue.substring(1);
    const specialMode = isProfiler ? 'fresh' : 'hot';

    const fromDateStr = document.getElementById('rankingsDateFromFilter').value;
    const toDateStr = document.getElementById('rankingsDateToFilter').value;
    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(toDateStr) : null;

    const selectedCompanies = getSelectedValues(document.getElementById('rankingsCompanyFilterDropdown'));
    const selectedContracts = getSelectedValues(document.getElementById('rankingsContractFilterDropdown'));

    const dates = [];
    if (fromDate && toDate) {
        for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }
    }

    const dailyStandard = [];
    const dailySpecial = [];
    const dailyStandardLeads = []; // Array for standard lead counts
    const dailySpecialLeads = [];  // Array for special lead counts

    dates.forEach(date => {
        const dateString = date.toISOString().split('T')[0];

        const dayDataRows = state.allData.filter(row => {
            const nameMatch = state.rankingsMode === 'team'
                ? row.team_name === entityName
                : row.recruiter_name === entityName;
            const companyMatch = selectedCompanies.length === 0 || selectedCompanies.includes(row.company_name);
            const contractMatch = selectedContracts.length === 0 || selectedContracts.includes(row.contract_type);
            return nameMatch && new Date(row.date).toISOString().split('T')[0] === dateString && companyMatch && contractMatch;
        });

        // --- NEW: Calculate Lead Counts for the day ---
        let standardLeadCount = 0;
        let specialLeadCount = 0;
        dayDataRows.forEach(row => {
            standardLeadCount += (row.new_leads_assigned_on_date || 0) + (row.old_leads_assigned_on_date || 0);
            if (isProfiler) {
                specialLeadCount += row.fresh_leads_assigned_on_date || 0;
            } else {
                specialLeadCount += row.hot_leads_assigned || 0;
            }
        });
        dailyStandardLeads.push(standardLeadCount);
        dailySpecialLeads.push(specialLeadCount);

        if (dayDataRows.length === 0) {
            dailyStandard.push(null);
            dailySpecial.push(null);
            return;
        }

        const getDailyMedianTTE = (key) => {
            const dailyValues = dayDataRows.map(row => parseTTEValue(row[key])).filter(v => v !== null);
            if (dailyValues.length === 0) return null;

            const sorted = [...dailyValues].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            
            if (sorted.length % 2 === 0) {
                return (isFinite(sorted[mid - 1]) && isFinite(sorted[mid])) ? (sorted[mid - 1] + sorted[mid]) / 2 : Infinity;
            } else {
                return sorted[mid];
            }
        };

        const stdKey = `p_${pValueTTE}_engage_${tteLeadType}`;
        dailyStandard.push(getDailyMedianTTE(stdKey));

        const specialKeySuffix = specialMode === 'hot' ? '' : '_fresh_leads';
        const specialKey = `p_${pValueTTE}_engage${specialKeySuffix}`;
        dailySpecial.push(getDailyMedianTTE(specialKey));
    });

    return {
        labels: dates,
        datasets: [
            { label: 'Standard', data: dailyStandard, borderColor: '#3B82F6', tension: 0.2, spanGaps: true, customData: dailyStandardLeads },
            { label: specialMode.charAt(0).toUpperCase() + specialMode.slice(1), data: dailySpecial, borderColor: '#F59E0B', tension: 0.2, spanGaps: true, customData: dailySpecialLeads }
        ]
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('rankingsTableBody');
    if (tableBody) {
        tableBody.addEventListener('click', (e) => {
            const row = e.target.closest('.table-body-row[data-entity-index]');
            if (row) {
                const entityIndex = parseInt(row.dataset.entityIndex, 10);
                if (!isNaN(entityIndex)) {
                    openDetailedBreakdown(entityIndex);
                }
            }
        });
    }
});