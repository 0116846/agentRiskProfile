self.onmessage = function(e) {
    var type = e.data.type;

    if (type === 'parseText') {
        try {
            self.postMessage({ type: 'status', message: 'Parsing JSON...' });
            var json = JSON.parse(e.data.text);
            self.postMessage({ type: 'status', message: 'Stripping unused columns...' });
            var result = stripAndMerge(json);
            json = null;
            self.postMessage({ type: 'done', data: result });
        } catch (err) {
            self.postMessage({ type: 'error', message: err.message });
        }
    }
};

var CASES_FIELDS = ['CASE_NUMBER', 'NAME', 'USL_CASE_OWNER_MANAGER_C', 'ESC_CASE_TYPE_C', 'ORIGIN', 'STATUS', 'CREATED_DATE', 'ESC_PROACTIVE_TYPE_C', 'ESC_CASE_AGE_HOURS_C'];
var GENESYS_FIELDS = ['AGENT_NAME', 'SUPERVISOR_NAME', 'CALL_DATE', 'SHORT_CALLS_UNDER_5MIN', 'RONA_CALLS'];
var EMAIL_FIELDS = ['EDIT_DATE', 'OLD_VALUE', 'NEW_VALUE', 'EDITED_BY', 'MANAGER_NAME'];

function col(row, shortName, prefix) {
    if (row.hasOwnProperty(shortName)) return row[shortName];
    var full = prefix + '[' + shortName + ']';
    if (row.hasOwnProperty(full)) return row[full];
    var bracketed = '[' + shortName + ']';
    if (row.hasOwnProperty(bracketed)) return row[bracketed];
    return undefined;
}

function extractRows(section) {
    if (!section) return [];
    try {
        return section.results[0].tables[0].rows || [];
    } catch (e) {
        return [];
    }
}

function stripRows(rows, fields, prefix) {
    var result = new Array(rows.length);
    for (var i = 0; i < rows.length; i++) {
        var stripped = {};
        for (var j = 0; j < fields.length; j++) {
            var val = col(rows[i], fields[j], prefix);
            if (val !== undefined) stripped[fields[j]] = val;
        }
        result[i] = stripped;
    }
    return result;
}

function mergeAndStrip(json, keyPrefix, colPrefix, fields) {
    var raw = extractRows(json[keyPrefix]);
    for (var i = 1; i <= 12; i++) {
        if (json[keyPrefix + i]) {
            raw = raw.concat(extractRows(json[keyPrefix + i]));
        }
    }
    return stripRows(raw, fields, colPrefix);
}

function stripAndMerge(json) {
    var cases = mergeAndStrip(json, 'cases', 'GSI_CASE_DETAILS_IND', CASES_FIELDS);
    var genesys = mergeAndStrip(json, 'genesys', 'Genesys_RONA_ShortCalls_IND', GENESYS_FIELDS);
    var emails = mergeAndStrip(json, 'emailChanges', 'Email_Change_IND', EMAIL_FIELDS);
    return { cases: cases, genesys: genesys, emails: emails };
}
