(function (root) {
  'use strict';
  const defaults = () => ({ platform: 'all', page: 'all', category: 'all', status: '待处理', search: '' });
  function filtersFrom(query) {
    const result = defaults();
    for (const [key, value] of new URLSearchParams(query)) if (key in result) result[key] = value;
    if (!['all', '待处理', '已解决', '已忽略'].includes(result.status)) result.status = '待处理';
    return result;
  }
  function queryFor(filters) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'status' || (value && value !== 'all')) query.set(key, value);
    }
    return `?${query}`;
  }
  function observation(issue, { snapshot = false, finding = null } = {}) {
    const review = snapshot ? finding : [...(issue.history || [])].reverse().find(h => h.result && h.result !== '新增' && h.actual && h.expected);
    const value = review?.actual && review?.expected ? review : issue;
    return {
      value,
      review,
      updated: value !== issue,
      pending: (review?.reviewState || issue.reviewState) === '待复核' || review?.result === '待复核',
      // Recommendations on the original issue have no version link to a later review.
      recommendation: review?.recommendation || (!review || (snapshot && review.result === '新增') ? issue.recommendation || '' : '')
    };
  }
  function sortIssues(issues) {
    const rank = { P0: 0, P1: 1, P2: 2 };
    return issues.map((issue, index) => ({ issue, index })).sort((a, b) => (rank[a.issue.priority] ?? 3) - (rank[b.issue.priority] ?? 3) || a.index - b.index).map(x => x.issue);
  }
  function matches(issue, filters, platformOf, includeStatus = true) {
    const current = observation(issue).value;
    return (filters.platform === 'all' || filters.platform === platformOf(issue)) &&
      (filters.page === 'all' || filters.page === issue.pageId) &&
      (filters.category === 'all' || filters.category === issue.category) &&
      (!includeStatus || filters.status === 'all' || filters.status === issue.status) &&
      `${issue.id} ${issue.title} ${current.actual || ''} ${current.expected || ''}`.toLowerCase().includes(filters.search.toLowerCase().trim());
  }
  function pageOptions(issues, runs, platform, platformOf) {
    const relevant = issues.filter(i => platform === 'all' || platformOf(i) === platform);
    const orderedRuns = [...runs].sort((a, b) => String(b.snapshotAt || b.date).localeCompare(String(a.snapshotAt || a.date)));
    return [...new Set(relevant.map(i => i.pageId))].map(id => {
      const platforms = new Set(relevant.filter(i => i.pageId === id).map(platformOf));
      const page = orderedRuns.flatMap(r => r.pages || []).find(p => p.id === id && platforms.has(platformOf(p)));
      return [id, page?.name || id];
    });
  }
  root.UI_REVIEW_PRESENTATION = { defaults, filtersFrom, queryFor, observation, sortIssues, matches, pageOptions };
})(globalThis);
