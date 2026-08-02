/**
 * Data Parser Module
 * Handles Excel file parsing and data transformation for all 6 tabs
 */

const DataParser = {
    // Store raw and processed data
    rawData: {},
    processedData: {},
    
    // Expected sheet names (flexible matching)
    sheetMappings: {
        'caseRecordType': ['Case Record Type', 'CaseRecordType', 'Case_Record_Type', 'Case record Type', 'Case record type', 'Sheet1'],
        'proactiveType': ['Proactive Type', 'ProactiveType', 'Proactive_Type', 'Proactive type', 'proactive type', 'Sheet2'],
        'age48hrs': ['Age 48 hrs', 'Age48hrs', 'Age_48_hrs', 'Age 48hrs', 'Age 48 hr', 'age 48', 'Sheet3'],
        'emailChanges': ['Email Change Count', 'EmailChangeCount', 'Email_Change_Count', 'Email Changes', 'Email change', 'email changes', 'Sheet4'],
        'shortCalls': ['Short Calls', 'ShortCalls', 'Short_Calls', 'Short calls', 'short calls', 'Shortcalls', 'Sheet5'],
        'ronaTrend': ['RONA Trend', 'RONATrend', 'RONA_Trend', 'RONA', 'Rona Trend', 'rona', 'Sheet6']
    },

    /**
     * Parse Excel file from upload
     * @param {File} file - The uploaded Excel file
     * @returns {Promise} - Resolves with parsed data
     */
    parseFromUpload: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const result = this.processWorkbook(workbook);
                    resolve(result);
                } catch (error) {
                    reject(new Error('Failed to parse Excel file: ' + error.message));
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Parse Excel file from URL/path
     * @param {string} url - The URL or path to the Excel file
     * @returns {Promise} - Resolves with parsed data
     */
    parseFromURL: function(url) {
        return new Promise((resolve, reject) => {
            fetch(url)
                .then(response => {
                    if (!response.ok) throw new Error('Failed to fetch file');
                    return response.arrayBuffer();
                })
                .then(buffer => {
                    const data = new Uint8Array(buffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const result = this.processWorkbook(workbook);
                    resolve(result);
                })
                .catch(error => reject(error));
        });
    },

    /**
     * Process workbook and extract all sheets
     * @param {Object} workbook - XLSX workbook object
     * @returns {Object} - Processed data from all sheets
     */
    processWorkbook: function(workbook) {
        const sheetNames = workbook.SheetNames;
        console.log('Found sheets:', sheetNames);
        
        this.rawData = {};
        
        // Process each expected sheet type
        for (const [key, possibleNames] of Object.entries(this.sheetMappings)) {
            const matchedSheet = this.findSheet(sheetNames, possibleNames);
            if (matchedSheet) {
                const sheet = workbook.Sheets[matchedSheet];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                this.rawData[key] = jsonData;
                console.log(`Loaded ${key}: ${jsonData.length} rows`);
                
                // Debug: Log column names for short calls
                if (key === 'shortCalls' && jsonData.length > 0) {
                    const columns = Object.keys(jsonData[0]);
                    console.log('Short Calls columns found:', columns);
                    console.log('Short Calls column names (exact):', JSON.stringify(columns));
                    console.log('Short Calls first row:', JSON.stringify(jsonData[0]));
                }
            } else {
                console.warn(`Sheet not found for ${key}`);
                this.rawData[key] = [];
            }
        }
        
        // Transform the data
        this.processedData = this.transformData(this.rawData);
        
        // Debug: Log transformed short calls
        console.log('Transformed shortCalls:', this.processedData.shortCalls?.slice(0, 3));
        
        return this.processedData;
    },

    /**
     * Find matching sheet name
     * @param {Array} sheetNames - Available sheet names
     * @param {Array} possibleNames - Possible matching names
     * @returns {string|null} - Matched sheet name or null
     */
    findSheet: function(sheetNames, possibleNames) {
        // First try exact match (case-insensitive)
        for (const name of possibleNames) {
            const found = sheetNames.find(sn => 
                sn.toLowerCase().trim() === name.toLowerCase().trim()
            );
            if (found) return found;
        }
        
        // Try "contains" match
        for (const name of possibleNames) {
            const found = sheetNames.find(sn => 
                sn.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(sn.toLowerCase())
            );
            if (found) return found;
        }
        
        // Try partial match on first word
        for (const name of possibleNames) {
            const firstWord = name.toLowerCase().split(' ')[0];
            if (firstWord.length > 3) {
                const found = sheetNames.find(sn => 
                    sn.toLowerCase().includes(firstWord)
                );
                if (found) return found;
            }
        }
        
        // Try matching by removing spaces
        for (const name of possibleNames) {
            const nameNoSpaces = name.toLowerCase().replace(/\s+/g, '');
            const found = sheetNames.find(sn => 
                sn.toLowerCase().replace(/\s+/g, '') === nameNoSpaces
            );
            if (found) return found;
        }
        
        return null;
    },

    /**
     * Transform raw data into standardized format
     * @param {Object} rawData - Raw data from Excel
     * @returns {Object} - Transformed data
     */
    transformData: function(rawData) {
        return {
            caseRecordType: this.transformCaseRecordType(rawData.caseRecordType || []),
            proactiveType: this.transformProactiveType(rawData.proactiveType || []),
            age48hrs: this.transformAge48hrs(rawData.age48hrs || []),
            emailChanges: this.transformEmailChanges(rawData.emailChanges || []),
            shortCalls: this.transformShortCalls(rawData.shortCalls || []),
            ronaTrend: this.transformRonaTrend(rawData.ronaTrend || [])
        };
    },

    /**
     * Transform Case Record Type data
     */
    transformCaseRecordType: function(data) {
        if (!data || data.length === 0) return [];
        
        // Debug: Log column names
        const columns = Object.keys(data[0]);
        console.log('Case Record Type columns:', columns);
        console.log('Case Record Type first row:', JSON.stringify(data[0]));
        
        // Find columns dynamically
        let caseNumCol = null, ownerCol = null, managerCol = null, typeCol = null, originCol = null;
        
        for (const col of columns) {
            const colLower = col.toLowerCase();
            if (colLower.includes('case') && colLower.includes('number')) caseNumCol = col;
            else if (colLower.includes('case') && colLower.includes('owner')) ownerCol = col;
            else if (colLower.includes('manager')) managerCol = col;
            else if (colLower.includes('record') && colLower.includes('type')) typeCol = col;
            else if (colLower.includes('origin')) originCol = col;
        }
        
        // Fallback to position-based if not found
        if (!caseNumCol && columns.length >= 1) caseNumCol = columns[0];
        if (!ownerCol && columns.length >= 2) ownerCol = columns[1];
        if (!managerCol && columns.length >= 3) managerCol = columns[2];
        if (!typeCol && columns.length >= 4) typeCol = columns[3];
        if (!originCol && columns.length >= 5) originCol = columns[4];
        
        console.log('Case Record Type mapping:', { caseNumCol, ownerCol, managerCol, typeCol, originCol });
        
        return data.map(row => ({
            caseNumber: row[caseNumCol] || '',
            caseOwner: row[ownerCol] || '',
            manager: row[managerCol] || '',
            recordType: row[typeCol] || '',
            origin: row[originCol] || ''
        })).filter(row => row.caseNumber && String(row.caseNumber).trim() !== '');
    },

    /**
     * Transform Proactive Type data
     */
    transformProactiveType: function(data) {
        if (!data || data.length === 0) return [];
        
        const columns = Object.keys(data[0]);
        console.log('Proactive Type columns:', columns);
        
        // Find columns dynamically
        let caseNumCol = null, ownerCol = null, managerCol = null, typeCol = null;
        
        for (const col of columns) {
            const colLower = col.toLowerCase();
            if (colLower.includes('case') && colLower.includes('number')) caseNumCol = col;
            else if (colLower.includes('case') && colLower.includes('owner')) ownerCol = col;
            else if (colLower.includes('manager')) managerCol = col;
            else if (colLower.includes('proactive')) typeCol = col;
        }
        
        // Fallback to position-based
        if (!caseNumCol && columns.length >= 1) caseNumCol = columns[0];
        if (!ownerCol && columns.length >= 2) ownerCol = columns[1];
        if (!managerCol && columns.length >= 3) managerCol = columns[2];
        if (!typeCol && columns.length >= 4) typeCol = columns[3];
        
        console.log('Proactive Type mapping:', { caseNumCol, ownerCol, managerCol, typeCol });
        
        return data.map(row => ({
            caseNumber: row[caseNumCol] || '',
            caseOwner: row[ownerCol] || '',
            manager: row[managerCol] || '',
            proactiveType: row[typeCol] || ''
        })).filter(row => row.caseNumber && String(row.caseNumber).trim() !== '');
    },

    /**
     * Transform Age 48hrs data
     */
    transformAge48hrs: function(data) {
        if (!data || data.length === 0) return [];
        
        const columns = Object.keys(data[0]);
        console.log('Age 48hrs columns (exact):', JSON.stringify(columns));
        
        // Based on your Excel structure, use position-based detection
        // Column A = Case Number, B = Case Owner, C = Manager, D = Age, E = Open, F = Origin
        let caseNumCol = columns[0];  // First column
        let ownerCol = columns[1];     // Second column
        let managerCol = columns[2];   // Third column
        let ageCol = columns[3];       // Fourth column
        let openCol = columns[4];      // Fifth column
        let originCol = columns[5];    // Sixth column
        
        // Try to find by keywords if available
        for (const col of columns) {
            const colLower = col.toLowerCase().trim();
            if (colLower.includes('age') && colLower.includes('hour')) ageCol = col;
            if (colLower === 'open') openCol = col;
        }
        
        console.log('Age 48hrs mapping:', { caseNumCol, ownerCol, managerCol, ageCol, openCol, originCol });
        console.log('Age 48hrs first row data:', JSON.stringify(data[0]));
        
        const result = data.map(row => {
            const age = parseFloat(row[ageCol]) || 0;
            const caseOwner = String(row[ownerCol] || '').trim();
            const caseNumber = String(row[caseNumCol] || '').trim();
            
            return {
                caseNumber: caseNumber,
                caseOwner: caseOwner,
                manager: String(row[managerCol] || '').trim(),
                age: age,
                open: row[openCol] || '',
                origin: row[originCol] || '',
                status: age > 96 ? 'critical' : (age > 48 ? 'warning' : 'normal')
            };
        }).filter(row => {
            // Filter out empty rows and header rows
            const isValidNumber = row.caseNumber && !isNaN(row.caseNumber);
            const isNotHeader = !row.caseOwner.toLowerCase().includes('case') && 
                               !row.caseOwner.toLowerCase().includes('owner');
            return isValidNumber || (row.caseNumber && isNotHeader);
        });
        
        console.log('Age 48hrs transformed count:', result.length);
        console.log('Age 48hrs sample:', result.slice(0, 3));
        
        return result;
    },

    /**
     * Transform Email Changes data
     */
    transformEmailChanges: function(data) {
        return data.map(row => {
            const oldValue = String(this.getValue(row, ['Old Value', 'OldValue', 'Old_Value']) || '');
            const newValue = String(this.getValue(row, ['New Value', 'NewValue', 'New_Value']) || '');
            
            return {
                fieldEvent: this.getValue(row, ['Field / Event', 'Field/Event', 'FieldEvent', 'Field_Event']),
                editDate: this.parseDate(this.getValue(row, ['Edit Date', 'EditDate', 'Edit_Date'])),
                oldValue: oldValue,
                newValue: newValue,
                editedBy: this.getValue(row, ['Edited By', 'EditedBy', 'Edited_By']),
                changeType: this.detectEmailChangeType(oldValue, newValue)
            };
        }).filter(row => row.editedBy);
    },

    /**
     * Transform Short Calls data
     */
    transformShortCalls: function(data) {
        if (!data || data.length === 0) return [];
        
        // Get column names from first row
        const columns = Object.keys(data[0]);
        console.log('Short Calls: trying to match columns:', columns);
        
        // Find agent name column
        let agentCol = null;
        for (const col of columns) {
            const colLower = col.toLowerCase();
            if (colLower.includes('agent') || colLower.includes('name')) {
                agentCol = col;
                break;
            }
        }
        
        // Find count column
        let countCol = null;
        for (const col of columns) {
            const colLower = col.toLowerCase();
            if (colLower.includes('short') || colLower.includes('count') || colLower.includes('5min')) {
                if (col !== agentCol) {
                    countCol = col;
                    break;
                }
            }
        }
        
        // If we couldn't find specific columns, use first two columns
        if (!agentCol && columns.length >= 1) {
            agentCol = columns[0];
        }
        if (!countCol && columns.length >= 2) {
            countCol = columns[1];
        }
        
        console.log('Short Calls: using agentCol =', agentCol, ', countCol =', countCol);
        
        return data.map(row => {
            const agentName = agentCol ? String(row[agentCol] || '').trim() : '';
            const count = countCol ? parseInt(row[countCol]) || 0 : 0;
            
            return {
                agentName: agentName,
                count: count
            };
        }).filter(row => {
            // Filter out empty and header rows
            if (!row.agentName || row.agentName === '') return false;
            const nameLower = row.agentName.toLowerCase();
            // Skip header-like values
            if (nameLower.includes('agent') && nameLower.includes('name')) return false;
            if (nameLower === 'name' || nameLower === 'agent') return false;
            return true;
        });
    },

    /**
     * Transform RONA Trend data
     */
    transformRonaTrend: function(data) {
        if (!data || data.length === 0) return [];
        
        // Get column names from first row
        const columns = Object.keys(data[0]);
        
        // Find agent name column
        let agentCol = null;
        for (const col of columns) {
            const colLower = col.toLowerCase();
            if (colLower.includes('agent') || colLower.includes('name')) {
                agentCol = col;
                break;
            }
        }
        
        // Find RONA column
        let ronaCol = null;
        for (const col of columns) {
            const colLower = col.toLowerCase();
            if (colLower.includes('rona')) {
                ronaCol = col;
                break;
            }
        }
        
        // Fallback to first two columns
        if (!agentCol && columns.length >= 1) agentCol = columns[0];
        if (!ronaCol && columns.length >= 2) ronaCol = columns[1];
        
        console.log('RONA Trend: using agentCol =', agentCol, ', ronaCol =', ronaCol);
        
        return data.map(row => {
            const agentName = agentCol ? String(row[agentCol] || '').trim() : '';
            const rona = ronaCol ? parseInt(row[ronaCol]) || 0 : 0;
            
            return {
                agentName: agentName,
                rona: rona
            };
        }).filter(row => {
            // Filter out empty and header rows
            if (!row.agentName || row.agentName === '') return false;
            const nameLower = row.agentName.toLowerCase();
            // Skip header-like values
            if (nameLower.includes('agent') && nameLower.includes('name')) return false;
            if (nameLower === 'name' || nameLower === 'agent') return false;
            return true;
        });
    },

    /**
     * Get value from row with multiple possible column names
     */
    getValue: function(row, possibleKeys) {
        // First try exact match
        for (const key of possibleKeys) {
            if (row.hasOwnProperty(key) && row[key] !== undefined && row[key] !== null) {
                return row[key];
            }
        }
        
        // Try case-insensitive exact match
        const rowKeys = Object.keys(row);
        for (const key of possibleKeys) {
            const found = rowKeys.find(rk => rk.toLowerCase().trim() === key.toLowerCase().trim());
            if (found && row[found] !== undefined && row[found] !== null) {
                return row[found];
            }
        }
        
        // Try partial match (column contains the key)
        for (const key of possibleKeys) {
            const keyLower = key.toLowerCase().trim();
            const found = rowKeys.find(rk => {
                const rkLower = rk.toLowerCase().trim();
                return rkLower.includes(keyLower) || keyLower.includes(rkLower);
            });
            if (found && row[found] !== undefined && row[found] !== null) {
                return row[found];
            }
        }
        
        // Try matching key words
        for (const key of possibleKeys) {
            const keyWords = key.toLowerCase().split(/[\s_]+/).filter(w => w.length > 2);
            if (keyWords.length > 0) {
                const found = rowKeys.find(rk => {
                    const rkLower = rk.toLowerCase();
                    return keyWords.every(word => rkLower.includes(word));
                });
                if (found && row[found] !== undefined && row[found] !== null) {
                    return row[found];
                }
            }
        }
        
        return '';
    },

    /**
     * Parse date from various formats
     */
    parseDate: function(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        
        // Try parsing common date formats
        const dateStr = String(value);
        
        // DD/MM/YYYY format
        const ddmmyyyy = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (ddmmyyyy) {
            return new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
        }
        
        // Try native Date parsing
        const parsed = new Date(dateStr);
        return isNaN(parsed.getTime()) ? null : parsed;
    },

    /**
     * Detect type of email change
     */
    detectEmailChangeType: function(oldValue, newValue) {
        if (!oldValue || !newValue) return 'unknown';
        
        const old = oldValue.toLowerCase();
        const newVal = newValue.toLowerCase();
        
        // Check for dot/comma manipulation
        if (old.replace(/[.,]/g, '') === newVal.replace(/[.,]/g, '')) {
            return 'punctuation';
        }
        
        // Check for character addition/removal
        if (Math.abs(old.length - newVal.length) <= 2) {
            return 'minor_edit';
        }
        
        // Domain change
        const oldDomain = old.split('@')[1];
        const newDomain = newVal.split('@')[1];
        if (oldDomain !== newDomain) {
            return 'domain_change';
        }
        
        return 'significant_change';
    },

    /**
     * Get unique managers from all data
     */
    getUniqueManagers: function() {
        const managers = new Set();

        if (this.processedData.caseRecordType) {
            this.processedData.caseRecordType.forEach(r => r.manager && managers.add(r.manager));
        }
        if (this.processedData.proactiveType) {
            this.processedData.proactiveType.forEach(r => r.manager && managers.add(r.manager));
        }
        if (this.processedData.age48hrs) {
            this.processedData.age48hrs.forEach(r => r.manager && managers.add(r.manager));
        }
        // Include Genesys supervisors as managers
        if (window.JsonDataLoader) {
            var genesysMap = JsonDataLoader.getGenesysSupervisorMapping();
            Object.values(genesysMap).forEach(function(sup) { if (sup) managers.add(sup); });
        }

        return Array.from(managers).sort();
    },

    /**
     * Get unique agents from all data (optionally filtered by manager)
     */
    getUniqueAgents: function(manager = '') {
        const agents = new Set();
        
        // Build agent-manager mapping to filter agents by manager
        const agentManagerMap = this.buildAgentManagerMapping();
        
        const addAgent = (agentName) => {
            if (!agentName) return;
            // If manager filter is set, only add agents belonging to that manager
            if (manager) {
                if (agentManagerMap[agentName] === manager) {
                    agents.add(agentName);
                }
            } else {
                agents.add(agentName);
            }
        };
        
        if (this.processedData.caseRecordType) {
            this.processedData.caseRecordType.forEach(r => addAgent(r.caseOwner));
        }
        if (this.processedData.shortCalls) {
            this.processedData.shortCalls.forEach(r => addAgent(r.agentName));
        }
        if (this.processedData.ronaTrend) {
            this.processedData.ronaTrend.forEach(r => addAgent(r.agentName));
        }
        if (this.processedData.emailChanges) {
            this.processedData.emailChanges.forEach(r => addAgent(r.editedBy));
        }
        if (this.processedData.age48hrs) {
            this.processedData.age48hrs.forEach(r => addAgent(r.caseOwner));
        }
        
        return Array.from(agents).sort();
    },

    /**
     * Filter data by agent name
     */
    filterByAgent: function(data, agent) {
        if (!agent) return data;

        const agentUpper = agent.trim().toUpperCase();
        var nameSet = new Set([agent.trim()]);
        var sc = (data.shortCalls || []).filter(r => r.agentName && r.agentName.trim().toUpperCase() === agentUpper);
        this._preserveDateRows(sc, data.shortCalls, nameSet);
        var rt = (data.ronaTrend || []).filter(r => r.agentName && r.agentName.trim().toUpperCase() === agentUpper);
        this._preserveDateRows(rt, data.ronaTrend, nameSet);

        return {
            caseRecordType: (data.caseRecordType || []).filter(r =>
                r.caseOwner && r.caseOwner.trim().toUpperCase() === agentUpper
            ),
            proactiveType: (data.proactiveType || []).filter(r =>
                r.caseOwner && r.caseOwner.trim().toUpperCase() === agentUpper
            ),
            age48hrs: (data.age48hrs || []).filter(r =>
                r.caseOwner && r.caseOwner.trim().toUpperCase() === agentUpper
            ),
            emailChanges: (data.emailChanges || []).filter(r =>
                r.editedBy && r.editedBy.trim().toUpperCase() === agentUpper
            ),
            shortCalls: sc,
            ronaTrend: rt
        };
    },

    getUniqueAgentsForManagers: function(managers) {
        if (!managers || !managers.length) return this.getUniqueAgents();
        var managerSet = new Set(managers);
        var primaryMap = this._buildPrimaryManagerMap();
        var agentManagerMap = this.buildAgentManagerMapping();
        var agents = new Set();
        Object.keys(primaryMap).forEach(function(agent) {
            if (managerSet.has(primaryMap[agent])) agents.add(agent);
        });
        Object.entries(agentManagerMap).forEach(function(entry) {
            if (managerSet.has(entry[1]) && !primaryMap[entry[0]]) agents.add(entry[0]);
        });
        return Array.from(agents).sort();
    },

    filterByManagers: function(managers) {
        if (!managers || !managers.length) return this.processedData;
        var self = this;
        var managerSet = new Set(managers);
        var primaryMap = this._buildPrimaryManagerMap();
        var agentManagerMap = this.buildAgentManagerMapping();
        var agentSet = new Set();
        Object.keys(primaryMap).forEach(function(agent) {
            if (managerSet.has(primaryMap[agent])) agentSet.add(agent);
        });
        Object.entries(agentManagerMap).forEach(function(entry) {
            if (managerSet.has(entry[1]) && !primaryMap[entry[0]]) agentSet.add(entry[0]);
        });
        var sc = (self.processedData.shortCalls || []).filter(function(r) { return agentSet.has(r.agentName); });
        self._preserveDateRows(sc, self.processedData.shortCalls, agentSet);
        var rt = (self.processedData.ronaTrend || []).filter(function(r) { return agentSet.has(r.agentName); });
        self._preserveDateRows(rt, self.processedData.ronaTrend, agentSet);
        return {
            caseRecordType: (self.processedData.caseRecordType || []).filter(function(r) { return managerSet.has(r.manager); }),
            proactiveType: (self.processedData.proactiveType || []).filter(function(r) { return managerSet.has(r.manager); }),
            age48hrs: (self.processedData.age48hrs || []).filter(function(r) { return managerSet.has(r.manager); }),
            emailChanges: (self.processedData.emailChanges || []).filter(function(r) { return agentSet.has(r.editedBy) || managerSet.has(r.manager); }),
            shortCalls: sc,
            ronaTrend: rt
        };
    },

    filterByAgents: function(data, agents) {
        if (!agents || !agents.length) return data;
        var self = this;
        var agentSet = new Set(agents.map(function(a) { return a.trim().toUpperCase(); }));
        var match = function(name) { return name && agentSet.has(name.trim().toUpperCase()); };
        var nameSet = new Set(agents.map(function(a) { return a.trim(); }));
        var sc = (data.shortCalls || []).filter(function(r) { return match(r.agentName); });
        self._preserveDateRows(sc, data.shortCalls, nameSet);
        var rt = (data.ronaTrend || []).filter(function(r) { return match(r.agentName); });
        self._preserveDateRows(rt, data.ronaTrend, nameSet);
        return {
            caseRecordType: (data.caseRecordType || []).filter(function(r) { return match(r.caseOwner); }),
            proactiveType: (data.proactiveType || []).filter(function(r) { return match(r.caseOwner); }),
            age48hrs: (data.age48hrs || []).filter(function(r) { return match(r.caseOwner); }),
            emailChanges: (data.emailChanges || []).filter(function(r) { return match(r.editedBy); }),
            shortCalls: sc,
            ronaTrend: rt
        };
    },

    /**
     * Build agent to manager mapping from available data
     */
    buildAgentManagerMapping: function() {
        const mapping = {};

        // Get agent-manager relationships from case record type
        if (this.processedData.caseRecordType?.length) {
            this.processedData.caseRecordType.forEach(row => {
                if (row.caseOwner && row.manager) {
                    mapping[row.caseOwner] = row.manager;
                }
            });
        }

        // Get from proactive type
        if (this.processedData.proactiveType?.length) {
            this.processedData.proactiveType.forEach(row => {
                if (row.caseOwner && row.manager) {
                    mapping[row.caseOwner] = row.manager;
                }
            });
        }

        // Get from age48hrs
        if (this.processedData.age48hrs?.length) {
            this.processedData.age48hrs.forEach(row => {
                if (row.caseOwner && row.manager) {
                    mapping[row.caseOwner] = row.manager;
                }
            });
        }

        // Get from Genesys supervisor mapping (fills gaps for agents only in Genesys)
        if (window.JsonDataLoader) {
            const genesysMap = JsonDataLoader.getGenesysSupervisorMapping();
            Object.entries(genesysMap).forEach(function(entry) {
                if (!mapping[entry[0]] && entry[1]) {
                    mapping[entry[0]] = entry[1];
                }
            });
        }

        return mapping;
    },

    /**
     * Filter data by manager
     */
    _preserveDateRows: function(filtered, original, agentSet) {
        if (original && original._dateRows) {
            if (agentSet) {
                filtered._dateRows = original._dateRows.filter(function(r) { return agentSet.has(r.agentName); });
            } else {
                filtered._dateRows = original._dateRows;
            }
        }
        return filtered;
    },

    _buildPrimaryManagerMap: function() {
        var counts = {};
        var allSources = [].concat(
            this.processedData.caseRecordType || [],
            this.processedData.proactiveType || [],
            this.processedData.age48hrs || []
        );
        allSources.forEach(function(r) {
            if (!r.caseOwner || !r.manager) return;
            if (!counts[r.caseOwner]) counts[r.caseOwner] = {};
            counts[r.caseOwner][r.manager] = (counts[r.caseOwner][r.manager] || 0) + 1;
        });
        var primary = {};
        Object.keys(counts).forEach(function(agent) {
            var best = '', bestCount = 0;
            Object.keys(counts[agent]).forEach(function(mgr) {
                if (counts[agent][mgr] > bestCount) { best = mgr; bestCount = counts[agent][mgr]; }
            });
            primary[agent] = best;
        });
        return primary;
    },

    filterByManager: function(manager) {
        if (!manager) return this.processedData;

        var primaryMap = this._buildPrimaryManagerMap();
        var agentManagerMap = this.buildAgentManagerMapping();

        var agentsUnderManager = new Set();
        Object.keys(primaryMap).forEach(function(agent) {
            if (primaryMap[agent] === manager) agentsUnderManager.add(agent);
        });
        Object.entries(agentManagerMap).forEach(function(entry) {
            if (entry[1] === manager && !primaryMap[entry[0]]) agentsUnderManager.add(entry[0]);
        });

        var agentSet = agentsUnderManager;

        var self = this;
        var sc = this.processedData.shortCalls.filter(function(r) { return agentSet.has(r.agentName); });
        self._preserveDateRows(sc, self.processedData.shortCalls, agentSet);
        var rt = this.processedData.ronaTrend.filter(function(r) { return agentSet.has(r.agentName); });
        self._preserveDateRows(rt, self.processedData.ronaTrend, agentSet);
        return {
            caseRecordType: this.processedData.caseRecordType.filter(function(r) { return r.manager === manager; }),
            proactiveType: this.processedData.proactiveType.filter(function(r) { return r.manager === manager; }),
            age48hrs: this.processedData.age48hrs.filter(function(r) { return r.manager === manager; }),
            emailChanges: this.processedData.emailChanges.filter(function(r) { return agentSet.has(r.editedBy) || r.manager === manager; }),
            shortCalls: sc,
            ronaTrend: rt
        };
    },

    /**
     * Get summary statistics
     */
    getSummary: function() {
        const data = this.processedData;
        
        return {
            totalCases: (data.caseRecordType?.length || 0) + (data.proactiveType?.length || 0),
            over48hrs: data.age48hrs?.filter(r => r.age > 48).length || 0,
            emailChanges: data.emailChanges?.length || 0,
            shortCallsTotal: data.shortCalls?.reduce((sum, r) => sum + r.count, 0) || 0,
            ronaTotal: data.ronaTrend?.reduce((sum, r) => sum + r.rona, 0) || 0,
            totalAgents: this.getUniqueAgents().length
        };
    },

    /**
     * Filter all data by date range
     */
    filterByDateRange: function(data, startDate, endDate) {
        if (!startDate && !endDate) return data;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const isInRange = (date) => {
            if (!date || !(date instanceof Date) || isNaN(date)) return true;
            if (start && date < start) return false;
            if (end && date > end) return false;
            return true;
        };

        const filteredEmailChanges = (data.emailChanges || []).filter(r => isInRange(r.editDate));

        const agentsInDateRange = new Set();
        filteredEmailChanges.forEach(r => { if (r.editedBy) agentsInDateRange.add(r.editedBy); });

        var sc = data.shortCalls || [];
        var rt = data.ronaTrend || [];
        if (sc._dateRows) {
            var fsc = [].concat(sc);
            fsc._dateRows = sc._dateRows.filter(function(r) { return isInRange(r.callDate); });
            sc = fsc;
        }
        if (rt._dateRows) {
            var frt = [].concat(rt);
            frt._dateRows = rt._dateRows.filter(function(r) { return isInRange(r.callDate); });
            rt = frt;
        }

        return {
            caseRecordType: data.caseRecordType || [],
            proactiveType: data.proactiveType || [],
            age48hrs: data.age48hrs || [],
            emailChanges: filteredEmailChanges,
            shortCalls: sc,
            ronaTrend: rt
        };
    },

    /**
     * Get date range from the data
     */
    getDateRange: function() {
        const dates = [];
        
        // Collect dates from email changes
        if (this.processedData.emailChanges?.length) {
            this.processedData.emailChanges.forEach(row => {
                if (row.editDate && row.editDate instanceof Date && !isNaN(row.editDate)) {
                    dates.push(row.editDate);
                }
            });
        }
        
        if (dates.length === 0) {
            return { minDate: null, maxDate: null, range: 'No date information available' };
        }
        
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        const formatDate = (date) => {
            return date.toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
        };
        
        return {
            minDate: minDate,
            maxDate: maxDate,
            range: `${formatDate(minDate)} - ${formatDate(maxDate)}`,
            lastRecord: formatDate(maxDate)
        };
    },

    /**
     * Get manager statistics for focus areas
     */
    getManagerStats: function(filteredData) {
        const managerStats = {};
        const data = filteredData || this.processedData;
        const globalMap = this.buildAgentManagerMapping();
        const localMap = {};
        (data.caseRecordType || []).forEach(r => { if (r.caseOwner && r.manager) localMap[r.caseOwner] = r.manager; });
        (data.proactiveType || []).forEach(r => { if (r.caseOwner && r.manager) localMap[r.caseOwner] = r.manager; });
        (data.age48hrs || []).forEach(r => { if (r.caseOwner && r.manager) localMap[r.caseOwner] = r.manager; });
        const agentManagerMap = Object.assign({}, globalMap, localMap);
        
        // Initialize helper to get or create manager stats
        const getManagerStat = (manager) => {
            if (!manager) return null;
            if (!managerStats[manager]) {
                managerStats[manager] = {
                    manager: manager,
                    agents: new Set(),
                    agedCases: 0,
                    criticalAgedCases: 0,
                    shortCalls: 0,
                    rona: 0,
                    emailChanges: 0,
                    totalCases: 0,
                    breakdown: {
                        agedCases: 0,
                        shortCalls: 0,
                        rona: 0,
                        emailChanges: 0
                    },
                    breakdownAgents: {
                        agedCases: new Set(),
                        shortCalls: new Set(),
                        rona: new Set(),
                        emailChanges: new Set()
                    }
                };
            }
            return managerStats[manager];
        };
        
        // Collect from age48hrs (has manager directly)
        if (data.age48hrs?.length) {
            data.age48hrs.forEach(row => {
                const stat = getManagerStat(row.manager);
                if (!stat) return;
                
                stat.agents.add(row.caseOwner);
                stat.totalCases++;
                if (row.age > 48) {
                    stat.agedCases++;
                    stat.breakdown.agedCases++;
                    if (row.caseOwner) stat.breakdownAgents.agedCases.add(row.caseOwner);
                }
                if (row.age > 96) stat.criticalAgedCases++;
            });
        }
        
        // Collect from case record type (has manager directly)
        if (data.caseRecordType?.length) {
            data.caseRecordType.forEach(row => {
                const stat = getManagerStat(row.manager);
                if (stat) stat.agents.add(row.caseOwner);
            });
        }
        
        // Collect from proactive type (has manager directly)
        if (data.proactiveType?.length) {
            data.proactiveType.forEach(row => {
                const stat = getManagerStat(row.manager);
                if (stat) stat.agents.add(row.caseOwner);
            });
        }
        
        // Collect from short calls (need to map agent to manager)
        if (data.shortCalls?.length) {
            data.shortCalls.forEach(row => {
                const manager = agentManagerMap[row.agentName];
                const stat = getManagerStat(manager);
                if (stat) {
                    stat.agents.add(row.agentName);
                    stat.shortCalls += row.count || 0;
                    stat.breakdown.shortCalls += row.count || 0;
                    if (row.agentName) stat.breakdownAgents.shortCalls.add(row.agentName);
                }
            });
        }
        
        // Collect from RONA (need to map agent to manager)
        if (data.ronaTrend?.length) {
            data.ronaTrend.forEach(row => {
                const manager = agentManagerMap[row.agentName];
                const stat = getManagerStat(manager);
                if (stat) {
                    stat.agents.add(row.agentName);
                    stat.rona += row.rona || 0;
                    stat.breakdown.rona += row.rona || 0;
                    if (row.agentName) stat.breakdownAgents.rona.add(row.agentName);
                }
            });
        }
        
        // Collect from email changes (use row.manager if available, then mapping)
        if (data.emailChanges?.length) {
            data.emailChanges.forEach(row => {
                const manager = row.manager || agentManagerMap[row.editedBy];
                const stat = getManagerStat(manager);
                if (stat) {
                    stat.agents.add(row.editedBy);
                    stat.emailChanges++;
                    stat.breakdown.emailChanges++;
                    if (row.editedBy) stat.breakdownAgents.emailChanges.add(row.editedBy);
                }
            });
        }
        
        // Convert to array and calculate focus score
        const result = Object.values(managerStats).map(m => {
            const excludeNames = /automated|system|process|bot|unknown/i;
            const agentList = Array.from(m.agents).map(a => (a || '').trim()).filter(a => a && a.length > 1 && !excludeNames.test(a));
            const agentCount = agentList.length;
            
            // Focus score based on critical metrics
            const focusScore = (m.criticalAgedCases * 3) + (m.agedCases * 1) + 
                              (m.shortCalls > 50 ? 2 : 0) + (m.rona > 50 ? 2 : 0);
            
            return {
                manager: m.manager,
                agentCount: agentCount,
                agents: agentList,
                agentNames: agentList.slice(0, 3).join(', ') + (agentList.length > 3 ? '...' : ''),
                agedCases: m.agedCases,
                criticalAgedCases: m.criticalAgedCases,
                shortCalls: m.shortCalls,
                rona: m.rona,
                emailChanges: m.emailChanges,
                breakdown: m.breakdown,
                breakdownAgents: {
                    agedCases: Array.from(m.breakdownAgents.agedCases).map(a => (a || '').trim()).filter(a => a && a.length > 1 && !excludeNames.test(a)),
                    shortCalls: Array.from(m.breakdownAgents.shortCalls).map(a => (a || '').trim()).filter(a => a && a.length > 1 && !excludeNames.test(a)),
                    rona: Array.from(m.breakdownAgents.rona).map(a => (a || '').trim()).filter(a => a && a.length > 1 && !excludeNames.test(a)),
                    emailChanges: Array.from(m.breakdownAgents.emailChanges).map(a => (a || '').trim()).filter(a => a && a.length > 1 && !excludeNames.test(a))
                },
                totalCases: m.totalCases,
                focusScore: focusScore,
                focusLevel: focusScore >= 10 ? 'High' : (focusScore >= 5 ? 'Medium' : 'Low')
            };
        });
        
        // Sort by focus score (highest first)
        result.sort((a, b) => b.focusScore - a.focusScore);
        
        return result;
    },

    loadFromJSON: function(transformedData) {
        this.processedData = transformedData;
        this.rawData = {};
        return this.processedData;
    }
};

window.DataParser = DataParser;
