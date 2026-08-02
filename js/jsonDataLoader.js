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
            caseOwner: this._cleanName(this._case(r, 'NAME')),
            manager: this._cleanName(this._case(r, 'USL_CASE_OWNER_MANAGER_C')),
            recordType: this._case(r, 'ESC_CASE_TYPE_C') || '',
            origin: this._case(r, 'ORIGIN') || '',
            status: this._case(r, 'STATUS') || '',
            createdDate: this._case(r, 'CREATED_DATE') || ''
        })).filter(r => r.caseNumber);
    },

    _transformProactive: function(rows) {
        return rows
            .filter(r => this._case(r, 'ESC_PROACTIVE_TYPE_C'))
            .map(r => ({
                caseNumber: this._case(r, 'CASE_NUMBER') || '',
                caseOwner: this._cleanName(this._case(r, 'NAME')),
                manager: this._cleanName(this._case(r, 'USL_CASE_OWNER_MANAGER_C')),
                proactiveType: this._case(r, 'ESC_PROACTIVE_TYPE_C') || '',
                createdDate: this._case(r, 'CREATED_DATE') || ''
            }))
            .filter(r => r.caseNumber);
    },

    _transformAge: function(rows) {
        return rows.map(r => {
            const age = parseFloat(this._case(r, 'ESC_CASE_AGE_HOURS_C')) || 0;
            return {
                caseNumber: String(this._case(r, 'CASE_NUMBER') || ''),
                caseOwner: this._cleanName(this._case(r, 'NAME')),
                manager: this._cleanName(this._case(r, 'USL_CASE_OWNER_MANAGER_C')),
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
                editedBy: this._cleanName(this._email(r, 'EDITED_BY')),
                manager: this._cleanName(this._email(r, 'MANAGER_NAME')),
                changeType: this._detectEmailChangeType(oldValue, newValue)
            };
        }).filter(r => r.editedBy);
    },

    _aggregateShortCalls: function(rows) {
        const agentMap = {};
        const dateRows = [];
        rows.forEach(r => {
            const agent = this._normalizeName(this._genesys(r, 'AGENT_NAME'));
            if (!agent) return;
            var count = parseFloat(this._genesys(r, 'SHORT_CALLS_UNDER_5MIN')) || 0;
            if (!agentMap[agent]) agentMap[agent] = 0;
            agentMap[agent] += count;
            var callDate = this._genesys(r, 'CALL_DATE');
            if (callDate && count > 0) {
                var d = new Date(callDate);
                if (!isNaN(d)) dateRows.push({ agentName: agent, count: Math.round(count), callDate: d });
            }
        });
        var result = Object.entries(agentMap).map(([agentName, count]) => ({
            agentName,
            count: Math.round(count)
        }));
        result._dateRows = dateRows;
        return result;
    },

    _aggregateRona: function(rows) {
        const agentMap = {};
        const dateRows = [];
        rows.forEach(r => {
            const agent = this._normalizeName(this._genesys(r, 'AGENT_NAME'));
            if (!agent) return;
            var rona = parseFloat(this._genesys(r, 'RONA_CALLS')) || 0;
            if (!agentMap[agent]) agentMap[agent] = 0;
            agentMap[agent] += rona;
            var callDate = this._genesys(r, 'CALL_DATE');
            if (callDate && rona > 0) {
                var d = new Date(callDate);
                if (!isNaN(d)) dateRows.push({ agentName: agent, rona: Math.round(rona), callDate: d });
            }
        });
        var result = Object.entries(agentMap).map(([agentName, rona]) => ({
            agentName,
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
        rows.forEach(r => {
            const agent = this._normalizeName(this._genesys(r, 'AGENT_NAME'));
            const supervisor = this._normalizeName(this._genesys(r, 'SUPERVISOR_NAME'));
            if (agent && supervisor) mapping[agent] = supervisor;
        });
        return mapping;
    }
};

window.JsonDataLoader = JsonDataLoader;
