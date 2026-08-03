const JsonDataLoader = {
    rawData: null,

    load: function(url) {
        return fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch JSON: ' + response.status);
                return response.json();
            })
            .then(json => {
                this.rawData = json;
                return this.parse(json);
            });
    },

    loadFromObject: function(json) {
        this.rawData = json;
        return this.parse(json);
    },

    _mergeRows: function(json, prefix) {
        var rows = this._extractRows(json[prefix]);
        for (var i = 1; i <= 10; i++) {
            if (json[prefix + i]) {
                rows = rows.concat(this._extractRows(json[prefix + i]));
            }
        }
        return rows;
    },

    parse: function(json, startDate, endDate) {
        const genesysRows = this._mergeRows(json, 'genesys');
        const casesRows = this._mergeRows(json, 'cases');
        const emailRows = this._mergeRows(json, 'emailChanges');

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const filteredCases = this._filterByDateMulti(casesRows, ['CREATED_DATE', 'GSI_CASE_DETAILS_IND[CREATED_DATE]', '[CREATED_DATE]'], start, end);
        const filteredGenesys = this._filterByDateMulti(genesysRows, ['CALL_DATE', 'Genesys_RONA_ShortCalls_IND[CALL_DATE]', '[CALL_DATE]'], start, end);
        const filteredEmails = this._filterByDateMulti(emailRows, ['EDIT_DATE', 'Email_Change_IND[EDIT_DATE]', '[EDIT_DATE]'], start, end);

        console.log('[JsonDataLoader] Merged rows — cases:', casesRows.length, 'genesys:', genesysRows.length, 'emails:', emailRows.length);
        console.log('[JsonDataLoader] After date filter — cases:', filteredCases.length, 'genesys:', filteredGenesys.length, 'emails:', filteredEmails.length);

        this._nameRegistry = {};
        this._nameDisplayMap = {};
        this._mergeMap = {};
        var self = this;
        filteredGenesys.forEach(function(r) {
            var name = self._genesys(r, 'AGENT_NAME');
            if (name) self._registerName(name);
            var sup = self._genesys(r, 'SUPERVISOR_NAME');
            if (sup) self._registerName(sup);
        });
        filteredCases.forEach(function(r) {
            var owner = self._case(r, 'NAME');
            if (owner) self._registerName(owner);
            var mgr = self._case(r, 'USL_CASE_OWNER_MANAGER_C');
            if (mgr) self._registerName(mgr);
        });
        filteredEmails.forEach(function(r) {
            var editor = self._email(r, 'EDITED_BY');
            if (editor) self._registerName(editor);
            var mgr = self._email(r, 'MANAGER_NAME');
            if (mgr) self._registerName(mgr);
        });
        this._buildMergeMap();
        var mergeCount = Object.keys(this._mergeMap).length;
        if (mergeCount > 0) console.log('[JsonDataLoader] Name merge map:', mergeCount, 'subset merges');

        var result = {
            caseRecordType: this._transformCases(filteredCases),
            proactiveType: this._transformProactive(filteredCases),
            age48hrs: this._transformAge(filteredCases),
            emailChanges: this._transformEmails(filteredEmails),
            shortCalls: this._aggregateShortCalls(filteredGenesys),
            ronaTrend: this._aggregateRona(filteredGenesys)
        };
        console.log('[JsonDataLoader] Transformed — caseRecordType:', result.caseRecordType.length, 'proactive:', result.proactiveType.length, 'age48:', result.age48hrs.length);
        return result;
    },

    reparse: function(startDate, endDate) {
        if (!this.rawData) return null;
        return this.parse(this.rawData, startDate, endDate);
    },


    _col: function(row, shortName, prefix) {
        if (row.hasOwnProperty(shortName)) return row[shortName];
        const full = prefix + '[' + shortName + ']';
        if (row.hasOwnProperty(full)) return row[full];
        const bracketed = '[' + shortName + ']';
        if (row.hasOwnProperty(bracketed)) return row[bracketed];
        return undefined;
    },

    _case: function(row, col) {
        return this._col(row, col, 'GSI_CASE_DETAILS_IND');
    },

    _extractRows: function(section) {
        if (!section) return [];
        try {
            return section.results[0].tables[0].rows || [];
        } catch (e) {
            return [];
        }
    },

    _filterByDate: function(rows, dateCol, start, end) {
        if (!start && !end) return rows;
        return rows.filter(row => {
            const val = row[dateCol];
            if (!val) return true;
            const d = new Date(val);
            if (isNaN(d)) return true;
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        });
    },

    _filterByDateMulti: function(rows, possibleCols, start, end) {
        if (!start && !end) return rows;
        return rows.filter(row => {
            var val;
            for (var i = 0; i < possibleCols.length; i++) {
                if (row.hasOwnProperty(possibleCols[i])) { val = row[possibleCols[i]]; break; }
            }
            if (!val) return true;
            const d = new Date(val);
            if (isNaN(d)) return true;
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        });
    },

    _transformCases: function(rows) {
        return rows.map(r => ({
            caseNumber: this._case(r, 'CASE_NUMBER') || '',
            caseOwner: this._displayName(this._resolveKey(this._canonicalName(this._case(r, 'NAME')))) || this._cleanName(this._case(r, 'NAME')),
            manager: this._displayName(this._resolveKey(this._canonicalName(this._case(r, 'USL_CASE_OWNER_MANAGER_C')))) || this._cleanName(this._case(r, 'USL_CASE_OWNER_MANAGER_C')),
            recordType: this._case(r, 'ESC_CASE_TYPE_C') || '',
            origin: this._case(r, 'ORIGIN') || '',
            status: this._case(r, 'STATUS') || '',
            createdDate: this._case(r, 'CREATED_DATE') || ''
        })).filter(r => r.caseNumber);
    },

    _transformProactive: function(rows) {
        var self = this;
        return rows
            .filter(r => this._case(r, 'ESC_PROACTIVE_TYPE_C'))
            .map(r => ({
                caseNumber: this._case(r, 'CASE_NUMBER') || '',
                caseOwner: self._displayName(self._resolveKey(self._canonicalName(self._case(r, 'NAME')))) || self._cleanName(self._case(r, 'NAME')),
                manager: self._displayName(self._resolveKey(self._canonicalName(self._case(r, 'USL_CASE_OWNER_MANAGER_C')))) || self._cleanName(self._case(r, 'USL_CASE_OWNER_MANAGER_C')),
                proactiveType: this._case(r, 'ESC_PROACTIVE_TYPE_C') || '',
                createdDate: this._case(r, 'CREATED_DATE') || ''
            }))
            .filter(r => r.caseNumber);
    },

    _transformAge: function(rows) {
        var self = this;
        return rows.map(r => {
            const age = parseFloat(this._case(r, 'ESC_CASE_AGE_HOURS_C')) || 0;
            return {
                caseNumber: String(this._case(r, 'CASE_NUMBER') || ''),
                caseOwner: self._displayName(self._resolveKey(self._canonicalName(self._case(r, 'NAME')))) || self._cleanName(self._case(r, 'NAME')),
                manager: self._displayName(self._resolveKey(self._canonicalName(self._case(r, 'USL_CASE_OWNER_MANAGER_C')))) || self._cleanName(self._case(r, 'USL_CASE_OWNER_MANAGER_C')),
                age: age,
                open: this._case(r, 'STATUS') || '',
                origin: this._case(r, 'ORIGIN') || '',
                status: age > 96 ? 'critical' : (age > 48 ? 'warning' : 'normal'),
                createdDate: this._case(r, 'CREATED_DATE') || ''
            };
        }).filter(r => r.caseNumber);
    },

    _normalizeName: function(name) {
        if (!name) return '';
        name = name.trim().replace(/[\s.]+$/g, '').replace(/\s+/g, ' ');
        if (name.indexOf(',') !== -1) {
            var parts = name.split(',');
            return ((parts[1] || '').trim() + ' ' + parts[0].trim()).replace(/[\s.]+$/g, '');
        }
        return name;
    },

    _canonicalName: function(name) {
        var n = this._normalizeName(name);
        if (!n) return '';
        var upper = n.toUpperCase();
        if (upper === 'AUTOMATED PROCESS') return '';
        var words = upper.split(' ').filter(function(w) { return w.length > 0; });
        var unique = [];
        var seen = {};
        for (var i = 0; i < words.length; i++) {
            if (!seen[words[i]]) { seen[words[i]] = true; unique.push(words[i]); }
        }
        unique.sort();
        return unique.join(' ');
    },

    _nameRegistry: {},
    _nameDisplayMap: {},

    _registerName: function(rawName) {
        var key = this._canonicalName(rawName);
        if (!key) return key;
        if (!this._nameRegistry[key]) {
            this._nameRegistry[key] = [];
        }
        var norm = this._normalizeName(rawName);
        if (this._nameRegistry[key].indexOf(norm) === -1) {
            this._nameRegistry[key].push(norm);
        }
        return key;
    },

    _buildMergeMap: function() {
        var keys = Object.keys(this._nameRegistry);
        var mergeTarget = {};
        for (var i = 0; i < keys.length; i++) {
            for (var j = i + 1; j < keys.length; j++) {
                var wordsA = keys[i].split(' ');
                var wordsB = keys[j].split(' ');
                var aInB = wordsA.every(function(w) { return wordsB.indexOf(w) !== -1; });
                var bInA = wordsB.every(function(w) { return wordsA.indexOf(w) !== -1; });
                if (aInB && !bInA) {
                    mergeTarget[keys[i]] = mergeTarget[keys[j]] || keys[j];
                } else if (bInA && !aInB) {
                    mergeTarget[keys[j]] = mergeTarget[keys[i]] || keys[i];
                }
            }
        }
        for (var k in mergeTarget) {
            var target = mergeTarget[k];
            while (mergeTarget[target]) target = mergeTarget[target];
            mergeTarget[k] = target;
        }
        this._nameDisplayMap = {};
        for (var key in this._nameRegistry) {
            var finalKey = mergeTarget[key] || key;
            if (!this._nameDisplayMap[finalKey]) {
                var allNames = this._nameRegistry[finalKey] || [];
                this._nameDisplayMap[finalKey] = allNames.reduce(function(a, b) { return a.length >= b.length ? a : b; }, '');
            }
            if (key !== finalKey) {
                var names = this._nameRegistry[key] || [];
                var current = this._nameDisplayMap[finalKey] || '';
                names.forEach(function(n) { if (n.length > current.length) current = n; });
                this._nameDisplayMap[finalKey] = current;
            }
        }
        this._mergeMap = mergeTarget;
    },

    _resolveKey: function(canonKey) {
        if (!this._mergeMap) return canonKey;
        return this._mergeMap[canonKey] || canonKey;
    },

    _displayName: function(canonKey) {
        var resolved = this._resolveKey(canonKey);
        return this._nameDisplayMap[resolved] || resolved;
    },

    _cleanName: function(val) {
        if (!val) return '';
        return String(val).trim().replace(/[\s.]+$/g, '').replace(/\s+/g, ' ');
    },

    _email: function(row, col) {
        return this._col(row, col, 'Email_Change_IND');
    },

    _genesys: function(row, col) {
        return this._col(row, col, 'Genesys_RONA_ShortCalls_IND');
    },

    _transformEmails: function(rows) {
        return rows.map(r => {
            const oldValue = String(this._email(r, 'OLD_VALUE') || '');
            const newValue = String(this._email(r, 'NEW_VALUE') || '');
            const editDateStr = this._email(r, 'EDIT_DATE');
            const editDate = editDateStr ? new Date(editDateStr) : null;

            return {
                fieldEvent: 'Email',
                editDate: (editDate && !isNaN(editDate)) ? editDate : null,
                oldValue: oldValue,
                newValue: newValue,
                editedBy: this._displayName(this._resolveKey(this._canonicalName(this._email(r, 'EDITED_BY')))) || this._cleanName(this._email(r, 'EDITED_BY')),
                manager: this._displayName(this._resolveKey(this._canonicalName(this._email(r, 'MANAGER_NAME')))) || this._cleanName(this._email(r, 'MANAGER_NAME')),
                changeType: this._detectEmailChangeType(oldValue, newValue)
            };
        }).filter(r => r.editedBy);
    },

    _aggregateShortCalls: function(rows) {
        const agentMap = {};
        const dateRows = [];
        var self = this;
        rows.forEach(r => {
            var canonKey = self._canonicalName(self._genesys(r, 'AGENT_NAME'));
            if (!canonKey) return;
            var key = self._resolveKey(canonKey);
            var count = parseFloat(self._genesys(r, 'SHORT_CALLS_UNDER_5MIN')) || 0;
            if (!agentMap[key]) agentMap[key] = 0;
            agentMap[key] += count;
            var callDate = self._genesys(r, 'CALL_DATE');
            if (callDate && count > 0) {
                var d = new Date(callDate);
                if (!isNaN(d)) dateRows.push({ agentName: self._displayName(key), count: Math.round(count), callDate: d });
            }
        });
        var result = Object.entries(agentMap).map(([key, count]) => ({
            agentName: self._displayName(key),
            count: Math.round(count)
        }));
        result._dateRows = dateRows;
        return result;
    },

    _aggregateRona: function(rows) {
        const agentMap = {};
        const dateRows = [];
        var self = this;
        rows.forEach(r => {
            var canonKey = self._canonicalName(self._genesys(r, 'AGENT_NAME'));
            if (!canonKey) return;
            var key = self._resolveKey(canonKey);
            var rona = parseFloat(self._genesys(r, 'RONA_CALLS')) || 0;
            if (!agentMap[key]) agentMap[key] = 0;
            agentMap[key] += rona;
            var callDate = self._genesys(r, 'CALL_DATE');
            if (callDate && rona > 0) {
                var d = new Date(callDate);
                if (!isNaN(d)) dateRows.push({ agentName: self._displayName(key), rona: Math.round(rona), callDate: d });
            }
        });
        var result = Object.entries(agentMap).map(([key, rona]) => ({
            agentName: self._displayName(key),
            rona: Math.round(rona)
        }));
        result._dateRows = dateRows;
        return result;
    },

    _detectEmailChangeType: function(oldValue, newValue) {
        if (!oldValue || !newValue) return 'unknown';
        const old = oldValue.toLowerCase();
        const newVal = newValue.toLowerCase();
        if (old.replace(/[.,]/g, '') === newVal.replace(/[.,]/g, '')) return 'punctuation';
        if (Math.abs(old.length - newVal.length) <= 2) return 'minor_edit';
        const oldDomain = old.split('@')[1];
        const newDomain = newVal.split('@')[1];
        if (oldDomain && newDomain && oldDomain !== newDomain) return 'domain_change';
        return 'significant_change';
    },

    getDateRange: function() {
        if (!this.rawData) return { minDate: null, maxDate: null };
        const dates = [];
        const addDate = (val) => {
            if (!val) return;
            const d = new Date(val);
            if (!isNaN(d)) dates.push(d);
        };
        this._mergeRows(this.rawData, 'genesys').forEach(r => addDate(this._genesys(r, 'CALL_DATE')));
        this._mergeRows(this.rawData, 'emailChanges').forEach(r => addDate(this._email(r, 'EDIT_DATE')));
        this._mergeRows(this.rawData, 'cases').forEach(r => {
            var d = this._case(r, 'CREATED_DATE');
            if (d) addDate(d);
        });
        if (dates.length === 0) return { minDate: null, maxDate: null };
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        const fmt = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        return { minDate, maxDate, range: `${fmt(minDate)} - ${fmt(maxDate)}`, lastRecord: fmt(maxDate) };
    },

    getGenesysSupervisorMapping: function() {
        if (!this.rawData) return {};
        const rows = this._mergeRows(this.rawData, 'genesys');
        const mapping = {};
        var self = this;
        rows.forEach(r => {
            var agentKey = self._canonicalName(self._genesys(r, 'AGENT_NAME'));
            var supKey = self._canonicalName(self._genesys(r, 'SUPERVISOR_NAME'));
            if (agentKey && supKey) {
                var resolvedAgent = self._displayName(self._resolveKey(agentKey));
                var resolvedSup = self._displayName(self._resolveKey(supKey));
                mapping[resolvedAgent] = resolvedSup;
            }
        });
        return mapping;
    }
};

window.JsonDataLoader = JsonDataLoader;
