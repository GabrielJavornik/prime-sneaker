function normalizeDashboardDate(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    return trimmed;
}

function getDateRangeFromQuery(query = {}) {
    return {
        startDate: normalizeDashboardDate(query.startDate || query.from),
        endDate: normalizeDashboardDate(query.endDate || query.to),
    };
}

function appendDateRangeFilters(whereParts, params, column, { startDate, endDate } = {}) {
    if (startDate) {
        params.push(startDate);
        whereParts.push(`${column} >= $${params.length}::date`);
    }

    if (endDate) {
        params.push(endDate);
        whereParts.push(`${column} < ($${params.length}::date + INTERVAL '1 day')`);
    }
}

module.exports = {
    getDateRangeFromQuery,
    appendDateRangeFilters,
};
