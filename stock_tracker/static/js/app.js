// Apex Stock Tracker - Client-side state manager and interface controller

// Global application state
const state = {
  activeTicker: 'AAPL',
  activeRange: '1m',
  tradeAction: 'BUY',
  portfolioSummary: null,
  allocationChart: null,
  chartInstance: null,
  candlestickSeries: null,
  updateIntervalId: null,
  activeView: 'dashboard'
};

// Colors derived from design system
const themeColors = {
  up: '#089981',
  down: '#f23645',
  bg: '#131722',
  border: 'rgba(255, 255, 255, 0.06)',
  textPrimary: '#d1d4dc',
  textSecondary: '#787b86',
  accent: '#2962ff'
};

// DOM Elements
const elements = {
  btnNavDashboard: document.getElementById('btn-nav-dashboard'),
  btnNavPortfolio: document.getElementById('btn-nav-portfolio'),
  btnNavHistory: document.getElementById('btn-nav-history'),
  
  dashboardView: document.getElementById('dashboard-view'),
  holdingsView: document.getElementById('holdings-view'),
  historyView: document.getElementById('history-view'),
  
  marketTape: document.getElementById('market-tape'),
  marketStatusText: document.getElementById('market-status-text'),
  marketStatusContainer: document.getElementById('market-status-container'),
  
  valPortfolio: document.getElementById('val-portfolio'),
  valPnlOverall: document.getElementById('val-pnl-overall'),
  valTodaysPnl: document.getElementById('val-todays-pnl'),
  valPnlTodayPct: document.getElementById('val-pnl-today-pct'),
  valTotalInvestment: document.getElementById('val-total-investment'),
  valHoldingsCount: document.getElementById('val-holdings-count'),
  valCashBalance: document.getElementById('val-cash-balance'),
  valCashPct: document.getElementById('val-cash-pct'),
  
  chartSymbol: document.getElementById('chart-symbol'),
  chartStockName: document.getElementById('chart-stock-name'),
  chartPrice: document.getElementById('chart-price'),
  chartChange: document.getElementById('chart-change'),
  chartContainer: document.getElementById('candlestick-chart-box'),
  
  btnToggleBuy: document.getElementById('btn-toggle-buy'),
  btnToggleSell: document.getElementById('btn-toggle-sell'),
  tradeTicker: document.getElementById('trade-input-ticker'),
  tradeShares: document.getElementById('trade-input-shares'),
  tradeNotes: document.getElementById('trade-input-notes'),
  tradeExecPrice: document.getElementById('trade-exec-price'),
  tradeEstCost: document.getElementById('trade-est-cost'),
  tradeRemainingCash: document.getElementById('trade-remaining-cash'),
  btnExecuteTrade: document.getElementById('btn-execute-trade'),
  
  watchlistContainer: document.getElementById('watchlist-container'),
  holdingsTableBody: document.getElementById('holdings-table-body'),
  fullHoldingsTableBody: document.getElementById('full-holdings-table-body'),
  historyTableBody: document.getElementById('history-table-body'),
  gainersContainer: document.getElementById('gainers-container'),
  losersContainer: document.getElementById('losers-container'),
  btnRefreshHoldings: document.getElementById('btn-refresh-holdings')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupTradePanel();
  setupChartButtons();
  initLightweightChart();
  
  // Initial load
  refreshAllData();
  
  // Real-time polling updates every 3 seconds
  state.updateIntervalId = setInterval(pollMarketUpdates, 3000);
  
  // Setup Lucide icons
  lucide.createIcons();
});

// Setup Navigation View toggle
function setupNavigation() {
  const navItems = [
    { btn: elements.btnNavDashboard, view: elements.dashboardView, name: 'dashboard' },
    { btn: elements.btnNavPortfolio, view: elements.holdingsView, name: 'portfolio' },
    { btn: elements.btnNavHistory, view: elements.historyView, name: 'history' }
  ];
  
  navItems.forEach(item => {
    item.btn.addEventListener('click', () => {
      // Toggle nav item styles
      navItems.forEach(i => i.btn.classList.remove('active'));
      item.btn.classList.add('active');
      
      // Toggle view displays
      navItems.forEach(i => i.view.style.display = 'none');
      item.view.style.display = 'flex';
      
      state.activeView = item.name;
      refreshAllData();
    });
  });
  
  elements.btnRefreshHoldings.addEventListener('click', () => {
    refreshAllData();
  });
}

// Format numbers for presentation
const formatUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
const formatPercent = (val) => (val >= 0 ? '+' : '') + val.toFixed(2) + '%';

// Setup Interactive chart using TradingView Lightweight Charts
function initLightweightChart() {
  const chartOptions = {
    layout: {
      background: { type: 'solid', color: '#131722' },
      backgroundColor: '#131722', // fallback for older versions
      textColor: themeColors.textPrimary,
      fontSize: 12,
      fontFamily: 'Inter, sans-serif'
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.03)' }
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal
    },
    rightPriceScale: {
      borderColor: themeColors.border,
      textColor: themeColors.textSecondary
    },
    timeScale: {
      borderColor: themeColors.border,
      textColor: themeColors.textSecondary,
      timeVisible: true
    }
  };

  // Create chart instance
  state.chartInstance = LightweightCharts.createChart(elements.chartContainer, chartOptions);

  const seriesOptions = {
    upColor: themeColors.up,
    downColor: themeColors.down,
    borderUpColor: themeColors.up,
    borderDownColor: themeColors.down,
    wickUpColor: themeColors.up,
    wickDownColor: themeColors.down
  };

  // Add candlestick series dynamically depending on library version
  if (typeof state.chartInstance.addSeries === 'function' && typeof LightweightCharts.CandlestickSeries !== 'undefined') {
    state.candlestickSeries = state.chartInstance.addSeries(LightweightCharts.CandlestickSeries, seriesOptions);
  } else if (typeof state.chartInstance.addCandlestickSeries === 'function') {
    state.candlestickSeries = state.chartInstance.addCandlestickSeries(seriesOptions);
  } else {
    console.error("Unsupported LightweightCharts API version detected.");
  }
  
  // Resize chart with container parent resizing
  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || !state.chartInstance) return;
    const { width, height } = entries[0].contentRect;
    state.chartInstance.resize(width, height);
  });
  resizeObserver.observe(elements.chartContainer);
}

// Refresh chart data based on active range & symbol
async function refreshChart() {
  try {
    const response = await fetch(`/api/stock/${state.activeTicker}/history?range=${state.activeRange}`);
    const data = await response.json();
    
    if (data && !data.error) {
      // Map server properties to lightweight-charts series expectations
      const mappedData = data.map(item => {
        // If range is daily/hourly, unix timestamps are provided
        if (typeof item.time === 'number') {
          return {
            time: item.time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
          };
        } else {
          // If range is monthly/yearly, date strings (YYYY-MM-DD) are provided
          return {
            time: item.time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
          };
        }
      });
      
      state.candlestickSeries.setData(mappedData);
      state.chartInstance.timeScale().fitContent();
    }
  } catch (error) {
    console.error('Failed to load chart history:', error);
  }
}

// Chart period range selector controls
function setupChartButtons() {
  const rangeBtns = document.querySelectorAll('.chart-btn');
  rangeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      rangeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeRange = btn.getAttribute('data-range');
      refreshChart();
    });
  });
}

// Switch the displayed ticker info and chart
function setChartStock(ticker) {
  state.activeTicker = ticker.toUpperCase();
  elements.chartSymbol.innerText = state.activeTicker;
  elements.tradeTicker.value = state.activeTicker;
  
  // Fetch live price for headers
  fetchStockQuote(state.activeTicker);
  refreshChart();
  updateEstimateValues();
}

// Fetch single stock details for chart header
async function fetchStockQuote(ticker) {
  try {
    const response = await fetch(`/api/stock/${ticker}`);
    const data = await response.json();
    
    if (data && !data.error) {
      elements.chartStockName.innerText = data.name;
      elements.chartPrice.innerText = formatUSD(data.price);
      
      const changeEl = elements.chartChange;
      changeEl.className = 'ticker-change ' + (data.change >= 0 ? 'change-up' : 'change-down');
      changeEl.innerText = `${formatUSD(data.change)} (${formatPercent(data.change_percent)})`;
      
      // Update execution trade form price helper
      elements.tradeExecPrice.innerText = formatUSD(data.price);
      updateEstimateValues();
    }
  } catch (err) {
    console.warn(err);
  }
}

// Dynamic polling loop for real-time tickers and header index details
async function pollMarketUpdates() {
  try {
    // 1. Fetch indices tape
    const tapeResponse = await fetch('/api/market/indices');
    const tapeData = await tapeResponse.json();
    if (tapeData && !tapeData.error) {
      elements.marketTape.innerHTML = '';
      tapeData.forEach(index => {
        const indexEl = document.createElement('div');
        indexEl.className = 'ticker-item';
        const changeClass = index.change >= 0 ? 'change-up' : 'change-down';
        indexEl.innerHTML = `
          <span class="ticker-name">${index.name}</span>
          <span class="ticker-value">${index.price.toFixed(2)}</span>
          <span class="ticker-change ${changeClass}">${formatPercent(index.change_percent)}</span>
        `;
        elements.marketTape.appendChild(indexEl);
      });
    }

    // 2. Fetch market status
    const statusResponse = await fetch('/api/market/status');
    const statusData = await statusResponse.json();
    if (statusData) {
      elements.marketStatusText.innerText = `MARKET ${statusData.status}`;
      elements.marketStatusContainer.className = 'market-status-badge ' + (statusData.status === 'OPEN' ? 'open' : 'closed');
    }

    // 3. Update current active ticker quote
    await fetchStockQuote(state.activeTicker);
    
    // 4. If we are on dashboard, update lists
    if (state.activeView === 'dashboard') {
      pollDashboardSpecifics();
    }
  } catch (e) {
    console.error('Polling error:', e);
  }
}

async function pollDashboardSpecifics() {
  // Update Watchlist Sidebar Values
  const wlResponse = await fetch('/api/watchlist');
  const wlData = await wlResponse.json();
  if (wlData && !wlData.error) {
    elements.watchlistContainer.innerHTML = '';
    wlData.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'watchlist-item';
      itemEl.addEventListener('click', () => setChartStock(item.ticker));
      
      const changeClass = item.change_percent >= 0 ? 'change-up' : 'change-down';
      itemEl.innerHTML = `
        <div class="watchlist-item-left">
          <span class="watchlist-ticker">${item.ticker}</span>
          <span class="watchlist-name">${item.name}</span>
        </div>
        <div class="watchlist-item-right">
          <span class="watchlist-price">${formatUSD(item.price)}</span>
          <span class="${changeClass}">${formatPercent(item.change_percent)}</span>
        </div>
      `;
      elements.watchlistContainer.appendChild(itemEl);
    });
  }
}

// Refresh all portfolio, holdings, gainers and transactional summaries
async function refreshAllData() {
  try {
    pollMarketUpdates();
    
    // Fetch full portfolio summaries
    const portResponse = await fetch('/api/portfolio/summary');
    const portData = await portResponse.json();
    
    if (portData && !portData.error) {
      state.portfolioSummary = portData;
      
      // Update Summary Cards
      const summary = portData.summary;
      elements.valPortfolio.innerText = formatUSD(summary.portfolio_value);
      
      const pnlOverallClass = summary.unrealized_pnl >= 0 ? 'change-up' : 'change-down';
      elements.valPnlOverall.innerHTML = `
        <span class="${pnlOverallClass}">${formatUSD(summary.unrealized_pnl)} (${formatPercent(summary.overall_pnl_percent)})</span>
        <span style="color: var(--text-muted); font-weight: normal; margin-left: 2px;">Overall PnL</span>
      `;
      
      elements.valTodaysPnl.innerText = formatUSD(summary.todays_pnl_usd);
      const pnlTodayClass = summary.todays_pnl_usd >= 0 ? 'change-up' : 'change-down';
      elements.valPnlTodayPct.innerHTML = `
        <span class="${pnlTodayClass}">${formatPercent(summary.todays_pnl_percent)}</span>
        <span style="color: var(--text-muted); font-weight: normal; margin-left: 2px;">Today</span>
      `;
      
      elements.valTotalInvestment.innerText = formatUSD(summary.holdings_value);
      elements.valHoldingsCount.innerText = `${summary.holdings_count} Positions`;
      
      elements.valCashBalance.innerText = formatUSD(summary.total_cash);
      elements.valCashPct.innerText = `${portData.allocation[0]?.percentage || 100}% of portfolio`;
      
      // Populate tables
      renderHoldingsTable(portData.holdings);
      renderHistoryTable(portData.transactions);
      
      // Update allocation donut chart
      renderAllocationChart(portData.allocation);
    }
    
    // Fetch Top Gainers and Losers
    const glResponse = await fetch('/api/market/gainers-losers');
    const glData = await glResponse.json();
    if (glData && !glData.error) {
      renderGainersLosersList(glData);
    }
  } catch (error) {
    console.error('Error refreshing dashboard metrics:', error);
  }
}

// Render the active holdings table
function renderHoldingsTable(holdings) {
  const buildRowHTML = (item) => {
    const pnlClass = item.pnl >= 0 ? 'change-up' : 'change-down';
    const dayPnlClass = item.daily_change_usd >= 0 ? 'change-up' : 'change-down';
    return `
      <tr>
        <td><span class="table-ticker-badge">${item.ticker}</span></td>
        <td style="color: #fff;">${item.name}</td>
        <td>${item.shares.toFixed(4)}</td>
        <td>${formatUSD(item.avg_cost)}</td>
        <td>${formatUSD(item.current_price)}</td>
        <td style="color: #fff; font-weight: 600;">${formatUSD(item.total_value)}</td>
        <td class="${pnlClass}">${formatUSD(item.pnl)} (${formatPercent(item.pnl_percent)})</td>
        <td class="${dayPnlClass}">${formatUSD(item.daily_change_usd)}</td>
        <td><button class="table-action-btn trade-btn" data-ticker="${item.ticker}">Trade</button></td>
      </tr>
    `;
  };

  // 1. Dashboard mini holdings
  elements.holdingsTableBody.innerHTML = holdings.length === 0 
    ? '<tr><td colspan="9" style="text-align:center; color:var(--text-secondary);">No active holdings. Build your portfolio by purchasing stock.</td></tr>'
    : holdings.map(buildRowHTML).join('');
    
  // 2. Full layout holdings view
  elements.fullHoldingsTableBody.innerHTML = holdings.length === 0
    ? '<tr><td colspan="8" style="text-align:center; color:var(--text-secondary);">No active holdings.</td></tr>'
    : holdings.map(item => {
        const pnlClass = item.pnl >= 0 ? 'change-up' : 'change-down';
        return `
          <tr>
            <td><span class="table-ticker-badge">${item.ticker}</span></td>
            <td style="color: #fff;">${item.name}</td>
            <td>${item.shares.toFixed(4)}</td>
            <td>${formatUSD(item.avg_cost)}</td>
            <td>${formatUSD(item.current_price)}</td>
            <td style="color: #fff; font-weight: 600;">${formatUSD(item.total_value)}</td>
            <td class="${pnlClass}">${formatUSD(item.pnl)} (${formatPercent(item.pnl_percent)})</td>
            <td class="${item.daily_change_usd >= 0 ? 'change-up' : 'change-down'}">${formatPercent(item.daily_change_percent)}</td>
          </tr>
        `;
      }).join('');
      
  // Bind trade trigger buttons
  document.querySelectorAll('.trade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ticker = btn.getAttribute('data-ticker');
      setChartStock(ticker);
      // Automatically switch to Sell action for convenience
      setTradeAction('SELL');
      // Scroll to trading widget
      elements.tradeTicker.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// Render transaction logs
function renderHistoryTable(transactions) {
  elements.historyTableBody.innerHTML = transactions.length === 0
    ? '<tr><td colspan="7" style="text-align:center; color:var(--text-secondary);">No transactions recorded.</td></tr>'
    : transactions.map(tx => {
        const actionClass = tx.action === 'BUY' ? 'change-up' : 'change-down';
        return `
          <tr>
            <td style="color: var(--text-secondary); font-size:12px;">${tx.date}</td>
            <td><span class="table-ticker-badge">${tx.ticker}</span></td>
            <td><span class="ticker-change ${actionClass}">${tx.action}</span></td>
            <td>${tx.shares.toFixed(4)}</td>
            <td>${formatUSD(tx.price)}</td>
            <td style="color: #fff; font-weight: 600;">${formatUSD(tx.total_value)}</td>
            <td style="font-size:12px; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tx.notes || '-'}</td>
          </tr>
        `;
      }).join('');
}

// Render Allocation Pie Chart (Chart.js)
function renderAllocationChart(allocationData) {
  if (state.allocationChart) {
    state.allocationChart.destroy();
  }
  
  // Filter out assets with tiny values to avoid clutter
  const filteredData = allocationData.filter(item => item.value > 0);
  const labels = filteredData.map(item => item.name);
  const values = filteredData.map(item => item.value);
  
  const ctx = document.getElementById('allocation-pie-chart').getContext('2d');
  state.allocationChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#2a3b5c', '#2962ff', '#089981', '#f23645', '#ff9800', 
          '#9c27b0', '#e91e63', '#00bcd4', '#4caf50', '#8bc34a'
        ],
        borderWidth: 2,
        borderColor: '#131722'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: themeColors.textPrimary,
            font: { family: 'Inter', size: 11 },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1) + '%';
              return `${label}: ${formatUSD(value)} (${percentage})`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

// Render top market performers and decliners
function renderGainersLosersList(data) {
  const buildListHTML = (list) => {
    return list.map(item => {
      const isUp = item.change_percent >= 0;
      return `
        <div class="mini-list-item" style="cursor:pointer;" onclick="setChartStock('${item.ticker}')">
          <span class="mini-item-name">${item.ticker} <span style="font-size:10px; font-weight:normal; color:var(--text-secondary);">${item.name}</span></span>
          <div class="mini-item-details">
            <span style="font-weight:600;">${formatUSD(item.price)}</span>
            <span class="ticker-change ${isUp ? 'change-up' : 'change-down'}">${formatPercent(item.change_percent)}</span>
          </div>
        </div>
      `;
    }).join('');
  };
  
  elements.gainersContainer.innerHTML = buildListHTML(data.gainers);
  elements.losersContainer.innerHTML = buildListHTML(data.losers);
}

// Setup Trading execution panel
function setupTradePanel() {
  elements.btnToggleBuy.addEventListener('click', () => setTradeAction('BUY'));
  elements.btnToggleSell.addEventListener('click', () => setTradeAction('SELL'));
  
  // Real-time cost updates on forms input changes
  elements.tradeTicker.addEventListener('input', () => {
    const symbol = elements.tradeTicker.value.trim().toUpperCase();
    if (symbol.length >= 2) {
      fetchStockQuote(symbol);
    }
  });
  
  elements.tradeShares.addEventListener('input', updateEstimateValues);
  
  // Execute order submission
  elements.btnExecuteTrade.addEventListener('click', submitTradeOrder);
}

// Switch between BUY and SELL views
function setTradeAction(action) {
  state.tradeAction = action;
  if (action === 'BUY') {
    elements.btnToggleBuy.classList.add('active-buy');
    elements.btnToggleSell.classList.remove('active-sell');
    elements.btnExecuteTrade.className = 'btn-execute btn-buy';
    elements.btnExecuteTrade.innerText = 'EXECUTE BUY ORDER';
  } else {
    elements.btnToggleBuy.classList.remove('active-buy');
    elements.btnToggleSell.classList.add('active-sell');
    elements.btnExecuteTrade.className = 'btn-execute btn-sell';
    elements.btnExecuteTrade.innerText = 'EXECUTE SELL ORDER';
  }
  updateEstimateValues();
}

// Calculate estimations in trade form
function updateEstimateValues() {
  const shares = parseFloat(elements.tradeShares.value) || 0;
  const rawPriceText = elements.tradeExecPrice.innerText.replace(/[^0-9.-]+/g, '');
  const price = parseFloat(rawPriceText) || 0;
  const estCost = shares * price;
  
  elements.tradeEstCost.innerText = formatUSD(estCost);
  
  if (state.portfolioSummary) {
    const cash = state.portfolioSummary.summary.total_cash;
    let remaining = cash;
    if (state.tradeAction === 'BUY') {
      remaining = cash - estCost;
      elements.tradeRemainingCash.style.color = remaining < 0 ? themeColors.down : '#fff';
    } else {
      remaining = cash + estCost;
      elements.tradeRemainingCash.style.color = '#fff';
    }
    elements.tradeRemainingCash.innerText = formatUSD(remaining);
  }
}

// Submit transaction order to local backend API
async function submitTradeOrder() {
  const ticker = elements.tradeTicker.value.trim().toUpperCase();
  const shares = parseFloat(elements.tradeShares.value) || 0;
  const notes = elements.tradeNotes.value.trim();
  
  if (!ticker) {
    alert('Please enter a valid stock ticker symbol.');
    return;
  }
  if (shares <= 0) {
    alert('Please enter a positive number of shares to trade.');
    return;
  }
  
  try {
    elements.btnExecuteTrade.disabled = true;
    elements.btnExecuteTrade.innerText = 'EXECUTING TRANSACTION...';
    
    const response = await fetch('/api/portfolio/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        action: state.tradeAction,
        shares,
        notes
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert(result.message);
      elements.tradeShares.value = 10;
      elements.tradeNotes.value = '';
      refreshAllData();
      
      // If we bought a new ticker, switch chart to it
      if (ticker !== state.activeTicker) {
        setChartStock(ticker);
      }
    } else {
      alert('Order Failed: ' + result.message);
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to order execution server API.');
  } finally {
    elements.btnExecuteTrade.disabled = false;
    setTradeAction(state.tradeAction); // restores button text
  }
}
