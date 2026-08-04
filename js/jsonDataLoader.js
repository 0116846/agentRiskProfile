const JsonDataLoader = {
    rawData: null,
    _strippedData: null,

    _CASES_FIELDS: ['CASE_NUMBER', 'NAME', 'USL_CASE_OWNER_MANAGER_C', 'ESC_CASE_TYPE_C', 'ORIGIN', 'STATUS', 'CREATED_DATE', 'ESC_PROACTIVE_TYPE_C', 'ESC_CASE_AGE_HOURS_C'],
    _GENESYS_FIELDS: ['AGENT_NAME', 'SUPERVISOR_NAME', 'CALL_DATE', 'SHORT_CALLS_UNDER_5MIN', 'RONA_CALLS'],
    _EMAIL_FIELDS: ['EDIT_DATE', 'OLD_VALUE', 'NEW_VALUE', 'EDITED_BY', 'MANAGER_NAME'],

    _stripRow: function(row, fields, prefix) {
        var stripped = {};
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var val = this._col(row, f, prefix);
            if (val !== undefined) stripped[f] = val;
        }
        return stripped;
    },

    _stripRows: function(rows, fields, prefix) {
        var result = new Array(rows.length);
        for (var i = 0; i < rows.length; i++) {
            result[i] = this._stripRow(rows[i], fields, prefix);
        }
        return result;
    },

    load: function(url) {
        var self = this;
        return fetch(url)
            .then(function(response) {
                if (!response.ok) throw new Error('Failed to fetch JSON: ' + response.status);
                return response.json();
            })
            .then(function(json) {
                return self._ingestAndParse(json);
            });
    },

    loadFromObject: function(json) {
        return this._ingestAndParse(json);
    },

    _ingestAndParse: function(json) {
        var cases = this._mergeRows(json, 'cases', 'GSI_CASE_DETAILS_IND', this._CASES_FIELDS);
        var genesys = this._mergeRows(json, 'genesys', 'Genesys_RONA_ShortCalls_IND', this._GENESYS_FIELDS);
        var emails = this._mergeRows(json, 'emailChanges', 'Email_Change_IND', this._EMAIL_FIELDS);

        this._strippedData = { cases: cases, genesys: genesys, emails: emails };
        this.rawData = this._strippedData;

        return this.parse(this._strippedData);
    },

    _mergeRows: function(json, prefix, colPrefix, stripFields) {
        var rows = this._extractRows(json[prefix]);
        for (var i = 1; i <= 12; i++) {
            if (json[prefix + i]) {
                rows = rows.concat(this._extractRows(json[prefix + i]));
            }
        }
        if (stripFields && colPrefix) {
            rows = this._stripRows(rows, stripFields, colPrefix);
        }
        return rows;
    },

    parse: function(data, startDate, endDate) {
        var casesRows, genesysRows, emailRows;
        if (data && data.cases && data.genesys && data.emails) {
            casesRows = data.cases;
            genesysRows = data.genesys;
            emailRows = data.emails;
        } else {
            casesRows = this._mergeRows(data, 'cases', 'GSI_CASE_DETAILS_IND', this._CASES_FIELDS);
            genesysRows = this._mergeRows(data, 'genesys', 'Genesys_RONA_ShortCalls_IND', this._GENESYS_FIELDS);
            emailRows = this._mergeRows(data, 'emailChanges', 'Email_Change_IND', this._EMAIL_FIELDS);
        }

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const filteredCases = this._filterByDateMulti(casesRows, ['CREATED_DATE', 'GSI_CASE_DETAILS_IND[CREATED_DATE]', '[CREATED_DATE]'], start, end);
        const filteredGenesys = this._filterByDateMulti(genesysRows, ['CALL_DATE', 'Genesys_RONA_ShortCalls_IND[CALL_DATE]', '[CALL_DATE]'], start, end);
        const filteredEmails = this._filterByDateMulti(emailRows, ['EDIT_DATE', 'Email_Change_IND[EDIT_DATE]', '[EDIT_DATE]'], start, end);

        console.log('[JsonDataLoader] Merged rows — cases:', casesRows.length, 'genesys:', genesysRows.length, 'emails:', emailRows.length);
        if (casesRows.length > 0) console.log('[JsonDataLoader] Sample case row keys:', Object.keys(casesRows[0]));
        if (genesysRows.length > 0) console.log('[JsonDataLoader] Sample genesys row keys:', Object.keys(genesysRows[0]));
        if (emailRows.length > 0) console.log('[JsonDataLoader] Sample email row keys:', Object.keys(emailRows[0]));
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
        var nameCount = Object.keys(this._nameRegistry).length;
        console.log('[JsonDataLoader] Unique names registered:', nameCount);
        var t0 = performance.now();
        this._buildMergeMap();
        console.log('[JsonDataLoader] _buildMergeMap took', Math.round(performance.now() - t0), 'ms');
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
        if (!this._strippedData) return null;
        return this.parse(this._strippedData, startDate, endDate);
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

    _levenshtein: function(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        var matrix = [];
        for (var i = 0; i <= b.length; i++) matrix[i] = [i];
        for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (var i = 1; i <= b.length; i++) {
            for (var j = 1; j <= a.length; j++) {
                matrix[i][j] = a[j-1] === b[i-1] ? matrix[i-1][j-1] :
                    Math.min(matrix[i-1][j-1]+1, matrix[i][j-1]+1, matrix[i-1][j]+1);
            }
        }
        return matrix[b.length][a.length];
    },

    _isAbbreviation: function(short, long) {
        return short.length === 1 && long.length > 1 && long[0] === short[0];
    },

    _wordMatchScore: function(wa, wb) {
        if (wa === wb) return 1;
        if (this._isAbbreviation(wa, wb) || this._isAbbreviation(wb, wa)) return 0.8;
        if (this._levenshtein(wa, wb) <= 1 && Math.min(wa.length, wb.length) >= 3) return 0.9;
        if (wa.indexOf(wb) !== -1 || wb.indexOf(wa) !== -1) {
            if (Math.min(wa.length, wb.length) >= 3) return 0.85;
        }
        return 0;
    },

    _fuzzyWordMatch: function(wordsA, wordsB) {
        var concatA = wordsA.slice().sort().join('');
        var concatB = wordsB.slice().sort().join('');
        if (concatA === concatB) return true;
        var dist = this._levenshtein(concatA, concatB);
        var maxLen = Math.max(concatA.length, concatB.length);
        if (maxLen > 0 && dist / maxLen <= 0.15) return true;

        var self = this;
        var fewer = wordsA.length <= wordsB.length ? wordsA : wordsB;
        var more = fewer === wordsA ? wordsB : wordsA;

        var sharedSurnames = 0;
        fewer.forEach(function(w) {
            if (w.length >= 3 && more.indexOf(w) !== -1) sharedSurnames++;
        });

        if (sharedSurnames >= 1 && (fewer.length >= 2 || more.length >= 2)) {
            var unmatched_fewer = fewer.filter(function(w) { return more.indexOf(w) === -1; });
            var unmatched_more = more.filter(function(w) { return fewer.indexOf(w) === -1; });

            if (unmatched_fewer.length === 0 && unmatched_more.length <= 1 && unmatched_more.every(function(w) { return w.length === 1; })) return true;
            if (unmatched_more.length === 0 && unmatched_fewer.length <= 1 && unmatched_fewer.every(function(w) { return w.length === 1; })) return true;

            var concatUnF = unmatched_fewer.sort().join('');
            var concatUnM = unmatched_more.sort().join('');
            if (concatUnF.length > 0 && concatUnM.length > 0) {
                var ud = self._levenshtein(concatUnF, concatUnM);
                var uMax = Math.max(concatUnF.length, concatUnM.length);
                if (ud / uMax <= 0.2) return true;
            }

            if (unmatched_fewer.length <= 2 && unmatched_more.length <= 2) {
                var totalScore = 0;
                var pairs = Math.max(unmatched_fewer.length, unmatched_more.length);
                if (pairs > 0) {
                    var uf = unmatched_fewer, um = unmatched_more;
                    var usedM = {};
                    var matched = 0;
                    uf.forEach(function(wa) {
                        var bestScore = 0, bestIdx = -1;
                        um.forEach(function(wb, idx) {
                            if (usedM[idx]) return;
                            var s = self._wordMatchScore(wa, wb);
                            if (s > bestScore) { bestScore = s; bestIdx = idx; }
                        });
                        if (bestScore >= 0.8) { usedM[bestIdx] = true; matched++; totalScore += bestScore; }
                    });
                    var unmatchedRemain = pairs - matched;
                    if (unmatchedRemain <= 1 && matched >= 1) return true;
                }
            }
        }

        var matchedB = {};
        var allAMatch = wordsA.every(function(wa) {
            for (var k = 0; k < wordsB.length; k++) {
                if (matchedB[k]) continue;
                if (self._wordMatchScore(wa, wordsB[k]) >= 0.8) {
                    matchedB[k] = true;
                    return true;
                }
            }
            return false;
        });
        if (allAMatch && Object.keys(matchedB).length === wordsB.length) return true;

        return false;
    },

    _buildMergeMap: function() {
        var keys = Object.keys(this._nameRegistry);
        var mergeTarget = {};
        var self = this;
        var useFuzzy = keys.length <= 500;
        var useSubset = keys.length <= 2000;
        if (!useSubset) {
            console.log('[JsonDataLoader] Skipping name dedup for', keys.length, 'names (too many)');
        } else if (!useFuzzy) {
            console.log('[JsonDataLoader] Using subset-only matching for', keys.length, 'names (fuzzy disabled for performance)');
        }
        if (useSubset) {
            var wordSets = {};
            for (var k = 0; k < keys.length; k++) {
                var ws = {};
                keys[k].split(' ').forEach(function(w) { ws[w] = true; });
                wordSets[keys[k]] = ws;
            }
            for (var i = 0; i < keys.length; i++) {
                for (var j = i + 1; j < keys.length; j++) {
                    var wA = wordSets[keys[i]], wB = wordSets[keys[j]];
                    var wordsA = Object.keys(wA), wordsB = Object.keys(wB);
                    var aInB = wordsA.every(function(w) { return wB[w]; });
                    var bInA = wordsB.every(function(w) { return wA[w]; });
                    if (aInB && !bInA) {
                        mergeTarget[keys[i]] = mergeTarget[keys[j]] || keys[j];
                    } else if (bInA && !aInB) {
                        mergeTarget[keys[j]] = mergeTarget[keys[i]] || keys[i];
                    } else if (useFuzzy && !aInB && !bInA && self._fuzzyWordMatch(wordsA, wordsB)) {
                        var longer = keys[i].length >= keys[j].length ? keys[i] : keys[j];
                        var shorter = longer === keys[i] ? keys[j] : keys[i];
                        mergeTarget[shorter] = mergeTarget[longer] || longer;
                    }
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
        if (!this._strippedData) return { minDate: null, maxDate: null };
        const dates = [];
        const addDate = (val) => {
            if (!val) return;
            const d = new Date(val);
            if (!isNaN(d)) dates.push(d);
        };
        this._strippedData.genesys.forEach(r => addDate(r.CALL_DATE));
        this._strippedData.emails.forEach(r => addDate(r.EDIT_DATE));
        this._strippedData.cases.forEach(r => {
            if (r.CREATED_DATE) addDate(r.CREATED_DATE);
        });
        if (dates.length === 0) return { minDate: null, maxDate: null };
        var minT = Infinity, maxT = -Infinity;
        for (var i = 0; i < dates.length; i++) {
            var t = dates[i].getTime();
            if (t < minT) minT = t;
            if (t > maxT) maxT = t;
        }
        const minDate = new Date(minT);
        const maxDate = new Date(maxT);
        const fmt = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        return { minDate, maxDate, range: `${fmt(minDate)} - ${fmt(maxDate)}`, lastRecord: fmt(maxDate) };
    },

    getGenesysSupervisorMapping: function() {
        if (!this._strippedData) return {};
        const rows = this._strippedData.genesys;
        const mapping = {};
        var self = this;
        rows.forEach(r => {
            var agentKey = self._canonicalName(r.AGENT_NAME);
            var supKey = self._canonicalName(r.SUPERVISOR_NAME);
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
