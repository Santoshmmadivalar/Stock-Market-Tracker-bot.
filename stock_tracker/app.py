from flask import Flask, jsonify, request, send_from_directory
import os
import sys

# Ensure parent directory is in path so we can import services correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.simulator import MarketSimulator
from services.portfolio_mgr import PortfolioManager

app = Flask(__name__)

# Initialize singletons for our services
simulator = MarketSimulator()
portfolio_mgr = PortfolioManager()

@app.route('/')
def index():
    """Serve the single-page application dashboard dashboard."""
    return send_from_directory('static', 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    """Serve static assets (CSS, JS)."""
    return send_from_directory('static', path)

@app.route('/api/market/status', methods=['GET'])
def market_status():
    """Retrieve market open/close status."""
    return jsonify(simulator.get_market_status())

@app.route('/api/market/indices', methods=['GET'])
def market_indices():
    """Retrieve major market index snapshots (SPY, QQQ, DIA)."""
    return jsonify(simulator.get_indices())

@app.route('/api/market/gainers-losers', methods=['GET'])
def gainers_losers():
    """Retrieve top 5 gainers and losers in the market."""
    return jsonify(simulator.get_gainers_losers())

@app.route('/api/stock/<ticker>', methods=['GET'])
def stock_quote(ticker):
    """Retrieve quote for a single stock."""
    quote = simulator.get_quote(ticker)
    if not quote:
        return jsonify({"error": f"Ticker {ticker} not found"}), 404
    return jsonify(quote)

@app.route('/api/stock/<ticker>/history', methods=['GET'])
def stock_history(ticker):
    """Retrieve historical data points (OHLCV) for graphing."""
    range_type = request.args.get('range', '1m')
    history = simulator.get_history(ticker, range_type)
    if not history:
        return jsonify({"error": f"Historical data not available for {ticker}"}), 404
    return jsonify(history)

@app.route('/api/portfolio/summary', methods=['GET'])
def portfolio_summary():
    """Retrieve summary values for portfolio (cash, value, total PnL)."""
    portfolio = portfolio_mgr.load_portfolio()
    cash = portfolio["cash"]
    
    holdings_value = 0.0
    initial_holdings_cost = 0.0
    todays_change_usd = 0.0
    holdings_list = []
    
    # Calculate real-time valuation of holdings
    for ticker, data in portfolio["holdings"].items():
        shares = data["shares"]
        avg_cost = data["avg_cost"]
        
        quote = simulator.get_quote(ticker)
        current_price = quote.get("price", avg_cost)
        prev_open = quote.get("open", current_price)
        
        value = shares * current_price
        cost_basis = shares * avg_cost
        pnl = value - cost_basis
        pnl_pct = (pnl / cost_basis * 100) if cost_basis > 0 else 0.0
        
        # Calculate daily change for this stock
        daily_change_pct = quote.get("change_percent", 0.0)
        daily_change_usd = shares * (current_price - prev_open)
        todays_change_usd += daily_change_usd
        
        holdings_value += value
        initial_holdings_cost += cost_basis
        
        holdings_list.append({
            "ticker": ticker,
            "name": quote.get("name", ticker),
            "shares": shares,
            "avg_cost": avg_cost,
            "current_price": current_price,
            "total_value": round(value, 2),
            "cost_basis": round(cost_basis, 2),
            "pnl": round(pnl, 2),
            "pnl_percent": round(pnl_pct, 2),
            "daily_change_percent": daily_change_pct,
            "daily_change_usd": round(daily_change_usd, 2)
        })
        
    portfolio_value = cash + holdings_value
    unrealized_pnl = holdings_value - initial_holdings_cost
    overall_pnl_pct = (unrealized_pnl / initial_holdings_cost * 100) if initial_holdings_cost > 0 else 0.0
    
    # Calculate portfolio allocation percentages
    allocation = [{"name": "Cash", "value": round(cash, 2), "percentage": round((cash / portfolio_value * 100), 2) if portfolio_value > 0 else 100}]
    for item in holdings_list:
        percentage = (item["total_value"] / portfolio_value * 100) if portfolio_value > 0 else 0.0
        allocation.append({
            "name": item["ticker"],
            "value": item["total_value"],
            "percentage": round(percentage, 2)
        })
        
    return jsonify({
        "summary": {
            "total_cash": round(cash, 2),
            "holdings_value": round(holdings_value, 2),
            "portfolio_value": round(portfolio_value, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "overall_pnl_percent": round(overall_pnl_pct, 2),
            "todays_pnl_usd": round(todays_change_usd, 2),
            "todays_pnl_percent": round((todays_change_usd / (portfolio_value - todays_change_usd) * 100), 2) if (portfolio_value - todays_change_usd) > 0 else 0.0,
            "holdings_count": len(holdings_list)
        },
        "holdings": holdings_list,
        "allocation": allocation,
        "transactions": portfolio["transactions"][:15]  # Limit to 15 recent transactions
    })

@app.route('/api/portfolio/trade', methods=['POST'])
def portfolio_trade():
    """Execute a Buy/Sell order transaction."""
    req_data = request.get_json() or {}
    ticker = req_data.get('ticker')
    action = req_data.get('action') # BUY or SELL
    shares = float(req_data.get('shares', 0))
    notes = req_data.get('notes', '')
    
    if not ticker or not action or shares <= 0:
        return jsonify({"success": False, "message": "Missing required fields (ticker, action, shares)"}), 400
        
    quote = simulator.get_quote(ticker)
    if not quote:
        return jsonify({"success": False, "message": f"Asset {ticker} is not tradable."}), 404
        
    price = quote["price"]
    
    if action.upper() == 'BUY':
        result = portfolio_mgr.buy_stock(ticker, shares, price, notes)
    elif action.upper() == 'SELL':
        result = portfolio_mgr.sell_stock(ticker, shares, price, notes)
    else:
        return jsonify({"success": False, "message": "Invalid transaction action. Must be BUY or SELL."}), 400
        
    return jsonify(result)

@app.route('/api/watchlist', methods=['GET', 'POST'])
def watchlist():
    """GET watchlist tickers, or POST to toggle watchlist membership."""
    if request.method == 'POST':
        req_data = request.get_json() or {}
        ticker = req_data.get('ticker')
        if not ticker:
            return jsonify({"success": False, "message": "Missing ticker"}), 400
        result = portfolio_mgr.toggle_watchlist(ticker)
        return jsonify(result)
    else:
        # GET: Return all watchlist items with their latest quotes
        watchlist_tickers = portfolio_mgr.get_watchlist()
        quotes = []
        for ticker in watchlist_tickers:
            quote = simulator.get_quote(ticker)
            if quote:
                quotes.append(quote)
        return jsonify(quotes)

if __name__ == '__main__':
    # Default port 8080 for web applications
    app.run(host='0.0.0.0', port=8080, debug=True)
