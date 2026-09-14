import { createElement, Activity, ArrowLeft, ArrowUpRight, Check, ChevronRight, Database, Download, FileCheck2, History, LayoutDashboard, MapPin, RefreshCw, Search, ShieldCheck, Upload, Wrench, X } from 'lucide';

const icons = { Activity, ArrowLeft, ArrowUpRight, Check, ChevronRight, Database, Download, FileCheck2, History, LayoutDashboard, MapPin, RefreshCw, Search, ShieldCheck, Upload, Wrench, X };
window.reportIcon = function(name) {
  return createElement(icons[name] || Activity, { width: 18, height: 18, 'aria-hidden': 'true', 'stroke-width': 1.7 }).outerHTML;
};
