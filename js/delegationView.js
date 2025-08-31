import { state as appState } from './state.js'; // Import the main app state
import { calculateRankings } from './rankingsView.js';
import { formatDuration, getSelectedValues } from './ui.js';

let activeTooltip = null;

// --- LOCAL STATE & SETTINGS ---
const state = {
    currentView: 'master',
    currentEntity: 'team',
    leadType: 'new_and_old',
    sortConfig: { key: 'entity', direction: 'asc' },
    cachedData: {
        team: null,
        profiler: null,
        contractRanks: new Map() // Cache for contract-specific ranks
    },
    settings: {
        contracts: [],
        groups: [],
        visibility: {},
        targets: {
            team: {},
            profiler: {}
        }
    },
    activation: {
        teams: [],
        profilers: [],
        matrix: {}
    }
};

function generateProjectedLeadsBreakdownString(companyBreakdowns) {
    const breakdownParts = [];
    const sortedCompanies = Object.keys(companyBreakdowns).sort();

    for (const company of sortedCompanies) {
        const contracts = companyBreakdowns[company]
            .filter(b => b.projLeads > 0) // Only show contracts with projected leads
            .map(b => `${b.name} (${b.projDel.toFixed(0)}%)`);

        if (contracts.length > 0) {
            // This line adds the new color class to the company name
            const companyClass = `company-color-text-${company.toLowerCase().replace(/\s+/g, '-')}`;
            breakdownParts.push(`<span class="font-semibold ${companyClass}">${company}:</span> ${contracts.join(', ')}`);
        }
    }
    // This line creates a more separated look
    return breakdownParts.join('<span class="mx-4 text-gray-700 font-light">|</span>');
}

// --- SETTINGS PERSISTENCE ---
function saveSettings() {
    localStorage.setItem('delegationSettings', JSON.stringify(state.settings));
    localStorage.setItem('delegationActivation', JSON.stringify(state.activation.matrix));
}

function loadSettings() {
    const savedSettings = localStorage.getItem('delegationSettings');
    const savedActivation = localStorage.getItem('delegationActivation');

    if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        // Ensure the new nested structure exists
        if (!parsedSettings.targets || !parsedSettings.targets.team) {
            parsedSettings.targets = { team: {}, profiler: {} };
        }
        state.settings = parsedSettings;
    }
    if (savedActivation) {
        state.activation.matrix = JSON.parse(savedActivation);
    }
}

// --- DYNAMIC DATA & CALCULATION FUNCTIONS ---
function generateSettingsFromState() {
    // --- Use Default Contract List ---
    const allContracts = ['ALL', 'CPM', 'CPML', 'LOO', 'LPOO', 'MCLOO', 'MCOO', 'OO', 'POG', 'TCPM', 'TCPML'];
    
    const combinedData = [...appState.allData, ...appState.drugTestsData];
    const allTeams = [...new Set(combinedData.map(d => d.team_name).filter(d => d && d !== 'Profilers'))];
    const allProfilers = [...new Set(combinedData.filter(d => d.team_name === 'Profilers').map(d => d.recruiter_name).filter(Boolean))];

    state.settings.contracts = allContracts.map((c, i) => ({ id: `c${i}`, name: c }));
    state.activation.teams = allTeams.map((t, i) => ({ id: `t${i}`, name: t }));
    state.activation.profilers = allProfilers.map((p, i) => ({ id: `p${i}`, name: p }));

    state.settings.contracts.forEach(c => {
        if (state.settings.visibility[c.id] === undefined) {
            state.settings.visibility[c.id] = true;
        }
    });
    
    state.settings.groups.forEach(g => {
        if (state.settings.visibility[g.id] === undefined) {
            state.settings.visibility[g.id] = true;
        }
    });
}

function calculateDataForEntityType(entityType) {
    const entities = entityType === 'team'
        ? state.activation.teams
        : state.activation.profilers;

    const dateFilterInputs = document.querySelectorAll('#delegationView #date-filters input[type="date"]');
    const fromDate = new Date(dateFilterInputs[0].value);
    const toDate = new Date(new Date(dateFilterInputs[1].value).getTime() + (24 * 60 * 60 * 1000 - 1));
    const allTeamData = [...appState.allData, ...appState.drugTestsData, ...appState.mvrPspCdlData, ...appState.recruiterData, ...appState.profilerData];
    const validTeams = [...new Set(allTeamData.map(d => d.team_name).filter(t => t && t !== 'Profilers'))];

    // --- RANK SCORE CALCULATION (Global) ---
    const entityTypeFilter = (row) => {
        if (entityType === 'profiler') {
            return row.team_name === 'Profilers';
        }
        return validTeams.includes(row.team_name);
    };

    const dateFilter = (row) => {
        const rowDate = new Date(row.date);
        if (isNaN(rowDate.getTime())) return false;
        return rowDate >= fromDate && rowDate <= toDate;
    };

    // --- FIX START ---

    // 1. Re-define the standardFilter to be used by multiple data sources.
    const standardFilter = (row) => {
        if (!dateFilter(row)) return false;
        return row.company_name === 'ALL' && row.contract_type === 'ALL';
    };

    // 2. Pre-filter the leadRisk data to get the correct levels based on the mode.
    const leadRiskDataForLevel = appState.allData.filter(row => {
        if (entityType === 'team') {
            // For Team mode, get both TEAM for main stats and RECRUITER for the Active Days calculation.
            return row.level === 'TEAM' || row.level === 'RECRUITER';
        }
        // For Profiler mode, we only need RECRUITER level data.
        return row.level === 'RECRUITER';
    });

    // 3. Now apply the standardFilter and entityTypeFilter to the pre-filtered data.
    const performanceDataForRanking = leadRiskDataForLevel.filter(row => standardFilter(row) && entityTypeFilter(row));

    // --- FIX END ---

    const mvrPspCdlRelatedData = appState.mvrPspCdlData.filter(row => standardFilter(row) && entityTypeFilter(row));

    const arrivalsFilter = (row) => {
        if (!dateFilter(row)) return false;
        const companyMatch = ['ALL'].includes('ALL') || ['ALL'].includes(row.company_name);
        const contractMatch = ['ALL'].includes('ALL') || ['ALL'].includes(row.contract_type);
        return companyMatch && contractMatch;
    };

    const arrivalsRelatedData = [...appState.arrivalsData, ...appState.drugTestsData].filter(row => arrivalsFilter(row) && entityTypeFilter(row));
    const pastDueRelatedData = appState.recruiterData.filter(row => dateFilter(row) && entityTypeFilter(row));
    const profilerRelatedData = appState.profilerData.filter(row => dateFilter(row) && entityTypeFilter(row));

    const combinedData = [
        ...performanceDataForRanking,
        ...mvrPspCdlRelatedData,
        ...arrivalsRelatedData,
        ...pastDueRelatedData,
        ...profilerRelatedData
    ];

    const rankedPerformanceData = calculateRankings(combinedData, entityType, ['ALL'], ['ALL']);

    const performanceMap = new Map();
    rankedPerformanceData.forEach(item => {
        performanceMap.set(item.name, {
            rank: item.final_score || 0,
            total_calls: item.original_outbound_calls || 0,
            total_sms: item.original_outbound_sms || 0,
            total_drug_tests: item.total_drug_tests || 0,
            tte_value: item.tte_value,
            leads_reached: item.leads_reached || 0,
            active_days: item.active_days || 0
        });
    });

    // --- 7-DAY HISTORICAL DATA CALCULATION ---
    const sevenDaysAgoCutoff = new Date(toDate);
    sevenDaysAgoCutoff.setDate(sevenDaysAgoCutoff.getDate() - 6);
    sevenDaysAgoCutoff.setHours(0, 0, 0, 0);

    const totalLeadsByContractGroupAcrossAllEntities7d = {};
    const allDataLast7Days = appState.allData.filter(d => {
        const rowDate = new Date(d.date);
        const companyMatch = state.currentView === 'master' || d.company_name === state.currentView;
        return rowDate >= sevenDaysAgoCutoff && rowDate <= toDate && companyMatch;
    });

    state.settings.contracts.forEach(contract => {
        const contractLeads = allDataLast7Days
            .filter(d => d.contract_type === contract.name)
            .reduce((sum, d) => {
                const leadCount = state.leadType === 'hot' ? d.hot_leads_assigned : (d.new_leads_assigned_on_date || 0) + (d.old_leads_assigned_on_date || 0);
                return sum + leadCount;
            }, 0);
        totalLeadsByContractGroupAcrossAllEntities7d[contract.name] = contractLeads;
    });

    state.settings.groups.forEach(group => {
        let groupLeads = 0;
        group.contractIds.forEach(contractId => {
            const contract = state.settings.contracts.find(c => c.id === contractId);
            if (contract) {
                groupLeads += totalLeadsByContractGroupAcrossAllEntities7d[contract.name] || 0;
            }
        });
        totalLeadsByContractGroupAcrossAllEntities7d[group.name] = groupLeads;
    });

    // --- FINAL DATA MAPPING ---
    const entitiesData = entities.map(entity => {
        const entityName = entity.name;
        const performanceData = performanceMap.get(entityName) || { rank: 0, total_calls: 0, total_sms: 0, total_drug_tests: 0, tte_value: null, leads_reached: 0, active_days: 0 };

        const entityData = {
            entity: entityName,
            rank: performanceData.rank,
            total_calls: performanceData.total_calls,
            total_sms: performanceData.total_sms,
            total_drug_tests: performanceData.total_drug_tests,
            tte_value: performanceData.tte_value,
            leads_reached: performanceData.leads_reached,
            active_days: performanceData.active_days,
            leads7d: { total: 0, daily: Array(7).fill(0) },
            contracts: {}
        };

        const relevantHistory = allDataLast7Days.filter(d => {
            const rowEntity = entityType === 'team' ? d.team_name : d.recruiter_name;
            return rowEntity === entityName;
        });

        relevantHistory.forEach(d => {
            const dayIndex = (new Date(d.date).getDay() - sevenDaysAgoCutoff.getDay() + 7) % 7;
            const leadCount = state.leadType === 'hot' ? d.hot_leads_assigned : (d.new_leads_assigned_on_date || 0) + (d.old_leads_assigned_on_date || 0);
            if (d.contract_type === 'ALL') {
                entityData.leads7d.total += leadCount;
                entityData.leads7d.daily[dayIndex] += leadCount;
            }
            const contractInfo = state.settings.contracts.find(c => c.name === d.contract_type);
            if (contractInfo) {
                if (!entityData.contracts[contractInfo.name]) {
                    entityData.contracts[contractInfo.name] = { avg: 0, hist: 0, daily: Array(7).fill(0), count: 0 };
                }
                entityData.contracts[contractInfo.name].daily[dayIndex] += leadCount;
                entityData.contracts[contractInfo.name].count += leadCount;
            }
        });

        Object.values(entityData.contracts).forEach(c => { c.avg = c.count / 7; });
        return entityData;
    });

    return {
        entitiesData: entitiesData,
        totalLeadsByContractGroupAcrossAllEntities7d: totalLeadsByContractGroupAcrossAllEntities7d,
        sevenDaysAgoCutoff: sevenDaysAgoCutoff
    };
}

function updateLeadTypeSwitcherVisibility() {
    const switcherContainer = document.getElementById('lead-type-switcher-container');
    if (switcherContainer) {
        const isVisible = state.currentView !== 'master' && state.currentEntity === 'team';
        switcherContainer.style.display = isVisible ? 'block' : 'none';
    }
}

function calculateAndCacheAllData() {
    console.log("Recalculating base delegation data...");
    state.cachedData.team = calculateDataForEntityType('team');
    state.cachedData.profiler = calculateDataForEntityType('profiler');
}


function sortDelegationData(data) {
    const { key, direction } = state.sortConfig;
    if (!key) return data;

    const dir = direction === 'asc' ? 1 : -1;
    
    const getValue = (obj, path) => {
        const parts = path.split('.');
        let value = obj;
        for (let i = 0; i < parts.length; i++) {
            const keyPart = parts[i].replace(/\[(.*?)\]/, '$1');
            if (value && typeof value === 'object') {
                value = value[keyPart];
            } else {
                return undefined;
            }
        }
        return value;
    };

    data.sort((a, b) => {
        const valA = getValue(a, key);
        const valB = getValue(b, key);

        if (valA === null || valA === undefined) return 1 * dir;
        if (valB === null || valB === undefined) return -1 * dir;
        
        if (typeof valA === 'number' && typeof valB === 'number') {
            return (valA - valB) * dir;
        }

        return String(valA).localeCompare(String(valB)) * dir;
    });
    
    return data;
}

function getContractsActiveInMatrix(companyName, entityType) {
    const entities = entityType === 'team' ? state.activation.teams : state.activation.profilers;
    const companyMatrix = state.activation.matrix[companyName] || {};

    // --- FIX START: Filter by visibility first ---
    // 1. Get only the contracts and groups that are toggled ON in the settings.
    const visibleContracts = state.settings.contracts.filter(c => state.settings.visibility[c.id] && c.name.toUpperCase() !== 'ALL');
    const visibleGroups = state.settings.groups.filter(g => state.settings.visibility[g.id]);
    // --- FIX END ---

    const activeItems = [];
    
    // 2. From that smaller list of VISIBLE contracts, check which ones are active in the matrix.
    visibleContracts.forEach(contract => {
        const hasActiveEntity = entities.some(entity => {
            const matrixKey = `${entity.id}_${contract.id}`;
            return companyMatrix[matrixKey] === true;
        });
        if (hasActiveEntity) {
            activeItems.push(contract);
        }
    });

    // 3. From that smaller list of VISIBLE groups, check which ones are active in the matrix.
    visibleGroups.forEach(group => {
        const hasActiveEntity = entities.some(entity => {
            const matrixKey = `${entity.id}_${group.id}`;
            return companyMatrix[matrixKey] === true;
        });
        if (hasActiveEntity) {
            activeItems.push(group);
        }
    });

    return activeItems;
}

function handleSortClick(e) {
    const header = e.target.closest('th[data-sort-key]');
    if (!header) return;

    const key = header.dataset.sortKey;

    if (state.sortConfig.key === key) {
        state.sortConfig.direction = state.sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortConfig.key = key;
        state.sortConfig.direction = 'asc';
    }

    renderTable();
}


// --- RENDERING FUNCTIONS ---
function renderGroupEditor(group = null) {
    const isNew = group === null;
    const groupData = isNew ? { id: `new_${Date.now()}`, name: '', contractIds: [] } : { ...group };

    const container = document.getElementById('contractGroupsContainer');
    if (container.querySelector('p')) container.innerHTML = '';
    
    if (isNew && container.querySelector('.contract-group-editor[data-group-id^="new_"]')) return;

    const editorHtml = `
        <div class="contract-group-editor p-4 bg-gray-700 rounded-lg space-y-3" data-group-id="${groupData.id}">
            <input type="text" class="modal-input w-full group-name-input" value="${groupData.name}" placeholder="Enter Group Name">
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                ${state.settings.contracts
                    .filter(c => c.name.toUpperCase() !== 'ALL')
                    .map(c => `
                    <label class="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-600/50">
                        <input type="checkbox" value="${c.id}" class="h-4 w-4 rounded border-gray-500 bg-gray-800 text-blue-600 focus:ring-blue-500"
                            ${groupData.contractIds.includes(c.id) ? 'checked' : ''}>
                        <span class="text-sm text-gray-300">${c.name}</span>
                    </label>
                `).join('')}
            </div>
            <div class="text-right space-x-2">
                <button class="text-sm text-gray-400 hover:text-white cancel-group-btn">Cancel</button>
                <button class="text-sm font-semibold text-blue-400 hover:text-blue-300 save-group-btn">Save Group</button>
            </div>
        </div>
    `;
    
    const oldEditor = container.querySelector(`.contract-group-item[data-group-id="${groupData.id}"]`);
    if (oldEditor) {
        oldEditor.outerHTML = editorHtml;
    } else {
        container.insertAdjacentHTML('beforeend', editorHtml);
    }
}

function renderColumnManagement() {
    const groupsContainer = document.getElementById('contractGroupsContainer');
    const visibilityContainer = document.getElementById('columnVisibilityContainer');

    groupsContainer.innerHTML = state.settings.groups.map(g => {
        const contractNames = g.contractIds.map(id => state.settings.contracts.find(c => c.id === id)?.name).join(', ');
        return `
            <div class="contract-group-item" data-group-id="${g.id}">
                <div>
                    <div class="group-name">${g.name}</div>
                    <div class="group-contracts">${contractNames || 'No contracts selected'}</div>
                </div>
                <div class="group-actions">
                    <button title="Edit Group" class="edit-group-btn"><i class="fas fa-pen"></i></button>
                    <button title="Delete Group" class="delete-group-btn"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');
    if (state.settings.groups.length === 0) {
        groupsContainer.innerHTML = `<p class="text-gray-500 text-sm">No groups created yet.</p>`;
    }

    const contractsHtml = state.settings.contracts
        .filter(c => c.name.toUpperCase() !== 'ALL')
        .map(c => `
        <div class="visibility-list-item">
            <span class="font-medium">${c.name} (Contract)</span>
            <label class="toggle-switch">
                <input type="checkbox" data-key="${c.id}" class="visibility-toggle" ${state.settings.visibility[c.id] ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
    `).join('');

    const groupsHtml = state.settings.groups.map(g => `
        <div class="visibility-list-item">
            <span class="font-medium">${g.name} (Group)</span>
            <label class="toggle-switch">
                <input type="checkbox" data-key="${g.id}" class="visibility-toggle" ${state.settings.visibility[g.id] ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
    `).join('');

    visibilityContainer.innerHTML = contractsHtml + (groupsHtml ? `<hr class="border-gray-700 my-3">${groupsHtml}` : '');
}

function renderActivationMatrix() {
    const managerContainer = document.getElementById('activationManagerContainer');
    if (!managerContainer) return;

    const entityType = document.querySelector('.matrix-entity-switcher.active')?.dataset.entity || 'team';
    const entities = entityType === 'team' ? state.activation.teams : state.activation.profilers;
    const allCompanies = [...new Set(appState.allData.map(d => d.company_name).filter(c => c && c !== 'ALL'))];

    if (!state.activation.selectedCompany || !allCompanies.includes(state.activation.selectedCompany)) {
        state.activation.selectedCompany = allCompanies.length > 0 ? allCompanies[0] : null;
    }
    const selectedCompany = state.activation.selectedCompany;

    const companyTabsContainer = managerContainer.querySelector('.company-switcher-tabs');
    if (companyTabsContainer) {
        companyTabsContainer.innerHTML = allCompanies.map(company => `
            <button class="company-tab-btn ${company === selectedCompany ? 'active' : ''}" data-company="${company}">
                ${company}
            </button>
        `).join('');
    }

    const entityListContainer = document.getElementById('entity-list-container');
    const searchInput = document.getElementById('entitySearchInput');
    const searchTerm = (searchInput.value || '').toLowerCase();
    const showInactive = document.getElementById('showInactiveCheckbox').checked;

    if (entityListContainer && selectedCompany) {
        const companyMatrix = state.activation.matrix[selectedCompany] || {};
        const allItems = [...state.settings.contracts, ...state.settings.groups].filter(item => item.name.toUpperCase() !== 'ALL');

        let filteredEntities = entities.map(entity => {
            const activeCount = allItems.reduce((count, item) => {
                const matrixKey = `${entity.id}_${item.id}`;
                return companyMatrix[matrixKey] === true ? count + 1 : count;
            }, 0);
            return { ...entity, activeCount };
        });

        if (!showInactive) {
            filteredEntities = filteredEntities.filter(e => e.activeCount > 0);
        }
        if (searchTerm) {
            filteredEntities = filteredEntities.filter(e => e.name.toLowerCase().includes(searchTerm));
        }

        entityListContainer.innerHTML = filteredEntities.map(entity => `
            <div class="entity-list-item ${state.activation.selectedEntityId === entity.id ? 'selected' : ''}" data-entity-id="${entity.id}">
                <span class="entity-name">${entity.name}</span>
                <span class="entity-active-count">${entity.activeCount}</span>
            </div>
        `).join('');
    }

    const detailsPanel = document.getElementById('activation-details-panel');
    const detailsPanelContent = detailsPanel?.querySelector('.p-4');
    const bulkActions = document.getElementById('activation-bulk-actions');

    if (detailsPanel && detailsPanelContent) {
        const selectedEntity = entities.find(e => e.id === state.activation.selectedEntityId);
        if (selectedEntity && selectedCompany) {
            renderDetailsPanel(selectedEntity, selectedCompany);
        } else {
            detailsPanelContent.innerHTML = `<p class="text-gray-500 text-center mt-8">Select a ${entityType} from the list to manage contracts.</p>`;
            if (bulkActions) {
                bulkActions.style.display = 'none'; // Hide actions when no entity is selected
            }
        }
    }
}

function renderDetailsPanel(entity, company) {
    const detailsPanel = document.getElementById('activation-details-panel').querySelector('.p-4');
    const bulkActions = document.getElementById('activation-bulk-actions');
    const companyMatrix = state.activation.matrix[company] || {};
    const allItems = [...state.settings.contracts, ...state.settings.groups].filter(item => item.name.toUpperCase() !== 'ALL');

    const activeItems = allItems.filter(item => {
        const matrixKey = `${entity.id}_${item.id}`;
        return companyMatrix[matrixKey] === true;
    });

    const availableItems = allItems.filter(item => !activeItems.find(active => active.id === item.id));

    detailsPanel.innerHTML = `
        <div class="details-header">
            Editing for: <span class="entity-highlight">${entity.name}</span>
        </div>
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Add Contracts / Groups</label>
                <div class="multi-select-container">
                    <button class="modal-input w-full text-left" data-action="toggle-dropdown">Select to add...</button>
                    <div class="multi-select-dropdown">
                        <input type="text" class="multi-select-search-input" placeholder="Search contracts...">
                        <div class="multi-select-list">
                            ${availableItems.map(item => `
                                <label>
                                    <input type="checkbox" data-item-id="${item.id}" class="h-4 w-4 rounded border-gray-500 bg-gray-800 text-blue-600 focus:ring-blue-500 mr-2">
                                    ${item.name}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Active Contracts</label>
                <div class="active-contracts-container">
                    ${activeItems.map(item => `
                        <div class="contract-pill">
                            <span>${item.name}</span>
                            <button class="contract-pill-remove" data-item-id="${item.id}" data-action="remove-contract">&times;</button>
                        </div>
                    `).join('')}
                    ${activeItems.length === 0 ? `<span class="text-gray-500 text-sm">No active contracts for this company.</span>` : ''}
                </div>
            </div>
        </div>
    `;
    
    // Show the bulk action buttons
    if (bulkActions) {
        bulkActions.style.display = 'flex';
    }
}

function renderTable() {
    const delegationTable = document.getElementById('delegation-table');
    if (!delegationTable) return;
    renderTargetsTable();
    if (state.currentView === 'master') { renderMasterView(); } else { renderCompanyView(); }
}

function renderTargetsTable() {
    const container = document.querySelector('#targets-card tbody');
    const tableHeaderRow = document.querySelector('#targets-card thead tr');
    if (!container || !tableHeaderRow) return;

    const dateFilterInputs = document.querySelectorAll('#delegationView #date-filters input[type="date"]');
    const toDateValue = dateFilterInputs[1]?.value;
    let endDateForHistory = new Date();
    if (toDateValue) {
        const [year, month, day] = toDateValue.split('-').map(Number);
        endDateForHistory = new Date(year, month - 1, day);
    }
    endDateForHistory.setHours(23, 59, 59, 999);

    const currentCompanyView = state.currentView;

    let historicalHeaderHtml = '';
    for (let i = 0; i < 10; i++) {
        const currentDate = new Date(endDateForHistory);
        currentDate.setDate(endDateForHistory.getDate() - i);
        const displayDate = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
        historicalHeaderHtml += `<th class="historical-day-header">${displayDate}</th>`;
    }

    tableHeaderRow.innerHTML = `
        <th class="col-contract-name">Contract / Group</th>
        <th>Daily Target</th>
        ${historicalHeaderHtml}
    `;

    const visibleItems = [
        ...state.settings.contracts.filter(c => state.settings.visibility[c.id]),
        ...state.settings.groups.filter(g => state.settings.visibility[g.id])
    ];

    container.innerHTML = visibleItems
        .filter(item => item.name.toUpperCase() !== 'ALL')
        .map(item => {
            // --- THIS IS THE FIX: Select the correct target object ---
            const entityTargets = state.settings.targets[state.currentEntity] || {};
            const companyTargets = entityTargets[currentCompanyView] || {};
            const targetValue = companyTargets[item.id] || 0;

            const historicalCols = [];
            for (let i = 0; i < 10; i++) {
                const currentDate = new Date(endDateForHistory);
                currentDate.setDate(endDateForHistory.getDate() - i);

                const contractNames = item.contractIds 
                    ? item.contractIds.map(id => state.settings.contracts.find(c => c.id === id)?.name)
                    : [item.name];

                // This is the new, modified code
                    const dayTotal = appState.allData
                    .filter(d => {
                        const rowDate = d.date;
                        return rowDate.getFullYear() === currentDate.getFullYear() &&
                            rowDate.getMonth() === currentDate.getMonth() &&
                            rowDate.getDate() === currentDate.getDate() &&
                            contractNames.includes(d.contract_type) &&
                            (!currentCompanyView || currentCompanyView === 'master' || d.company_name === currentCompanyView);
                    })
                    .reduce((sum, d) => {
                        const leadCount = state.leadType === 'hot'
                            ? (d.hot_leads_assigned || 0)
                            : (d.new_leads_assigned_on_date || 0) + (d.old_leads_assigned_on_date || 0);
                        return sum + leadCount;
                    }, 0);

                historicalCols.push(`<td class="historical-day">${dayTotal}</td>`);
            }

            return `
                <tr>
                    <td class="col-contract-name"><strong>${item.name}</strong></td>
                    <td><input type="number" class="target-input" data-key="${item.id}" value="${targetValue}"></td>
                    ${historicalCols.join('')}
                </tr>
            `;
        }).join('');
}

function getEfficiencyClass(value) {
    const deviation = Math.abs(value - 1);
    if (deviation <= 0.20) return 'efficiency-high';
    if (deviation <= 0.40) return 'efficiency-medium';
    return 'efficiency-low';
}

function renderMasterView() {

    const delegationTable = document.getElementById('delegation-table');
    const { entitiesData: calculatedData } = state.cachedData[state.currentEntity] || {};
    const currentCompanyView = state.currentView;
    if (!calculatedData || !Array.isArray(calculatedData)) {
        delegationTable.innerHTML = `<tbody><tr><td colspan="20">No data available.</td></tr></tbody>`;
        return;
    }
    const entityTargets = state.settings.targets[state.currentEntity] || {};
    const companies = [...new Set(appState.allData.map(d => d.company_name).filter(c => c && c !== 'ALL'))];
    const entities = state.currentEntity === 'team' ? state.activation.teams : state.activation.profilers;
    const visibleItems = [
        ...state.settings.contracts.filter(c => state.settings.visibility[c.id]),
        ...state.settings.groups.filter(g => state.settings.visibility[g.id])
    ];

    const dateFilterInputs = document.querySelectorAll('#delegationView #date-filters input[type="date"]');
    const fromDateStr = dateFilterInputs[0].value;
    const toDateStr = dateFilterInputs[1].value;
    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(new Date(toDateStr).getTime() + (24 * 60 * 60 * 1000 - 1)) : null;

    const contractSpecificRanks = new Map();
if (fromDate && toDate) {
    visibleItems.forEach(item => {
        const contractNames = item.contractIds ? item.contractIds.map(id => state.settings.contracts.find(c => c.id === id)?.name) : [item.name];

        // --- CORRECTED DATA AGGREGATION LOGIC ---
        const entityTypeFilter = (row) => state.currentEntity === 'profiler' ? row.team_name === 'Profilers' : row.team_name !== 'Profilers';

        const leadRiskDataForLevel = appState.allData.filter(row => {
            const dateMatch = row.date && new Date(row.date) >= fromDate && new Date(row.date) <= toDate;
            if (!dateMatch || !entityTypeFilter(row)) return false;
            
            if (state.currentEntity === 'team') {
                return row.level === 'TEAM' || row.level === 'RECRUITER';
            }
            return row.level === 'RECRUITER';
        });

        const filteredLeadRiskData = leadRiskDataForLevel.filter(row => {
            const contractMatch = contractNames.includes(row.contract_type);
            const companyMatch = row.company_name === 'ALL';
            return contractMatch && companyMatch;
        });

        const matchesDateAndTeam = (row) => {
            const rowDate = row.date ? new Date(row.date) : null;
            return rowDate && rowDate >= fromDate && rowDate <= toDate && entityTypeFilter(row);
        };
        
        const arrivalsFilter = (row) => matchesDateAndTeam(row) && contractNames.includes(row.contract_type);

        const filteredMvrPspCdlData = appState.mvrPspCdlData.filter(row => matchesDateAndTeam(row) && contractNames.includes(row.contract_type) && row.company_name === 'ALL');
        const filteredPastDueData = appState.recruiterData.filter(matchesDateAndTeam);
        const filteredProfilerData = appState.profilerData.filter(matchesDateAndTeam);
        const filteredArrivalsData = appState.arrivalsData.filter(arrivalsFilter);
        const filteredDrugTestsData = appState.drugTestsData.filter(arrivalsFilter);

        const combinedDataForRank = [
            ...filteredLeadRiskData, ...filteredMvrPspCdlData, ...filteredPastDueData,
            ...filteredProfilerData, ...filteredArrivalsData, ...filteredDrugTestsData
        ];
        // --- END: CORRECTED DATA AGGREGATION LOGIC ---

        const rankedForContract = calculateRankings(combinedDataForRank, state.currentEntity, ['ALL'], contractNames);
        const ranksMap = new Map(rankedForContract.map(r => [r.name, r.final_score]));
        contractSpecificRanks.set(item.id, ranksMap);
    });
}

    const visibleEntities = calculatedData.filter(entityRow => {
        const entity = entities.find(e => e.name === entityRow.entity);
        if (!entity) return false;
        return companies.some(company => {
            const companyMatrix = state.activation.matrix[company] || {};
            return visibleItems.some(item => companyMatrix[`${entity.id}_${item.id}`] === true);
        });
    });

    let totalDailyTargetAllCompanies = 0;
    companies.forEach(company => {
    const companyTargets = entityTargets[company] || {}; // Use the corrected entityTargets object
    visibleItems.forEach(item => { totalDailyTargetAllCompanies += companyTargets[item.id] || 0; });
    });

    const totalRankOfVisibleEntities = visibleEntities.reduce((sum, entity) => sum + (entity.rank || 0), 0);

    let finalData = visibleEntities.map(entityRow => {
        const companyLeads = {};
        const companyBreakdowns = {};
        let totalProjectedLeads = 0;

        companies.forEach(company => {
            const companyTargets = entityTargets[company] || {}; // Use the corrected entityTargets object here as well
            const companyMatrix = state.activation.matrix[company] || {};
            let companyProjectedLeads = 0;
            const breakdownForCompany = [];

            visibleItems.forEach(item => {
                const entityObject = entities.find(e => e.name === entityRow.entity);
                if (!entityObject || companyMatrix[`${entityObject.id}_${item.id}`] === false) {
                    return;
                }
                
                const dailyTarget = companyTargets[item.id] || 0;
                const itemRanks = contractSpecificRanks.get(item.id) || new Map();
                const eligibleEntities = entities.filter(e => {
                    const matrixKey = `${e.id}_${item.id}`;
                    return companyMatrix[matrixKey] !== false;
                });
                
                const totalRankScoreForItem = eligibleEntities.reduce((sum, e) => sum + (itemRanks.get(e.name) || 0), 0);
                
                let projDel = 0;
                let projLeads = 0;
                
                // Only do calculations if the current entity is actually eligible for this item
                if (eligibleEntities.some(e => e.name === entityRow.entity)) {
                    if (totalRankScoreForItem > 0) {
                        // If there's performance data, distribute by rank
                        const rankPercent = itemRanks.get(entityRow.entity) || 0;
                        projDel = (rankPercent / totalRankScoreForItem) * 100;
                        projLeads = Math.round(projDel / 100 * dailyTarget);
                    } else if (eligibleEntities.length > 0 && dailyTarget > 0) {
                        // If no performance data exists, distribute equally among active entities
                        projDel = 100 / eligibleEntities.length;
                        projLeads = Math.round(projDel / 100 * dailyTarget);
                    }
                }
                
                companyProjectedLeads += projLeads;
                // Always add the item to the breakdown list, even if projection is 0
                breakdownForCompany.push({ name: item.name, projLeads, projDel });
            });

            companyLeads[company] = companyProjectedLeads;
            companyBreakdowns[company] = breakdownForCompany;
            totalProjectedLeads += companyProjectedLeads;
        });
        
        const totalDailyLeads = totalRankOfVisibleEntities > 0 ? (entityRow.rank / totalRankOfVisibleEntities) * totalDailyTargetAllCompanies : 0;
        const efficiency = totalDailyLeads > 0 ? (totalProjectedLeads / totalDailyLeads) : 0;
        
        return { ...entityRow, totalProjectedLeads, efficiency, companyLeads, companyBreakdowns, totalDailyLeads };
    });

    if (totalDailyTargetAllCompanies > 0) {
        let distributedLeadsSum = finalData.reduce((sum, item) => sum + Math.floor(item.totalDailyLeads), 0);
        let remainder = totalDailyTargetAllCompanies - distributedLeadsSum;
        finalData.sort((a, b) => (b.totalDailyLeads - Math.floor(b.totalDailyLeads)) - (a.totalDailyLeads - Math.floor(a.totalDailyLeads)));
        for (let i = 0; i < remainder; i++) {
            if (finalData[i]) finalData[i].totalDailyLeads = Math.floor(finalData[i].totalDailyLeads) + 1;
        }
        for (let i = remainder; i < finalData.length; i++) {
             if (finalData[i]) finalData[i].totalDailyLeads = Math.floor(finalData[i].totalDailyLeads);
        }
    }
    state.masterViewData = finalData; 
    const companyTotals = {};
    companies.forEach(c => {
        companyTotals[c] = finalData.reduce((sum, item) => sum + (item.companyLeads[c] || 0), 0);
    });

    sortDelegationData(finalData);

    const buildSortableTh = (label, sortKey, tooltipText = null) => {
        const { key: sortKeyActive, direction: sortDir } = state.sortConfig;
        const isSorted = sortKeyActive === sortKey;
        const sortClasses = isSorted ? `sorted-${sortDir}` : '';
        const tooltipHtml = tooltipText ? `<div class="th-tooltip-container"><i class="fas fa-question-circle th-tooltip-icon"></i><div class="th-tooltip-text">${tooltipText}</div></div>` : '';
        return `<th data-sort-key="${sortKey}" class="sortable cursor-pointer ${sortClasses}"><div class="flex items-center justify-center"><span>${label}</span>${tooltipHtml}<span class="sort-icon sort-icon-up"><i class="fas fa-arrow-up"></i></span><span class="sort-icon sort-icon-down"><i class="fas fa-arrow-down"></i></span></div></th>`;
    };

    const rankScoreTooltip = 'A performance score calculated using the Delegation Performance Dates.';
    const targetAllocationTooltip = 'The ideal number of leads an entity should receive, calculated by applying their Rank Score % to the total daily targets of all visible companies.';
    const projectedLeadsTooltip = 'The total number of leads an entity is projected to receive, calculated by summing up the projections from each individual company.';
    const efficiencyIndexTooltip = 'Measures how well the Projected Leads match the Target Allocation. Calculated as (Projected Leads / Target Allocation). An index of 1.0 is a perfect match.';

    let headerHTML = `<thead><tr>
        ${buildSortableTh(state.currentEntity === 'team' ? 'Team' : 'Profiler', 'entity')}
        ${buildSortableTh('Rank Score', 'rank', rankScoreTooltip)}
        ${buildSortableTh('Target Allocation', 'totalDailyLeads', targetAllocationTooltip)} 
        ${buildSortableTh('Projected Leads', 'totalProjectedLeads', projectedLeadsTooltip)}
        ${buildSortableTh('Efficiency Index', 'efficiency', efficiencyIndexTooltip)}
        ${companies.map(c => {
            const companyClass = `company-color-${c.toLowerCase().replace(/\s+/g, '-')}`;
            return `<th class="${companyClass}">${c} LEADS</th>`;
        }).join('')}
    </tr></thead>`;

    let bodyHTML = '<tbody>';
    finalData.forEach((item, index) => {
        const efficiencyClass = getEfficiencyClass(item.efficiency);
        const entityObject = entities.find(e => e.name === item.entity);
        const projectedLeadsBreakdown = generateProjectedLeadsBreakdownString(item.companyBreakdowns);
    
        let mainRowHTML = `<tr>
            <td class="col-entity">${item.entity}</td>
            <td class="col-rank-score">${item.rank.toFixed(1)}%</td>
            <td class="col-numeric"><strong>${Math.round(item.totalDailyLeads)}</strong></td>
            <td class="col-numeric expand-cell">
                <strong>${item.totalProjectedLeads}</strong>
                ${projectedLeadsBreakdown ? `<i class="fas fa-plus-circle fa-xs expand-btn ml-1" data-target="master-proj-leads-breakdown-${index}" title="Show projected leads breakdown by contract"></i>` : ''}
            </td>
            <td class="col-efficiency ${efficiencyClass}">${item.efficiency.toFixed(2)}</td>`;
    
        let allBreakdownRowsHTML = '';
    
        // Add the new projected leads breakdown row first if it exists
        if (projectedLeadsBreakdown) {
                allBreakdownRowsHTML += `<tr class="daily-breakdown" id="master-proj-leads-breakdown-${index}">
                <td colspan="${5 + companies.length}" class="breakdown-cell" style="text-align: center; font-size: 0.75rem; white-space: normal; padding: 0.5rem 1rem !important;">
                    ${projectedLeadsBreakdown}
                </td>
            </tr>`;
        }
    
        // Add the existing company-specific breakdown rows
        companies.forEach(c => {
            const companyMatrix = state.activation.matrix[c] || {};
            const isEntityActiveForCompany = entityObject && item.companyBreakdowns[c] && item.companyBreakdowns[c].length > 0;
            const companyClass = `company-color-${c.toLowerCase().replace(/\s+/g, '-')}`;
    
            if (isEntityActiveForCompany) {
                const leads = item.companyLeads[c] || 0;
                const share = companyTotals[c] > 0 ? (leads / companyTotals[c]) * 100 : 0;
                mainRowHTML += `<td class="col-numeric expand-cell">${leads} <span class="col-percent">(${share.toFixed(0)}%)</span><i class="fas fa-plus-circle fa-xs expand-btn" data-target="master-breakdown-${index}-${c.replace(/\s+/g, '-')}" title="Show contract breakdown for ${c}"></i></td>`;
            } else {
                mainRowHTML += `<td class="col-numeric">-</td>`;
            }
    
            allBreakdownRowsHTML += `<tr class="daily-breakdown ${companyClass}" id="master-breakdown-${index}-${c.replace(/\s+/g, '-')}">
                <td colspan="${5 + companies.length}" class="breakdown-cell">
                    <div class="breakdown-grid">
                        ${(item.companyBreakdowns[c] || []).map(breakdownItem => {
                             if (breakdownItem.name.toUpperCase() === 'ALL') return '';
                             return `<div class="day-stat">
                                <div class="day-label">${breakdownItem.name}</div>
                                <div class="day-value">${breakdownItem.projLeads} (${breakdownItem.projDel.toFixed(0)}%)</div>
                            </div>`;
                        }).join('')}
                    </div>
                </td>
            </tr>`;
        });
    
        mainRowHTML += `</tr>`;
        bodyHTML += mainRowHTML + allBreakdownRowsHTML;
    });
    bodyHTML += `</tbody>`;

    delegationTable.innerHTML = headerHTML + bodyHTML;
}

function renderCompanyView() {
    const delegationTable = document.getElementById('delegation-table');
    const { entitiesData: calculatedData, totalLeadsByContractGroupAcrossAllEntities7d, sevenDaysAgoCutoff } = state.cachedData[state.currentEntity] || {};
    const currentCompanyView = state.currentView;

    if (!calculatedData || !Array.isArray(calculatedData) || calculatedData.length === 0 || !totalLeadsByContractGroupAcrossAllEntities7d) {
        delegationTable.innerHTML = `<tbody><tr><td colspan="20" class="text-center p-8 text-gray-500">No data available for company view. Please check filters.</td></tr></tbody>`;
        return;
    }
    
    const allEntitiesList = state.currentEntity === 'team' ? state.activation.teams : state.activation.profilers;
    const visibleItems = getContractsActiveInMatrix(currentCompanyView, state.currentEntity);

    const entityTargets = state.settings.targets[state.currentEntity] || {};
    const companyTargets = entityTargets[currentCompanyView] || {};
    const companyMatrix = state.activation.matrix[currentCompanyView] || {};

    const visibleEntities = calculatedData.filter(entityRow => {
        const entity = allEntitiesList.find(e => e.name === entityRow.entity);
        if (!entity) return false;
        return visibleItems.some(item => {
            const matrixKey = `${entity.id}_${item.id}`;
            return companyMatrix[matrixKey] === true;
        });
    });
    
    const dayLabels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sevenDaysAgoCutoff);
        d.setDate(d.getDate() + i);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    const dateFilterInputs = document.querySelectorAll('#delegationView #date-filters input[type="date"]');
    const fromDateStr = dateFilterInputs[0].value;
    const toDateStr = dateFilterInputs[1].value;

    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(new Date(toDateStr).getTime() + (24 * 60 * 60 * 1000 - 1)) : null;
    
    const contractSpecificRanks = new Map();
    if (fromDate && toDate) {

        // --- CORRECTED DATA AGGREGATION LOGIC ---
        const entityTypeFilter = (row) => state.currentEntity === 'profiler' ? row.team_name === 'Profilers' : row.team_name !== 'Profilers';

        const leadRiskDataForLevel = appState.allData.filter(row => {
            const dateMatch = row.date && new Date(row.date) >= fromDate && new Date(row.date) <= toDate;
            if (!dateMatch || !entityTypeFilter(row)) return false;
            
            if (state.currentEntity === 'team') {
                return row.level === 'TEAM' || row.level === 'RECRUITER';
            }
            return row.level === 'RECRUITER';
        });

        visibleItems.forEach(item => {
            const contractNames = item.contractIds ? item.contractIds.map(id => state.settings.contracts.find(c => c.id === id)?.name) : [item.name];
        
            const filteredLeadRiskData = leadRiskDataForLevel.filter(row => {
                const contractMatch = contractNames.includes(row.contract_type);
                const companyMatch = row.company_name === 'ALL';
                return contractMatch && companyMatch;
            });

            const matchesDateAndTeam = (row) => {
                const rowDate = row.date ? new Date(row.date) : null;
                return rowDate && rowDate >= fromDate && rowDate <= toDate && entityTypeFilter(row);
            };

            const arrivalsFilter = (row) => matchesDateAndTeam(row) && contractNames.includes(row.contract_type);

            const filteredMvrPspCdlData = appState.mvrPspCdlData.filter(row => matchesDateAndTeam(row) && contractNames.includes(row.contract_type) && row.company_name === 'ALL');
            const filteredPastDueData = appState.recruiterData.filter(matchesDateAndTeam);
            const filteredProfilerData = appState.profilerData.filter(matchesDateAndTeam);
            const filteredArrivalsData = appState.arrivalsData.filter(arrivalsFilter);
            const filteredDrugTestsData = appState.drugTestsData.filter(arrivalsFilter);

            const combinedDataForRank = [
                ...filteredLeadRiskData, ...filteredMvrPspCdlData, ...filteredPastDueData,
                ...filteredProfilerData, ...filteredArrivalsData, ...filteredDrugTestsData
            ];
        // --- END: CORRECTED DATA AGGREGATION LOGIC ---

            const rankedForContract = calculateRankings(combinedDataForRank, state.currentEntity, ['ALL'], contractNames);
            const ranksMap = new Map(rankedForContract.map(r => [r.name, r.final_score]));
            contractSpecificRanks.set(item.id, ranksMap);
        });
    }


    const finalData = visibleEntities.map(entityRow => {
        const projections = {};
        let totalProjectedLeads = 0;

        visibleItems.forEach(item => {
            let projLeads = 0;
            let rankPercent = 0;
            let projDel = 0;

            const itemTarget = companyTargets[item.id] || 0;
            const itemRanks = contractSpecificRanks.get(item.id) || new Map();
            
            rankPercent = itemRanks.get(entityRow.entity) || 0;

            const eligibleEntitiesForRank = allEntitiesList.filter(entity => {
                const matrixKey = `${entity.id}_${item.id}`;
                return companyMatrix[matrixKey] !== false;
            });
            
            const totalRankScoreForItem = eligibleEntitiesForRank.reduce((sum, entity) => sum + (itemRanks.get(entity.name) || 0), 0);
            const isEligibleForProjection = eligibleEntitiesForRank.some(e => e.name === entityRow.entity);
            
            if (isEligibleForProjection) {
                if (totalRankScoreForItem > 0) {
                    const rankPercent = itemRanks.get(entityRow.entity) || 0;
                    projDel = (rankPercent / totalRankScoreForItem) * 100;
                    projLeads = Math.round(projDel / 100 * itemTarget);
                } else if (eligibleEntitiesForRank.length > 0 && itemTarget > 0) {
                    // No ranks, distribute equally
                    projDel = 100 / eligibleEntitiesForRank.length;
                    projLeads = Math.round(projDel / 100 * itemTarget);
                }
            }
            
            totalProjectedLeads += projLeads;
            projections[item.name] = { projLeads, rankPercent, projDel };
        });

        return { ...entityRow, projections, totalProjectedLeads };
    });

    sortDelegationData(finalData);
    
    const buildSortableTh = (label, sortKey, rowspan = 1, colspan = 1, extraClasses = '') => {
        const { key: sortKeyActive, direction: sortDir } = state.sortConfig;
        const isSorted = sortKeyActive === sortKey;
        const sortClasses = isSorted ? `sorted-${sortDir}` : '';
        return `<th rowspan="${rowspan}" colspan="${colspan}" data-sort-key="${sortKey}" class="sortable cursor-pointer ${extraClasses} ${sortClasses}">
                    ${label}
                    <span class="sort-icon sort-icon-up"><i class="fas fa-arrow-up"></i></span>
                    <span class="sort-icon sort-icon-down"><i class="fas fa-arrow-down"></i></span>
                </th>`;
    };

    let headerHTML = `<thead><tr>
        ${buildSortableTh(state.currentEntity === 'team' ? 'Team' : 'Profiler', 'entity', 2, 1, 'col-entity')}
        ${buildSortableTh('Rank Score', 'rank', 2)}
        ${buildSortableTh('Total Proj. Leads', 'totalProjectedLeads', 2)}
        ${buildSortableTh('Total Leads (7d)', 'leads7d.total', 2)}`;
    
    let colorIndex = 1;
    visibleItems.forEach(item => {
        if (item.name.toUpperCase() === 'ALL') return;
        const colorClass = `contract-color-${colorIndex++ % 5 + 1}`;
        headerHTML += `<th colspan="5" class="th-group ${colorClass}" data-contract-group="${item.id}">${item.name}</th>`;
    });

    headerHTML += '</tr><tr>';
    visibleItems.forEach((item) => {
        if (item.name.toUpperCase() === 'ALL') return;
        headerHTML += buildSortableTh('Avg (7d)', `projections.${item.name}.avg`, 1, 1, 'th-group');
        headerHTML += buildSortableTh('Del % (7d)', `projections.${item.name}.histPerc`, 1, 1, 'th-group');
        headerHTML += buildSortableTh('Rank %', `projections.${item.name}.rankPercent`, 1, 1, 'th-group');
        headerHTML += buildSortableTh('Proj. Del %', `projections.${item.name}.projDel`, 1, 1, 'th-group');
        headerHTML += buildSortableTh('Proj. Leads', `projections.${item.name}.projLeads`, 1, 1, 'th-group');
    });
    headerHTML += '</tr></thead>';

    let bodyHTML = '<tbody>';
    finalData.forEach((item, index) => {
        const totalColumns = 4 + (visibleItems.filter(i => i.name.toUpperCase() !== 'ALL').length * 5);

        let mainRowHTML = `<tr data-row-index="${index}">
            <td class="col-entity">${item.entity}</td>
            <td class="col-rank-score">${item.rank.toFixed(1)}%</td>
            <td class="col-numeric"><strong>${item.totalProjectedLeads}</strong></td>
            <td class="expand-cell"><span class="col-numeric">${item.leads7d.total}</span><i class="fas fa-plus-circle fa-xs expand-btn" data-target="total-breakdown-${index}" title="Show total daily breakdown"></i></td>`;
        
        let breakdownRowsHTML = `<tr class="daily-breakdown" id="total-breakdown-${index}"><td colspan="${totalColumns}" class="breakdown-cell"><div class="breakdown-grid">
            ${dayLabels.map((label, i) => `<div class="day-stat"><div class="day-label">${label}</div><div class="day-value">${item.leads7d.daily[i]}</div></div>`).join('')}
        </div></td></tr>`;

        let itemColorIndex = 1;
        visibleItems.forEach(visItem => {
            if (visItem.name.toUpperCase() === 'ALL') return;
            const colorClass = `contract-color-${itemColorIndex++ % 5 + 1}`;

            const contractIds = visItem.contractIds || [visItem.id];
            const histData = { count: 0, daily: Array(7).fill(0) };
            
            contractIds.forEach(cId => {
                const contract = state.settings.contracts.find(c => c.id === cId);
                if (contract && item.contracts[contract.name]) {
                    const contractData = item.contracts[contract.name];
                    histData.count += contractData.count;
                    contractData.daily.forEach((d, i) => histData.daily[i] += d);
                }
            });
            histData.avg = histData.count / 7;

            const totalForVisItemAcrossAllEntities = totalLeadsByContractGroupAcrossAllEntities7d[visItem.name] || 0;
            const histPerc = totalForVisItemAcrossAllEntities > 0 ? (histData.count / totalForVisItemAcrossAllEntities) * 100 : 0;
            const projData = item.projections[visItem.name] || { projLeads: 0, rankPercent: 0, projDel: 0 };
            
            item.projections[visItem.name].avg = histData.avg;
            item.projections[visItem.name].histPerc = histPerc;

            let projLeadsColor = 'text-yellow-400';
            if (projData.projLeads > histData.avg) {
                projLeadsColor = 'text-green-400';
            } else if (projData.projLeads < histData.avg) {
                projLeadsColor = 'text-red-400';
            }

            mainRowHTML += `<td class="td-group-start expand-cell" data-contract-group="${visItem.id}"><span class="col-numeric">${histData.avg.toFixed(1)}</span><i class="fas fa-plus-circle fa-xs expand-btn" data-target="contract-breakdown-${index}-${visItem.id}" title="Show daily breakdown for ${visItem.name}"></i></td>
                <td class="col-percent">${histPerc.toFixed(1)}%</td>
                <td class="col-percent font-semibold text-sky-300">${projData.rankPercent.toFixed(1)}%</td>
                <td class="col-percent col-proj-leads"><strong>${projData.projDel.toFixed(0)}%</strong></td>
                <td class="col-numeric font-semibold ${projLeadsColor}">${projData.projLeads}</td>`;
            
            breakdownRowsHTML += `<tr class="daily-breakdown ${colorClass}" id="contract-breakdown-${index}-${visItem.id}"><td colspan="${totalColumns}" class="breakdown-cell"><div class="breakdown-grid">
                ${dayLabels.map((label, i) => `<div class="day-stat"><div class="day-label">${label}</div><div class="day-value">${histData.daily[i]}</div></div>`).join('')}
            </div></td></tr>`;
        });

        mainRowHTML += `</tr>`;
        bodyHTML += mainRowHTML + breakdownRowsHTML;
    });
    bodyHTML += `</tbody>`;

    delegationTable.innerHTML = headerHTML + bodyHTML;
}


function renderViewSwitcher() {
    const companies = [...new Set(appState.allData.map(d => d.company_name).filter(Boolean))]
        .filter(c => c.toUpperCase() !== 'ALL');
    const container = document.querySelector('#delegationView .view-switcher');
    if (!container) return;

    let html = `<button class="view-btn master-view-btn active" data-view="master"><i class="fa fa-globe"></i> Master View</button>`;
    
    html += `
        <div class="company-list-header">
            <span>Companies</span>
        </div>
        <div class="company-buttons-list">
            ${companies.map(c => `<button class="view-btn" data-view="${c}"><i class="fa fa-building"></i> ${c}</button>`).join('')}
        </div>
    `;
    
    container.innerHTML = html;
    state.currentView = 'master'; 
}

export function initializeDelegationView() {
    console.log("Delegation view initialized.");
    loadSettings();
    generateSettingsFromState();
    
    // Set default dates
    const dateFilterContainer = document.getElementById('date-filters');
    if (dateFilterContainer) {
        const dateInputs = dateFilterContainer.querySelectorAll('input[type="date"]');
        if (dateInputs.length === 2 && appState.allData.length > 0) {
            const latestDate = new Date(Math.max(...appState.allData.map(d => new Date(d.date))));
            const toDateStr = latestDate.toISOString().split('T')[0];
            
            const fromDate = new Date(latestDate);
            fromDate.setDate(latestDate.getDate() - 6);
            const fromDateStr = fromDate.toISOString().split('T')[0];

            dateInputs[0].value = fromDateStr;
            dateInputs[1].value = toDateStr;
        }
    }
    renderViewSwitcher();
    calculateAndCacheAllData();
    renderTable();

    const delegationView = document.getElementById('delegationView');
    const settingsModal = document.getElementById('delegationSettingsModal');
    
    const openSettingsBtn = document.getElementById('openDelegationSettingsBtn');
    const copyBtn = document.getElementById('copyDelegationBtn');
    const downloadBtn = document.getElementById('downloadDelegationBtn');
    const downloadImageBtn = document.getElementById('downloadImageBtn');

    const closeSettingsBtn = document.getElementById('closeDelegationSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveDelegationSettingsBtn');
    
    const delegationTable = document.getElementById('delegation-table');
if (delegationTable) {
    delegationTable.addEventListener('click', handleSortClick);

    // --- ADD THIS ENTIRE BLOCK ---
    delegationTable.addEventListener('mouseover', (e) => {
        const tooltipContainer = e.target.closest('.th-tooltip-container');
        if (!tooltipContainer) return;

        if (activeTooltip) activeTooltip.remove();

        const tooltipTemplate = tooltipContainer.querySelector('.th-tooltip-text');
        if (!tooltipTemplate) return;

        activeTooltip = document.createElement('div');
        activeTooltip.className = 'dynamic-tooltip'; // Use a generic class for styling
        activeTooltip.innerHTML = tooltipTemplate.innerHTML;
        document.body.appendChild(activeTooltip);

        const headerRect = tooltipContainer.getBoundingClientRect();
        const tooltipRect = activeTooltip.getBoundingClientRect();

        let top = headerRect.top - tooltipRect.height - 8; // 8px margin
        let left = headerRect.left + (headerRect.width / 2) - (tooltipRect.width / 2);

        if (left < 8) left = 8;
        if (left + tooltipRect.width > window.innerWidth - 8) {
            left = window.innerWidth - tooltipRect.width - 8;
        }
        if (top < 8) {
            top = headerRect.bottom + 8;
        }

        activeTooltip.style.left = `${left}px`;
        activeTooltip.style.top = `${top}px`;
    });

    delegationTable.addEventListener('mouseout', () => {
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    });
    // --- END OF ADDED BLOCK ---
}
    
    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
            renderColumnManagement();
            const currentEntityType = document.querySelector('.matrix-entity-switcher.active')?.dataset.entity || 'team';
            renderActivationMatrix(currentEntityType);
        });
    }

    if (downloadImageBtn) {
        downloadImageBtn.addEventListener('click', downloadDelegationAsImage);
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', copyDelegationSummary);
    }
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadDelegationSummary);
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            saveSettings();
            settingsModal.classList.add('hidden');
            renderTable();
        });
    }

    settingsModal.addEventListener('click', (e) => {
        const target = e.target;
        const matrixContainer = document.getElementById('activationMatrixContainer');

        if (target.closest('.matrix-action-btn')) {
            const action = target.dataset.action;
            const shouldBeChecked = action === 'select-all-visible';
            matrixContainer.querySelectorAll('.activation-toggle').forEach(cb => {
                if (cb.checked !== shouldBeChecked) {
                    cb.checked = shouldBeChecked;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            return;
        }

        if (target.closest('[data-action="toggle-row"]')) {
            const row = target.closest('tr');
            if (!row) return;
            const checkboxesInRow = row.querySelectorAll('.activation-toggle');
            const total = checkboxesInRow.length;
            const checkedCount = row.querySelectorAll('.activation-toggle:checked').length;
            const shouldBeChecked = checkedCount < total;
            checkboxesInRow.forEach(cb => {
                if (cb.checked !== shouldBeChecked) {
                    cb.checked = shouldBeChecked;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            return;
        }

        if (target.closest('[data-action="toggle-column"]')) {
            const itemId = target.closest('[data-action="toggle-column"]').dataset.itemId;
            const headerRow = matrixContainer.querySelector('thead tr');
            if (!itemId || !headerRow) return;

            const allHeaders = Array.from(headerRow.querySelectorAll('th'));
            const columnIndex = allHeaders.findIndex(th => th.dataset.itemId === itemId);
            
            if (columnIndex > 0) {
                const checkboxesInColumn = matrixContainer.querySelectorAll(`tbody tr td:nth-child(${columnIndex + 1}) .activation-toggle`);
                const total = checkboxesInColumn.length;
                let checkedCount = 0;
                checkboxesInColumn.forEach(cb => {
                    if (cb.checked) checkedCount++;
                });

                const shouldBeChecked = checkedCount < total;
                checkboxesInColumn.forEach(cb => {
                    if (cb.checked !== shouldBeChecked) {
                        cb.checked = shouldBeChecked;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }
            return;
        }


        const clickedTab = target.closest('.delegation-settings-tab');
        if (clickedTab) {
            settingsModal.querySelector('nav').querySelectorAll('.delegation-settings-tab').forEach(tab => tab.classList.remove('active'));
            settingsModal.querySelectorAll('.delegation-settings-tab-content').forEach(content => content.classList.add('hidden'));
            clickedTab.classList.add('active');
            document.getElementById(`tab-content-${clickedTab.dataset.tab}`).classList.remove('hidden');
            return;
        }

        const matrixSwitcher = target.closest('.matrix-entity-switcher');
        if (matrixSwitcher) {
            settingsModal.querySelectorAll('.matrix-entity-switcher').forEach(btn => btn.classList.remove('active'));
            matrixSwitcher.classList.add('active');
            state.activation.selectedEntityId = null; // Deselect entity when switching views
            renderActivationMatrix();
            return;
        }

        // Add an event listener for the new checkbox and the search input
        const searchInput = target.closest('#entitySearchInput');
        const inactiveCheckbox = target.closest('#showInactiveCheckbox');
        if (searchInput || inactiveCheckbox) {
            renderActivationMatrix();
            return;
        }
        
        const companyTabBtn = target.closest('.company-tab-btn');
        if (companyTabBtn) {
            state.activation.selectedCompany = companyTabBtn.dataset.company;
            renderActivationMatrix();
            return;
        }

        const entityItem = target.closest('.entity-list-item');
        if (entityItem) {
            state.activation.selectedEntityId = entityItem.dataset.entityId;
            renderActivationMatrix(); // Re-render the whole view to update selection and details
            return;
        }

        const detailsPanel = target.closest('#activation-details-panel');
        if (detailsPanel) {
            const actionTarget = target.closest('[data-action]');
            if (actionTarget) {
                const action = actionTarget.dataset.action;
                const company = state.activation.selectedCompany;
                const entityId = state.activation.selectedEntityId;

                if (action === 'remove-contract') {
                    const itemId = actionTarget.dataset.itemId;
                    const matrixKey = `${entityId}_${itemId}`;
                    state.activation.matrix[company][matrixKey] = false;
                    renderActivationMatrix();
                }

                if (action === 'toggle-dropdown') {
                    actionTarget.nextElementSibling.classList.toggle('visible');
                }
            }
        }
        
        const bulkActionPanel = target.closest('#activation-bulk-actions');
        if (bulkActionPanel) {
            const actionTarget = target.closest('[data-action]');
            if(actionTarget) {
                const action = actionTarget.dataset.action;
                const shouldBeActive = action === 'select-all-visible';
                const company = state.activation.selectedCompany;
                const entityId = state.activation.selectedEntityId;

                // Get only the items that are currently visible in the columns tab
                const visibleItems = [...state.settings.contracts, ...state.settings.groups]
                    .filter(item => state.settings.visibility[item.id] && item.name.toUpperCase() !== 'ALL');
                
                if (company && entityId && state.activation.matrix[company]) {
                    visibleItems.forEach(item => {
                        const matrixKey = `${entityId}_${item.id}`;
                        state.activation.matrix[company][matrixKey] = shouldBeActive;
                    });
                    renderActivationMatrix();
                }
            }
        }

     


        if (target.closest('#addNewGroupBtn')) {
            renderGroupEditor(null);
            return;
        }

        const editor = target.closest('.contract-group-editor');
        if (editor) {
            if (target.classList.contains('save-group-btn')) {
                const id = editor.dataset.groupId;
                const name = editor.querySelector('.group-name-input').value.trim();
                if (!name) return alert("Group name cannot be empty.");
                const contractIds = Array.from(editor.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
                const existingGroupIndex = state.settings.groups.findIndex(g => g.id === id);
                if (existingGroupIndex > -1) {
                    state.settings.groups[existingGroupIndex] = { id, name, contractIds };
                } else {
                    state.settings.groups.push({ id, name, contractIds });
                    state.settings.visibility[id] = true;
                }
                renderColumnManagement();
            } else if (target.classList.contains('cancel-group-btn')) {
                renderColumnManagement();
            }
            return;
        }

        const groupItem = target.closest('.contract-group-item');
        if (groupItem) {
            const groupId = groupItem.dataset.groupId;
            if (target.closest('.edit-group-btn')) {
                const groupToEdit = state.settings.groups.find(g => g.id === groupId);
                renderGroupEditor(groupToEdit);
            } else if (target.closest('.delete-group-btn')) {
                if (confirm(`Are you sure you want to delete this group?`)) {
                    state.settings.groups = state.settings.groups.filter(g => g.id !== groupId);
                    delete state.settings.visibility[groupId];
                    renderColumnManagement();
                }
            }
        }
    });

    settingsModal.addEventListener('change', (e) => {
        const target = e.target;
        if (target.classList.contains('visibility-toggle')) {
            state.settings.visibility[target.dataset.key] = target.checked;
        }
        if (target.classList.contains('activation-toggle')) {
            const companyMatrix = state.activation.matrix[state.activation.selectedCompany];
            if(companyMatrix) {
                companyMatrix[target.dataset.key] = target.checked;
            }
        }
    });
    
    delegationView.querySelector('#targets-card')?.addEventListener('change', (e) => {
        if(e.target.classList.contains('target-input')) {
            const key = e.target.dataset.key;
            const companyView = state.currentView;
            if (companyView === 'master') return;
    
            if (!state.settings.targets[state.currentEntity]) {
                state.settings.targets[state.currentEntity] = {};
            }
            if (!state.settings.targets[state.currentEntity][companyView]) {
                state.settings.targets[state.currentEntity][companyView] = {};
            }
            state.settings.targets[state.currentEntity][companyView][key] = parseInt(e.target.value, 10) || 0;
            renderTable();
        }
    });
    
    delegationView.querySelector('#date-filters')?.addEventListener('change', () => {
        calculateAndCacheAllData();
        renderTable();
    });

    delegationView.querySelector('.view-switcher')?.addEventListener('click', (e) => {
        const button = e.target.closest('.view-btn');
        if (button) {
            delegationView.querySelectorAll('.view-switcher .view-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            state.currentView = button.dataset.view;
            calculateAndCacheAllData();
            renderTable();
            updateDelegationViewVisibility();
            updateLeadTypeSwitcherVisibility(); // This line was added
        }
    });

    delegationView.querySelector('.entity-switcher')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            delegationView.querySelectorAll('.entity-switcher .switcher-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            state.currentEntity = e.target.dataset.entity;
            updateLeadTypeSwitcherVisibility();
            calculateAndCacheAllData();
            renderTable();
        }
    });
    
    delegationView.querySelector('#delegation-table')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('expand-btn')) {
            const targetId = e.target.dataset.target;
            const targetRow = document.getElementById(targetId);
            if (!targetRow) return;

            const isVisible = targetRow.classList.toggle('visible');
            e.target.classList.toggle('fa-minus-circle', isVisible);
            e.target.classList.toggle('fa-plus-circle', !isVisible);

            const contractGroup = e.target.closest('td')?.dataset.contractGroup;
            if (contractGroup) {
                const header = document.querySelector(`#delegation-table th[data-contract-group="${contractGroup}"]`);
                if (header) {
                    header.classList.toggle('expanded', isVisible);
                }
            }
        }
    });

    const actionsContainer = document.getElementById('delegationActionsContainer');
    let tooltipElement = null;

    if (actionsContainer) {
        actionsContainer.addEventListener('mouseover', (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.tooltip) {
                if (tooltipElement) tooltipElement.remove();

                tooltipElement = document.createElement('div');
                tooltipElement.className = 'delegation-tooltip';
                tooltipElement.textContent = button.dataset.tooltip;
                document.body.appendChild(tooltipElement);

                const btnRect = button.getBoundingClientRect();
                const tooltipRect = tooltipElement.getBoundingClientRect();
                
                tooltipElement.style.left = `${btnRect.left + (btnRect.width / 2) - (tooltipRect.width / 2)}px`;
                tooltipElement.style.top = `${btnRect.top - tooltipRect.height - 8}px`;
            }
        });

        actionsContainer.addEventListener('mouseout', () => {
            if (tooltipElement) {
                tooltipElement.remove();
                tooltipElement = null;
            }
        });
    }

    const leadTypeSwitcher = document.getElementById('lead-type-switcher-container');
    if (leadTypeSwitcher) {
        leadTypeSwitcher.addEventListener('click', (e) => {
            const button = e.target.closest('.switcher-btn');
            if (button && button.dataset.leadType) {
                leadTypeSwitcher.querySelectorAll('.switcher-btn').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                state.leadType = button.dataset.leadType;
                calculateAndCacheAllData();
                renderTable();
            }
        });
    }

    updateDelegationViewVisibility();
}

export function rerenderDelegationView() {
    calculateAndCacheAllData();
    renderTable();
    updateDelegationViewVisibility(); // Add this line
    updateLeadTypeSwitcherVisibility();
}
function downloadAsTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ADD THIS NEW FUNCTION at the end of the file
function generateAndDownloadSummary() {
    // This feature is only available in the Master View, which calculates the data.
    if (state.currentView !== 'master') {
        alert("This feature is only available in Master View.");
        return;
    }

    const delegationData = state.masterViewData; // Use cached data
    if (!delegationData || delegationData.length === 0) {
        alert("No data available to generate a summary.");
        return;
    }

    let summary = `DELEGATION SUMMARY - ${state.currentEntity.toUpperCase()}\n`;
    summary += `Generated on: ${new Date().toLocaleString()}\n\n`;

    delegationData.forEach(entityRow => {
        summary += `--- ${entityRow.entity} ---\n`;
        const breakdownParts = [];
        const sortedCompanies = Object.keys(entityRow.companyBreakdowns).sort();

        for (const company of sortedCompanies) {
            const contracts = entityRow.companyBreakdowns[company]
                .filter(b => b.projDel > 0) // Only include contracts with projected delegation
                .map(b => `${b.name} (${b.projDel.toFixed(0)}%)`);
            
            if (contracts.length > 0) {
                breakdownParts.push(`${company}: ${contracts.join(', ')}`);
            }
        }
        
        if (breakdownParts.length > 0) {
            summary += breakdownParts.join(' | ') + '\n';
        } else {
            summary += 'No projected delegations.\n';
        }
        summary += '\n'; // Add a blank line for readability
    });
    
    const date = new Date();
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const filename = `Delegation_Summary_${state.currentEntity}_${dateString}.txt`;
    
    downloadAsTextFile(summary, filename);
}
// ADD THIS NEW HELPER FUNCTION
function generateDelegationSummaryText() {
    if (state.currentView !== 'master' || !state.masterViewData || state.masterViewData.length === 0) {
        return null;
    }

    // --- THIS IS THE FIX: Get a list of all visible contract/group IDs ---
    const visibleItemIds = [
        ...state.settings.contracts.filter(c => state.settings.visibility[c.id]).map(c => c.id),
        ...state.settings.groups.filter(g => state.settings.visibility[g.id]).map(g => g.id)
    ];
    // Find the ID for the 'ALL' contract to specifically exclude it
    const allContractId = state.settings.contracts.find(c => c.name.toUpperCase() === 'ALL')?.id;


    let summary = `DELEGATION SUMMARY - ${state.currentEntity.toUpperCase()}\n`;
    summary += `Generated on: ${new Date().toLocaleString()}\n\n`;

    state.masterViewData.forEach(entityRow => {
        summary += `--- ${entityRow.entity} ---\n`;
        const breakdownParts = [];
        const sortedCompanies = Object.keys(entityRow.companyBreakdowns).sort();

        for (const company of sortedCompanies) {
            const contracts = entityRow.companyBreakdowns[company]
                // --- THIS IS THE FIX: Filter the contracts based on visibility ---
                .filter(b => {
                    const item = state.settings.contracts.find(c => c.name === b.name) || state.settings.groups.find(g => g.name === b.name);
                    // Exclude if it has no projection, is not visible, or is the 'ALL' contract
                    return b.projDel > 0 && item && visibleItemIds.includes(item.id) && item.id !== allContractId;
                })
                .map(b => `${b.name} (${b.projDel.toFixed(0)}%)`);
            
            if (contracts.length > 0) {
                breakdownParts.push(`${company}: ${contracts.join(', ')}`);
            }
        }
        
        summary += breakdownParts.length > 0 ? breakdownParts.join(' | ') + '\n\n' : 'No projected delegations.\n\n';
    });
    
    return summary;
}

// ADD THIS NEW FUNCTION FOR THE COPY ACTION
function copyDelegationSummary() {
    const summaryText = generateDelegationSummaryText();
    if (!summaryText) {
        alert("No data available to copy.");
        return;
    }

    navigator.clipboard.writeText(summaryText).then(() => {
        const copyBtn = document.getElementById('copyDelegationBtn');
        const originalContent = copyBtn.innerHTML;
        copyBtn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
        setTimeout(() => {
            copyBtn.innerHTML = originalContent;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy summary. Please check console for details.');
    });
}

// ADD THIS NEW FUNCTION FOR THE DOWNLOAD ACTION
function downloadDelegationSummary() {
    const summaryText = generateDelegationSummaryText();
    if (!summaryText) {
        alert("No data available to download.");
        return;
    }
    
    const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const date = new Date();
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    a.download = `Delegation_Summary_${state.currentEntity}_${dateString}.txt`;
    a.href = url;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
function downloadDelegationAsImage() {
    if (state.currentView !== 'master' || !state.masterViewData || state.masterViewData.length === 0) {
        alert("No data available to generate an image. This feature is only available in Master View.");
        return;
    }

    const container = document.createElement('div');
    container.className = 'delegation-summary-image-container';

    // --- THIS IS THE FIX: Get a list of all visible contract/group IDs ---
    const visibleItemIds = [
        ...state.settings.contracts.filter(c => state.settings.visibility[c.id]).map(c => c.id),
        ...state.settings.groups.filter(g => state.settings.visibility[g.id]).map(g => g.id)
    ];
    const allContractId = state.settings.contracts.find(c => c.name.toUpperCase() === 'ALL')?.id;

    let innerHTML = `<h1>DELEGATION SUMMARY - ${state.currentEntity.toUpperCase()}</h1>`;
    innerHTML += `<p class="summary-subtitle">Generated on: ${new Date().toLocaleString()}</p>`;

    state.masterViewData.forEach(entityRow => {
        innerHTML += `<div class="entity-block">`;
        innerHTML += `<h2 class="entity-name">${entityRow.entity}</h2>`;
        innerHTML += `<div class="delegation-details">`;
        
        const visibleItemIds = [
            ...state.settings.contracts.filter(c => state.settings.visibility[c.id]).map(c => c.id),
            ...state.settings.groups.filter(g => state.settings.visibility[g.id]).map(g => g.id)
        ];
        const allContractId = state.settings.contracts.find(c => c.name.toUpperCase() === 'ALL')?.id;

        const allCompaniesBreakdown = [];
        const sortedCompanies = Object.keys(entityRow.companyBreakdowns).sort();

        for (const company of sortedCompanies) {
            const contracts = entityRow.companyBreakdowns[company]
                .filter(b => {
                    const item = state.settings.contracts.find(c => c.name === b.name) || state.settings.groups.find(g => g.name === b.name);
                    // Exclude if it has no projection, is not visible, or is the 'ALL' contract
                    return item && b.projDel > 0 && visibleItemIds.includes(item.id) && item.id !== allContractId;
                })
                .map(b => `${b.name} (${b.projDel.toFixed(0)}%)`);

            if (contracts.length > 0) {
                const companyClass = `company-${company.toLowerCase().replace(/\s+/g, '-')}`;
                allCompaniesBreakdown.push(`<strong class="${companyClass}">${company}:</strong> ${contracts.join(', ')}`);
            }
        }

        if (allCompaniesBreakdown.length > 0) {
            // Join companies with the "|" separator for the new format
            innerHTML += `<p>${allCompaniesBreakdown.join('<span style="color: #4b5563; margin: 0 0.75rem; font-weight: 300;">|</span>')}</p>`;
        } else {
            innerHTML += `<p class="no-delegation-text">No projected delegations.</p>`;
        }
        
        innerHTML += `</div></div>`;
    });

    container.innerHTML = innerHTML;
    document.body.appendChild(container);

    html2canvas(container, {
        backgroundColor: '#111827',
        scale: 2
    }).then(canvas => {
        const a = document.createElement('a');
        const date = new Date();
        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        a.download = `Delegation_Summary_${state.currentEntity}_${dateString}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    }).catch(err => {
        console.error("Error generating image:", err);
        alert("Could not generate image. See console for details.");
    }).finally(() => {
        document.body.removeChild(container);
    });
}
// ADD THIS NEW FUNCTION
function updateDelegationViewVisibility() {
    const delegationView = document.getElementById('delegationView');
    if (!delegationView) return;

    const isMasterView = state.currentView === 'master';
    const actionsContainer = document.getElementById('delegationActionsContainer');
    const targetsCard = delegationView.querySelector('#targets-card');
    const dateFilters = delegationView.querySelector('#date-filters');

    if (targetsCard) {
        targetsCard.style.display = isMasterView ? 'none' : 'block';
    }
    if (dateFilters) {
        dateFilters.style.visibility = isMasterView ? 'hidden' : 'visible';
    }
    if (actionsContainer) {
        actionsContainer.style.display = isMasterView ? 'flex' : 'none';
    }
}
