// js/modals.js

import { state } from './state.js';
import { detectorFields } from './config.js';
import { saveAllProfiles, loadProfile, openModal, closeModal, populateAllDropdowns } from './ui.js';

// --- SETTINGS MODAL ---

export function openSettingsModal(mode, profileName) {
    state.modalMode = mode;
    const titleEl = document.getElementById('modalProfileTitle');
    const inputWrapper = document.getElementById('createProfileInputWrapper');
    const newNameInput = document.getElementById('newProfileNameInput');
    
    populateAllDropdowns();

    if (mode === 'create') {
        titleEl.classList.add('hidden');
        inputWrapper.classList.remove('hidden');
        if(newNameInput) newNameInput.value = '';
        state.detectorRules = [];
        document.getElementById('modalTeamFilter').value = '';
        document.getElementById('modalCompanyFilter').value = '';
        document.getElementById('modalContractFilter').value = '';

    } else {
        titleEl.textContent = `Editing: ${profileName}`;
        titleEl.classList.remove('hidden');
        inputWrapper.classList.add('hidden');
        const profile = state.detectorProfiles[profileName];
        state.detectorRules = JSON.parse(JSON.stringify(profile.rules || []));
        document.getElementById('modalTeamFilter').value = profile.filters?.team || '';
        document.getElementById('modalCompanyFilter').value = profile.filters?.company || '';
        document.getElementById('modalContractFilter').value = profile.filters?.contract || '';
    }

    // Reset to the first tab
    document.querySelectorAll('.settings-nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('href') === '#profile-settings'));
    document.querySelectorAll('.settings-section').forEach(sec => sec.classList.toggle('hidden', sec.id !== 'profile-settings'));

    openModal('settingsModal');
    renderRules();
    updateSetDefaultButtonState();
    updateProfileActionsState();
}

export function handleSettingsSave() {
    updateRulesFromDOM();
    if (state.modalMode === 'create') {
        const newName = document.getElementById('newProfileNameInput').value.trim();
        if (!newName) { alert("Please enter a profile name."); return; }
        if (state.detectorProfiles[newName]) { alert("A profile with this name already exists."); return; }
        state.activeProfileName = newName;
        state.detectorProfiles[state.activeProfileName] = { rules: [], filters: {} };
    }
    state.detectorProfiles[state.activeProfileName].rules = state.detectorRules;
    state.detectorProfiles[state.activeProfileName].filters = {
        team: document.getElementById('modalTeamFilter').value,
        company: document.getElementById('modalCompanyFilter').value,
        contract: document.getElementById('modalContractFilter').value,
    };
    saveAllProfiles();
    closeModal('settingsModal');
    loadProfile(state.activeProfileName);
}

function updateSetDefaultButtonState() {
    const btn = document.getElementById('setDefaultProfileBtn');
    if (!btn) return;

    btn.disabled = false;
    btn.className = 'bg-gray-600 hover:bg-gray-700 text-white font-medium py-1.5 px-4 rounded-md text-sm transition-colors flex items-center gap-2';

    if (state.modalMode === 'create') {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = `<i class="far fa-star"></i> Set as Default`;
    } else if (state.activeProfileName === state.defaultProfileName) {
        btn.disabled = true;
        btn.className = 'bg-yellow-500 text-white font-medium py-1.5 px-4 rounded-md text-sm flex items-center gap-2 cursor-default';
        btn.innerHTML = `<i class="fas fa-star"></i> Is Default`;
    } else {
        btn.innerHTML = `<i class="far fa-star"></i> Set as Default`;
    }
}

function updateProfileActionsState() {
    const actionsBtn = document.getElementById('profileActionsBtn');
    const deleteBtn = document.getElementById('deleteProfileBtn');
    if (!actionsBtn || !deleteBtn) return;

    if (state.modalMode === 'create') {
        actionsBtn.disabled = true;
        actionsBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        actionsBtn.disabled = false;
        actionsBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        deleteBtn.disabled = Object.keys(state.detectorProfiles).length <= 1;
        deleteBtn.classList.toggle('opacity-50', deleteBtn.disabled);
        deleteBtn.classList.toggle('cursor-not-allowed', deleteBtn.disabled);
    }
}

function updateRulesFromDOM() {
     const rulesFromUI = Array.from(document.querySelectorAll('[data-rule-id]')).map(ruleEl => {
         return {
             id: ruleEl.dataset.ruleId,
             name: ruleEl.querySelector('.rule-name').value,
             color: ruleEl.querySelector('.rule-color-input').value,
             conditions: Array.from(ruleEl.querySelectorAll('.condition-wrapper')).map(condWrapper => ({
                 field: condWrapper.querySelector('.rule-field').value,
                 operator: condWrapper.querySelector('.rule-operator').value,
                 valueType: condWrapper.querySelector('.rule-value-type').value,
                 value: condWrapper.querySelector('.rule-value').value,
                 percentile: condWrapper.querySelector('.rule-percentile').value,
                 dateContext: condWrapper.querySelector('.rule-date-context').value,
                 peerGroup: condWrapper.querySelector('.rule-peer-group').value,
                 specificTeam: condWrapper.querySelector('.rule-specific-team')?.value || '',
                 specificRecruiter: condWrapper.querySelector('.rule-specific-recruiter')?.value || '',
                 specificCompany: condWrapper.querySelector('.rule-specific-company')?.value || '',
                 specificContract: condWrapper.querySelector('.rule-specific-contract')?.value || '',
                 specificDataType: condWrapper.querySelector('.rule-specific-data-type')?.value || 'stub',
                 nextOperator: condWrapper.querySelector('.rule-logic')?.textContent || null
             }))
         }
     });
     state.detectorRules = rulesFromUI;
}

function renderRules() {
    const container = document.getElementById('rulesContainer');
    if (!state.detectorRules) state.detectorRules = [];
    container.innerHTML = state.detectorRules.map((rule) => {
        const conditionsHTML = rule.conditions && rule.conditions.length > 0
            ? rule.conditions.map((cond, condIndex) => renderCondition(cond, condIndex, rule.conditions.length)).join('')
            : '<p class="text-sm text-gray-500 px-1">No conditions yet. Click "+ Add Condition" to start.</p>';
        
        return `
        <div class="bg-gray-800/60 p-4 rounded-lg ring-1 ring-gray-700 space-y-4" data-rule-id="${rule.id}">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-4 flex-grow">
                    <input type="text" value="${rule.name}" class="modal-input rule-name w-1/3 text-base font-semibold" placeholder="Rule Name">
                    <div class="rule-color-picker flex items-center gap-2" data-color="${rule.color}">
                        <input type="hidden" class="rule-color-input" value="${rule.color}">
                        ${['red', 'green', 'yellow', 'blue', 'gray'].map(c => `
                            <button type="button" class="color-swatch w-6 h-6 rounded-full transition flex items-center justify-center ${rule.color === c ? 'selected' : ''}" data-color="${c}" style="background-color: ${c};" title="${c}">
                                ${rule.color === c ? '<i class="fas fa-check text-white text-sm"></i>' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <button class="remove-rule-btn icon-btn hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400"><i class="fas fa-trash"></i></button>
            </div>
            <div class="conditions-container space-y-3">${conditionsHTML}</div>
            <button class="add-condition-btn text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-2"><i class="fas fa-plus-circle"></i> Add Condition</button>
        </div>`;
    }).join('') || `<div class="text-center py-8 text-gray-500">No rules defined. Click "Add New Rule" to start.</div>`;

    document.querySelectorAll('.rule-specific-team').forEach(teamSelect => {
        const condWrapper = teamSelect.closest('.condition-wrapper');
        const rule = state.detectorRules.find(r => r.id == condWrapper.closest('[data-rule-id]').dataset.ruleId);
        const cond = rule.conditions[condWrapper.dataset.condIndex];
        updateRuleRecruiterDropdown(teamSelect, cond.specificRecruiter);
    });
}

// --- JAVASCRIPT (js/modals.js) - START of renderCondition ---

// --- JAVASCRIPT (js/modals.js) - START of renderCondition ---

function renderCondition(cond, index, totalConditions) {
    const isFixed = cond.valueType === 'fixed';
    const isPercentile = cond.valueType === 'percentile';
    const isTimeBasedComparison = cond.dateContext !== 'current';
    const showSpecificFilters = isTimeBasedComparison && cond.peerGroup === 'specific_filters';
    const isLast = index === totalConditions - 1;

    const specificFiltersHTML = `
        <div class="specific-filters-wrapper mt-2 ${showSpecificFilters ? '' : 'hidden'}">
             <div class="p-3 bg-gray-900/40 rounded-md border border-gray-700/50">
                 <div class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                     <div>
                         <label class="block text-xs font-medium text-gray-400 mb-1">Data Type</label>
                         <select class="modal-select rule-specific-data-type w-full text-xs !p-2">
                             <option value="stub" ${cond.specificDataType === 'stub' ? 'selected' : ''}>Stub</option>
                             <option value="aggregated" ${cond.specificDataType === 'aggregated' ? 'selected' : ''}>Aggregated</option>
                         </select>
                     </div>
                     <div><label class="block text-xs font-medium text-gray-400 mb-1">Company</label><select class="modal-select rule-specific-company w-full text-xs !p-2">${getSpecificFilterOptions('company_name', cond.specificCompany, null)}</select></div>
                     <div><label class="block text-xs font-medium text-gray-400 mb-1">Contract</label><select class="modal-select rule-specific-contract w-full text-xs !p-2">${getSpecificFilterOptions('contract_type', cond.specificContract, null)}</select></div>
                     <div><label class="block text-xs font-medium text-gray-400 mb-1">Team</label><select class="modal-select rule-specific-team w-full text-xs !p-2">${getSpecificFilterOptions('team_name', cond.specificTeam, 'All Teams')}</select></div>
                     <div><label class="block text-xs font-medium text-gray-400 mb-1">Recruiter</label><select class="modal-select rule-specific-recruiter w-full text-xs !p-2" data-current-value="${cond.specificRecruiter || ''}"></select></div>
                 </div>
             </div>
        </div>`;

    return `
    <div class="condition-wrapper" data-cond-index="${index}">
        <div class="bg-gray-900/70 p-3 rounded-lg ring-1 ring-gray-700/50 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
                <select class="modal-select rule-field flex-grow-[2] basis-48">${detectorFields.map(f => `<option value="${f.id}" ${cond.field === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}</select>
                <select class="modal-select rule-operator flex-grow basis-24">${['>', '<', '=', '>=', '<=', '!='].map(op => `<option value="${op}" ${cond.operator === op ? 'selected' : ''}>${op}</option>`).join('')}</select>
                <select class="modal-select rule-value-type flex-grow-[2] basis-40">${['fixed', 'sum', 'average', 'median', 'min', 'max', 'percentile'].map(v => `<option value="${v}" ${v === cond.valueType ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}</select>
                <div class="flex items-center gap-2 flex-grow basis-28">
                    <input type="number" value="${cond.value}" class="modal-input rule-value w-full ${isFixed ? '' : 'hidden'}">
                    <div class="flex items-center gap-1 rule-percentile-wrapper w-full ${isPercentile ? '' : 'hidden'}">
                        <input type="number" value="${cond.percentile || 90}" class="modal-input rule-percentile w-full"><span class="text-sm text-gray-400">%</span>
                    </div>
                </div>
                <button class="remove-condition-btn icon-btn ml-auto"><i class="fas fa-times"></i></button>
            </div>
            <div class="flex flex-wrap items-center gap-2 rule-context-wrapper ${isFixed ? '' : ''}">
                 <select class="modal-select rule-date-context flex-1 basis-60">
                     <option value="current" ${cond.dateContext === 'current' ? 'selected' : ''}>vs Current View</option>
                     <option value="dateSelected" ${cond.dateContext === 'dateSelected' ? 'selected' : ''}>vs Date Selected</option>
                     <option disabled>---</option>
                     <option value="all" ${cond.dateContext === 'all' ? 'selected' : ''}>vs All Time</option>
                     <option value="yesterday" ${cond.dateContext === 'yesterday' ? 'selected' : ''}>vs Yesterday</option>
                     <option value="7days" ${cond.dateContext === '7days' ? 'selected' : ''}>vs Prev 7 Days</option>
                     <option value="30days" ${cond.dateContext === '30days' ? 'selected' : ''}>vs Prev 30 Days</option>
                 </select>
                 <select class="modal-select rule-peer-group flex-1 basis-60 ${isTimeBasedComparison ? '' : 'hidden'}">
                     <option value="current_view_filters" ${cond.peerGroup === 'current_view_filters' ? 'selected' : ''}>for Current View Filters</option>
                     <option value="specific_filters" ${cond.peerGroup === 'specific_filters' ? 'selected' : ''}>for Specific Filters Below</option>
                 </select>
            </div>
            ${specificFiltersHTML}
        </div>
        ${!isLast ? `<div class="flex justify-center my-3"><button class="op-toggle ${cond.nextOperator === 'OR' ? 'or' : 'and'} rule-logic">${cond.nextOperator === 'OR' ? 'OR' : 'AND'}</button></div>` : ''}
    </div>`;
}

// --- JAVASCRIPT (js/modals.js) - END of renderCondition ---
        
// --- JAVASCRIPT (js/modals.js) - START of getSpecificFilterOptions ---

function getSpecificFilterOptions(key, selectedValue, placeholder) {
    const values = [...new Set(state.allData.map(d => d[key]).filter(Boolean))].sort();
    let html = '';
    if (placeholder) {
        html += `<option value="">${placeholder}</option>`;
    }
    html += values.map(v => `<option value="${v}" ${v === selectedValue ? 'selected' : ''}>${v}</option>`).join('');
    return html;
}

// --- JAVASCRIPT (js/modals.js) - END of getSpecificFilterOptions ---

function updateRuleRecruiterDropdown(teamSelectElement, currentRecruiterValue) {
    const selectedTeam = teamSelectElement.value;
    const condWrapper = teamSelectElement.closest('.condition-wrapper');
    const recruiterSelect = condWrapper.querySelector('.rule-specific-recruiter');

    const recruiters = selectedTeam
        ? [...new Set(state.allData.filter(d => d.team_name === selectedTeam).map(d => d.recruiter_name))].sort()
        : [...new Set(state.allData.map(d => d.recruiter_name))].sort();

    let optionsHTML = `<option value="">All Recruiters</option>`;
    optionsHTML += recruiters.map(r => `<option value="${r}" ${r === currentRecruiterValue ? 'selected' : ''}>${r}</option>`).join('');
    recruiterSelect.innerHTML = optionsHTML;
    if(!recruiters.includes(currentRecruiterValue)){
         recruiterSelect.value = '';
    }
}

// --- CHART MODAL ---

export function openChartModal(recruiterName) {
    document.getElementById('chartModalTitle').textContent = `${recruiterName}, Historical`;
    
    const recruiterSpecificData = state.allData.filter(d => d.recruiter_name === recruiterName);
    const contracts = [...new Set(recruiterSpecificData.map(d => d.contract_type).filter(Boolean))].sort();
    const companies = [...new Set(recruiterSpecificData.map(d => d.company_name).filter(Boolean))].sort();
    
    const chartContractFilter = document.getElementById('chartContractFilter');
    chartContractFilter.innerHTML = contracts.map(c => `<option value="${c}">${c}</option>`).join('');
    if (contracts.length > 0) chartContractFilter.value = contracts[0];

    const chartCompanyFilter = document.getElementById('chartCompanyFilter');
    chartCompanyFilter.innerHTML = companies.map(c => `<option value="${c}">${c}</option>`).join('');
    if (companies.length > 0) chartCompanyFilter.value = companies[0];

    openModal('chartModal');
    renderTrendChart(recruiterName);
}

function renderTrendChart(recruiterName) {
    const chartMode = document.getElementById('chartViewStubBtn').classList.contains('active') ? 'stub' : 'aggregated';
    const contract = document.getElementById('chartContractFilter').value;
    const company = document.getElementById('chartCompanyFilter').value;
            
    let recruiterData = state.allData.filter(d => 
        d.recruiter_name === recruiterName &&
        (!contract || d.contract_type === contract) &&
        (!company || d.company_name === company)
    );
    recruiterData.sort((a,b) => a.date - b.date);

    let labels = [];
    let datasets = {
        unique_phone_reveals: [], calls_per_reveal: [], sms_per_reveal: [], duration_per_reveal: []
    };

    // ... (rest of data preparation logic is unchanged)
    if (chartMode === 'stub') {
        recruiterData.forEach(row => {
            labels.push(row.date);
            datasets.unique_phone_reveals.push(row.unique_phone_reveals);
            datasets.calls_per_reveal.push(row.unique_phone_reveals > 0 ? (row.unique_calls / row.unique_phone_reveals) : 0);
            datasets.sms_per_reveal.push(row.unique_phone_reveals > 0 ? (row.unique_sms / row.unique_phone_reveals) : 0);
            datasets.duration_per_reveal.push(row.unique_phone_reveals > 0 ? (row.call_duration_seconds / row.unique_phone_reveals) : 0);
        });
    } else { 
        const getStartOfWeek = (d) => { const date = new Date(d); const day = date.getDay(); const diff = date.getDate() - day + (day === 0 ? -6 : 1); return new Date(date.setDate(diff)); };
        const weeklyData = new Map();
        recruiterData.forEach(row => {
            const weekStart = getStartOfWeek(row.date).toISOString().split('T')[0];
            if (!weeklyData.has(weekStart)) {
                weeklyData.set(weekStart, { date: new Date(weekStart), unique_phone_reveals: 0, unique_calls: 0, unique_sms: 0, call_duration_seconds: 0 });
            }
            const week = weeklyData.get(weekStart);
            week.unique_phone_reveals += row.unique_phone_reveals;
            week.unique_calls += row.unique_calls;
            week.unique_sms += row.unique_sms;
            week.call_duration_seconds += row.call_duration_seconds;
        });
        
        const sortedWeeks = Array.from(weeklyData.values()).sort((a,b) => a.date - b.date);
        sortedWeeks.forEach(week => {
            labels.push(week.date);
            datasets.unique_phone_reveals.push(week.unique_phone_reveals);
            datasets.calls_per_reveal.push(week.unique_phone_reveals > 0 ? (week.unique_calls / week.unique_phone_reveals) : 0);
            datasets.sms_per_reveal.push(week.unique_phone_reveals > 0 ? (week.unique_sms / week.unique_phone_reveals) : 0);
            datasets.duration_per_reveal.push(week.unique_phone_reveals > 0 ? (week.call_duration_seconds / week.unique_phone_reveals) : 0);
        });
    }
    
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (state.trendChart) {
        state.trendChart.destroy();
    }
    state.trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Unique Reveals', data: datasets.unique_phone_reveals, borderColor: 'rgb(59, 130, 246)', tension: 0.1, yAxisID: 'y' },
                { label: 'Calls/Reveal', data: datasets.calls_per_reveal, borderColor: 'rgb(234, 179, 8)', tension: 0.1, yAxisID: 'y1' },
                { label: 'SMS/Reveal', data: datasets.sms_per_reveal, borderColor: 'rgb(34, 197, 94)', tension: 0.1, yAxisID: 'y1' },
                { label: 'Duration/Reveal', data: datasets.duration_per_reveal, borderColor: 'rgb(239, 68, 68)', tension: 0.1, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: {
                x: { type: 'time', time: { unit: chartMode === 'stub' ? 'day' : 'week', tooltipFormat: 'P' } },
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Reveals' } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Ratios' }, grid: { drawOnChartArea: false } }
            },
            // *** THIS SECTION IS UPDATED TO HIDE LABELS AND STYLE THE LEGEND ***
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                    }
                },
                datalabels: {
                    display: false // Explicitly disable labels for this chart
                }
            }
        }
    });
}


// Listeners specific to the modals
// --- JAVASCRIPT (js/modals.js) - START of addModalEventListeners ---

// --- JAVASCRIPT (js/modals.js) - START of addModalEventListeners ---

export function addModalEventListeners() {
    // Settings Modal
    document.getElementById('applyAndSaveBtn').addEventListener('click', handleSettingsSave);
    document.getElementById('closeSettingsModalBtn').addEventListener('click', () => closeModal('settingsModal'));
    document.getElementById('addRuleBtn').addEventListener('click', () => {
        updateRulesFromDOM();
        state.detectorRules.push({ id: Date.now(), name: 'New Rule', color: 'gray', conditions: [] });
        renderRules();
    });
    
    const settingsModal = document.getElementById('settingsModal');

    settingsModal.querySelectorAll('.settings-nav-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = button.getAttribute('href').substring(1);
            settingsModal.querySelectorAll('.settings-nav-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            settingsModal.querySelectorAll('.settings-section').forEach(section => {
                section.classList.toggle('hidden', section.id !== targetId);
            });
        });
    });

    // Delegated event listener for the entire settings modal content
    settingsModal.addEventListener('click', e => {
        const ruleEl = e.target.closest('[data-rule-id]');
        
        // --- Rule-level actions ---
        if (ruleEl) {
            if (e.target.closest('.remove-rule-btn')) {
                updateRulesFromDOM();
                state.detectorRules = state.detectorRules.filter(r => r.id != ruleEl.dataset.ruleId);
                renderRules();
            }
            if (e.target.matches('.add-condition-btn')) {
                updateRulesFromDOM();
                const rule = state.detectorRules.find(r => r.id == ruleEl.dataset.ruleId);
                if(rule && !rule.conditions) rule.conditions = [];
                // --- THIS IS THE FIX: Changed default values for a new condition ---
                rule.conditions.push({ 
                    field: 'unique_phone_reveals', 
                    operator: '>', 
                    valueType: 'fixed', // Default to 'fixed'
                    value: 100, 
                    percentile: 90, 
                    dateContext: 'current', // Default to 'current'
                    peerGroup: 'current_view_filters', // Default to 'current_view_filters'
                    nextOperator: 'AND',
                    specificTeam: '',
                    specificRecruiter: '',
                    specificCompany: 'ALL',
                    specificContract: 'ALL',
                    specificDataType: 'aggregated',
                });
                renderRules();
            }
            if(e.target.classList.contains('color-swatch')) {
                const newColor = e.target.dataset.color;
                const colorPicker = e.target.closest('.rule-color-picker');
                colorPicker.querySelector('.rule-color-input').value = newColor;
                colorPicker.querySelectorAll('.color-swatch').forEach(swatch => {
                    swatch.classList.remove('selected');
                    swatch.innerHTML = '';
                });
                e.target.classList.add('selected');
                e.target.innerHTML = '<i class="fas fa-check text-white text-sm"></i>';
            }
        }

        // --- Condition-level actions ---
        const condWrapper = e.target.closest('.condition-wrapper');
        if (condWrapper) {
            if (e.target.closest('.remove-condition-btn')) {
                 updateRulesFromDOM();
                 const rule = state.detectorRules.find(r => r.id == condWrapper.closest('[data-rule-id]').dataset.ruleId);
                 rule.conditions.splice(condWrapper.dataset.condIndex, 1);
                 renderRules();
            }
            if (e.target.matches('.rule-logic')) {
                 e.target.textContent = e.target.textContent === 'AND' ? 'OR' : 'AND';
                 e.target.classList.toggle('and');
                 e.target.classList.toggle('or');
            }
        }
    });

    settingsModal.addEventListener('change', e => {
        const condWrapper = e.target.closest('.condition-wrapper');
        if (!condWrapper) return;

        const valueInput = condWrapper.querySelector('.rule-value');
        const percentileWrapper = condWrapper.querySelector('.rule-percentile-wrapper');
        const contextWrapper = condWrapper.querySelector('.rule-context-wrapper');
        const peerGroupSelect = condWrapper.querySelector('.rule-peer-group');
        const specificFiltersWrapper = condWrapper.querySelector('.specific-filters-wrapper');
        
        if (e.target.matches('.rule-value-type')) {
            const isFixed = e.target.value === 'fixed';
            const isPercentile = e.target.value === 'percentile';

            valueInput.classList.toggle('hidden', !isFixed);
            percentileWrapper.classList.toggle('hidden', !isPercentile);
            contextWrapper.classList.toggle('hidden', isFixed);

            if (isFixed) {
                peerGroupSelect.classList.add('hidden');
                specificFiltersWrapper.classList.add('hidden');
            } else {
                 peerGroupSelect.classList.toggle('hidden', condWrapper.querySelector('.rule-date-context').value === 'current');
            }
        }

        if(e.target.matches('.rule-date-context')) {
            const isTimeBased = e.target.value !== 'current';
            peerGroupSelect.classList.toggle('hidden', !isTimeBased);
            if (!isTimeBased) {
                 specificFiltersWrapper.classList.add('hidden');
            } else {
                 specificFiltersWrapper.classList.toggle('hidden', peerGroupSelect.value !== 'specific_filters');
            }
        }
        
        if(e.target.matches('.rule-peer-group')) {
            specificFiltersWrapper.classList.toggle('hidden', e.target.value !== 'specific_filters');
        }

        if(e.target.matches('.rule-specific-team')) {
            updateRuleRecruiterDropdown(e.target, '');
        }
    });
    
    // Chart Modal
    document.getElementById('closeChartModalBtn').addEventListener('click', () => {
        if(state.trendChart) state.trendChart.destroy();
        closeModal('chartModal');
    });

    const chartModal = document.getElementById('chartModal');
    ['chartViewStubBtn', 'chartViewAggregatedBtn', 'chartContractFilter', 'chartCompanyFilter'].forEach(id => {
        const element = chartModal.querySelector(`#${id}`);
        if (!element) return;
        const eventType = id.includes('Btn') ? 'click' : 'change';
        
        element.addEventListener(eventType, () => {
            if(id.includes('Btn')) {
                chartModal.querySelector('#chartViewStubBtn').classList.toggle('active', id === 'chartViewStubBtn');
                chartModal.querySelector('#chartViewAggregatedBtn').classList.toggle('active', id === 'chartViewAggregatedBtn');
            }
            renderTrendChart(document.getElementById('chartModalTitle').textContent.split(',')[0]);
        });
    });

    // Universal ESC key listener for all modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) { // Check for Escape key
            const modals = ['rankingsSettingsModal', 'rankingWeightsModal', 'chartModal', 'settingsModal', 'detailedBreakdownModal'];
            for (const modalId of modals) {
                const modal = document.getElementById(modalId);
                if (modal && !modal.classList.contains('hidden')) {
                    closeModal(modalId);
                    // If it's the detailedBreakdownModal, also clear carousel timers
                    if (modalId === 'detailedBreakdownModal') {
                        // Assuming carouselTimers are managed in rankingsView.js
                        // This would need a way to access/clear them from here
                        // For now, let's just close the modal.
                        // (Alternatively, rankingsView.js close function could be exposed)
                    }
                    break; // Close only one modal at a time (the top-most one)
                }
            }
        }
    });
}

// --- JAVASCRIPT (js/modals.js) - END of addModalEventListeners ---