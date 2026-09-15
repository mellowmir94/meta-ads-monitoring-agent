(function() {
  'use strict';
  // Keep the established dashboard presentation for all report views.
  // The Operations Centre remains available as its own /upload/operations/ page.
  var legacyDashboardDesign = true;
  var allowed = ['overview', 'pitstops', 'services', 'bgarage', 'indonesia'];
  var root = document.getElementById('viewRoot');
  if (!root) return;
  var icon = window.reportIcon || function() { return ''; };
  var names = { overview: ['Operations', 'Sales overview'], pitstops: ['Network', 'Pitstop performance'], services: ['Operations', 'Services & warranty'], bgarage: ['BGarage', 'Outlet performance'], indonesia: ['Indonesia', 'Market performance'] };
  function enhance() {
    var active = document.querySelector('.main-nav .nav-item.is-active');
    var view = active && active.dataset.view;
    var enabled = !legacyDashboardDesign && allowed.indexOf(view) !== -1;
    document.body.classList.toggle('ops-enhanced', enabled);
    if (enabled) document.body.dataset.workspaceView = view;
    else delete document.body.dataset.workspaceView;
    var link = document.getElementById('operationsCentreLink');
    if (!enabled) {
      if (link) link.remove();
      root.querySelectorAll('.workspace-view-bar').forEach(function(bar) { bar.remove(); });
      return;
    }
    if (!link && /^https?:$/.test(location.protocol)) {
      link = document.createElement('a');
      link.id = 'operationsCentreLink';
      link.className = 'workspace-admin-link';
      link.href = '/upload/operations/';
      link.innerHTML = icon('Activity') + 'Operations centre';
      var actions = document.querySelector('.admin-actions');
      if (actions) actions.prepend(link);
    }
    if (!root.querySelector('.workspace-view-bar')) {
      var bar = document.createElement('div');
      bar.className = 'workspace-view-bar';
      bar.innerHTML = '<div><span>' + names[view][0] + '</span><h2>' + names[view][1] + '</h2></div>';
      root.prepend(bar);
    }
    root.querySelectorAll('tr[data-pitstop-key]').forEach(function(row) {
      if (row.hasAttribute('tabindex')) return;
      row.tabIndex = 0;
      row.setAttribute('aria-label', 'Inspect ' + (row.cells[1] ? row.cells[1].textContent : 'pitstop'));
      row.addEventListener('keydown', function(event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); } });
    });
    root.querySelectorAll('.table-scroll').forEach(function(table) {
      if (table.hasAttribute('tabindex')) return;
      table.tabIndex = 0;
      table.setAttribute('role', 'region');
      table.setAttribute('aria-label', 'Scrollable report table');
    });
  }
  // Positive allowlist is intentional: Summary never receives enhancement nodes.
  new MutationObserver(enhance).observe(root, { childList: true });
  var nav = document.querySelector('.main-nav');
  if (nav) new MutationObserver(enhance).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  enhance();
})();
