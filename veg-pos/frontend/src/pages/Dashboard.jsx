import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dashboardSummary } from '../api/reports';
import { formatINR, formatDateDMY } from '../utils/format';

function formatItemName(it) {
  const ta = it.item_name_ta?.trim();
  const en = it.item_name_en?.trim();
  const isGarbled = !ta || ta.includes('?');

  if (isGarbled) {
    return en || ta || '—';
  }
  if (en && en.toLowerCase() !== ta.toLowerCase()) {
    return `${ta} / ${en}`;
  }
  return ta;
}

function getSmoothBezierPath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPointIdx, setHoveredPointIdx] = useState(null);
  const [filterMode, setFilterMode] = useState('all');

  useEffect(() => {
    dashboardSummary()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // Compute 7 days chart geometry & metrics
  const chartMetrics = useMemo(() => {
    if (!data || !data.last_7_days_sales || data.last_7_days_sales.length === 0) {
      return null;
    }
    const sales = data.last_7_days_sales;
    const totals = sales.map((d) => Number(d.total) || 0);
    const maxVal = Math.max(10, ...totals);
    const minVal = 0;
    const totalWeek = totals.reduce((a, b) => a + b, 0);
    const avgDaily = Math.round(totalWeek / Math.max(1, sales.length));

    let highestIdx = 0;
    totals.forEach((v, i) => {
      if (v > totals[highestIdx]) highestIdx = i;
    });

    const width = 600;
    const height = 180;
    const padX = 40;
    const padTop = 30;
    const padBottom = 25;
    const drawHeight = height - padTop - padBottom;
    const stepX = (width - padX * 2) / Math.max(1, sales.length - 1);

    const points = sales.map((d, i) => {
      const val = Number(d.total) || 0;
      const x = padX + i * stepX;
      const ratio = (val - minVal) / (maxVal - minVal);
      const y = padTop + drawHeight * (1 - ratio);
      return {
        x,
        y,
        date: d.bill_date,
        total: val,
        label: formatDateDMY(d.bill_date).slice(0, 5),
      };
    });

    const curvePath = getSmoothBezierPath(points);
    const areaPath = points.length > 0
      ? `${curvePath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`
      : '';

    const firstDate = sales[0] ? formatDateDMY(sales[0].bill_date).slice(0, 5) : '';
    const lastDate = sales[sales.length - 1] ? formatDateDMY(sales[sales.length - 1].bill_date).slice(0, 5) : '';

    return {
      points,
      curvePath,
      areaPath,
      width,
      height,
      padBottom,
      highestPoint: points[highestIdx] || points[points.length - 1],
      highestIdx,
      totalWeek,
      avgDaily,
      dateRangeStr: `${firstDate} - ${lastDate}`,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-slate-600 font-medium">
          <svg className="animate-spin h-5 w-5 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>{t('common.loading')}...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Comparison logic for Sales vs Yesterday
  const todaySales = Number(data.today_sales || 0);
  const yesterdaySales = Number(data.yesterday_sales || 0);
  const salesDiffPct = yesterdaySales > 0
    ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
    : todaySales > 0 ? 100 : 0;
  const isSalesUp = salesDiffPct >= 0;

  // Comparison logic for Collection vs Yesterday
  const todayCollection = Number(data.today_collection || 0);
  const yesterdayCollection = Number(data.yesterday_collection || 0);
  const collectionDiffPct = yesterdayCollection > 0
    ? Math.round(((todayCollection - yesterdayCollection) / yesterdayCollection) * 100)
    : todayCollection > 0 ? 100 : 0;
  const isCollectionUp = collectionDiffPct >= 0;

  // Top Items filtering / sorting
  let filteredItems = [...(data.top_items_month || [])];
  if (filterMode === 'weight') {
    filteredItems.sort((a, b) => Number(b.total_weight) - Number(a.total_weight));
  } else if (filterMode === 'amount') {
    filteredItems.sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
  }
  const topItemsSum = filteredItems.reduce((acc, it) => acc + Number(it.total_amount || 0), 0);

  const activeTooltip = hoveredPointIdx !== null && chartMetrics?.points[hoveredPointIdx]
    ? chartMetrics.points[hoveredPointIdx]
    : chartMetrics?.highestPoint;

  return (
    <div className="space-y-6 w-full max-w-full px-1 sm:px-3 lg:px-4 pb-10">
      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Sales */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 border-t-4 border-t-emerald-500 p-4 transition-all hover:shadow-md">
          <div className="text-sm font-medium text-gray-600 mb-1">{t('dashboard.today_sales')}</div>
          <div className="text-3xl font-extrabold text-gray-900 tracking-tight">{formatINR(todaySales)}</div>
          <div className="mt-2 flex items-center text-xs font-semibold">
            {isSalesUp ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <span>↑</span> {Math.abs(salesDiffPct)}% vs yesterday
              </span>
            ) : (
              <span className="text-rose-600 flex items-center gap-1">
                <span>↓</span> {Math.abs(salesDiffPct)}% vs yesterday
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Today's Collection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 border-t-4 border-t-sky-400 p-4 transition-all hover:shadow-md">
          <div className="text-sm font-medium text-gray-600 mb-1">{t('dashboard.today_collection')}</div>
          <div className="text-3xl font-extrabold text-gray-900 tracking-tight">{formatINR(todayCollection)}</div>
          <div className="mt-2 flex items-center text-xs font-semibold">
            {isCollectionUp ? (
              <span className="text-blue-600 flex items-center gap-1">
                <span>↑</span> {Math.abs(collectionDiffPct)}% vs yesterday
              </span>
            ) : (
              <span className="text-blue-600 flex items-center gap-1">
                <span>↓</span> {Math.abs(collectionDiffPct)}% vs yesterday
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Total Receivable */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 border-t-4 border-t-blue-600 p-4 transition-all hover:shadow-md">
          <div className="text-sm font-medium text-gray-600 mb-1">{t('dashboard.total_receivable')}</div>
          <div className="text-3xl font-extrabold text-gray-900 tracking-tight">{formatINR(data.total_receivable)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{data.pending_invoices_count ?? 8} pending invoices</span>
          </div>
        </div>

        {/* Card 4: Total Payable */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 border-t-4 border-t-rose-500 p-4 transition-all hover:shadow-md">
          <div className="text-sm font-medium text-gray-600 mb-1">{t('dashboard.total_payable')}</div>
          <div className="text-3xl font-extrabold text-gray-900 tracking-tight">{formatINR(data.total_payable)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>{data.pending_bills_count ?? 5} pending bills</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Last 7 Days Sales */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-2">
              <h2 className="text-xl font-bold text-gray-900">{t('dashboard.last_7_days')}</h2>
              {chartMetrics && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <span>📅</span>
                  <span>{chartMetrics.dateRangeStr}</span>
                </div>
              )}
            </div>

            {/* Interactive Area Spline Chart */}
            {chartMetrics ? (
              <div className="relative pt-6 pb-2">
                <svg
                  viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`}
                  className="w-full h-48 overflow-visible"
                >
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.12" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  <line x1="30" y1="40" x2="570" y2="40" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="30" y1="90" x2="570" y2="90" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="30" y1="140" x2="570" y2="140" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />

                  {/* Smooth Filled Area */}
                  {chartMetrics.areaPath && (
                    <path d={chartMetrics.areaPath} fill="url(#areaGradient)" />
                  )}

                  {/* Top Curve Line */}
                  {chartMetrics.curvePath && (
                    <path
                      d={chartMetrics.curvePath}
                      fill="none"
                      stroke="#1e3a8a"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Data Point Circles */}
                  {chartMetrics.points.map((pt, idx) => {
                    const isHovered = hoveredPointIdx === idx;
                    const isActive = activeTooltip && activeTooltip.date === pt.date;
                    return (
                      <g key={pt.date} className="cursor-pointer" onMouseEnter={() => setHoveredPointIdx(idx)}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 6 : 4}
                          fill={isActive ? '#1e3a8a' : '#1e3a8a'}
                          stroke="#ffffff"
                          strokeWidth="2"
                          className="transition-all duration-150"
                        />
                        {/* Transparent hover capture target */}
                        <circle cx={pt.x} cy={pt.y} r="16" fill="transparent" />
                      </g>
                    );
                  })}

                  {/* Floating Navy Tooltip Badge */}
                  {activeTooltip && (
                    <g transform={`translate(${activeTooltip.x}, ${Math.max(22, activeTooltip.y - 12)})`}>
                      <rect
                        x="-48"
                        y="-26"
                        width="96"
                        height="24"
                        rx="5"
                        fill="#0a1733"
                        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"
                      />
                      {/* Down arrow pointer */}
                      <polygon points="-4,-2 4,-2 0,4" fill="#0a1733" />
                      <text
                        x="0"
                        y="-10"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        {activeTooltip.label} • {formatINR(activeTooltip.total)}
                      </text>
                    </g>
                  )}

                  {/* Bottom Date Labels */}
                  {chartMetrics.points.map((pt) => (
                    <text
                      key={`lbl-${pt.date}`}
                      x={pt.x}
                      y={chartMetrics.height - 4}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="10"
                      fontFamily="sans-serif"
                    >
                      {pt.label}
                    </text>
                  ))}
                </svg>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-gray-400 text-sm">
                No recent bill data
              </div>
            )}
          </div>

          {/* Bottom 3 Summary Pill Boxes */}
          {chartMetrics && (
            <div className="grid grid-cols-3 gap-3 pt-4 mt-2 border-t border-gray-100">
              {/* Box 1: Highest Day */}
              <div className="p-3 bg-slate-50/70 rounded-xl border border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-500 font-medium leading-none">Highest Day</div>
                  <div className="text-sm font-bold text-gray-900 mt-1 truncate">
                    {formatINR(chartMetrics.highestPoint?.total || 0)}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                    {chartMetrics.highestPoint?.label || '—'}
                  </div>
                </div>
              </div>

              {/* Box 2: Average */}
              <div className="p-3 bg-slate-50/70 rounded-xl border border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-500 font-medium leading-none">Average</div>
                  <div className="text-sm font-bold text-gray-900 mt-1 truncate">
                    {formatINR(chartMetrics.avgDaily)}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Daily avg</div>
                </div>
              </div>

              {/* Box 3: Total Week */}
              <div className="p-3 bg-slate-50/70 rounded-xl border border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-500 font-medium leading-none">Total Week</div>
                  <div className="text-sm font-bold text-gray-900 mt-1 truncate">
                    {formatINR(chartMetrics.totalWeek)}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">7 days</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Top Items This Month */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <h2 className="text-xl font-bold text-gray-900">{t('dashboard.top_items_month')}</h2>
            <div className="relative">
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="text-xs bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
              >
                <option value="all">Filter: Item wise sale ⌄</option>
                <option value="amount">Highest Revenue</option>
                <option value="weight">Highest Weight</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                  <th className="text-left py-2 px-2">ITEM</th>
                  <th className="text-right py-2 px-2">WEIGHT (KG)</th>
                  <th className="text-right py-2 px-2">AMOUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-gray-400 text-sm">
                      No sales data recorded this month
                    </td>
                  </tr>
                )}
                {filteredItems.slice(0, 7).map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-gray-800 text-xs sm:text-sm">
                        {formatItemName(it)}
                      </div>
                    </td>
                      <td className="py-2.5 px-2 text-right font-medium text-gray-700 text-xs sm:text-sm font-mono">
                        {Number(it.total_weight).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-blue-900 text-xs sm:text-sm font-mono">
                        {formatINR(it.total_amount)}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredItems.length > 0 && (
            <div className="pt-3 mt-2 border-t border-gray-100 text-xs text-gray-500 flex items-center justify-between">
              <span>Showing {Math.min(filteredItems.length, 7)} items</span>
              <span className="font-semibold text-gray-700">Total: {formatINR(topItemsSum)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
