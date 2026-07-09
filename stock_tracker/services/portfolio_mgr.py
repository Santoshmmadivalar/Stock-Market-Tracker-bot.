import json
import os
from datetime import datetime
from typing import Dict, Any, List

class PortfolioManager:
    """
    Manages user's cash balance, stock holdings, watchlists,
    and purchase/sale transaction histories, persisting to a JSON database.
    """
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.db_path = os.path.join(data_dir, "portfolio.json")
        self.default_portfolio = {
            "cash": 100000.0,
            "holdings": {},  # Ticker: {"shares": float, "avg_cost": float}
            "transactions": [],  # List of Dict
            "watchlist": ["AAPL", "MSFT", "NVDA", "TSLA", "BTC"]
        }
        self.initialize_db()

    def initialize_db(self):
        """Create the database directory and file if they do not exist."""
        os.makedirs(self.data_dir, exist_ok=True)
        if not os.path.exists(self.db_path):
            self.save_portfolio(self.default_portfolio)

    def load_portfolio(self) -> Dict[str, Any]:
        """Load portfolio state from JSON file."""
        try:
            with open(self.db_path, "r") as f:
                data = json.load(f)
                
            # Ensure all keys exist in loaded data
            for key, default_val in self.default_portfolio.items():
                if key not in data:
                    data[key] = default_val
            return data
        except Exception:
            return self.default_portfolio.copy()

    def save_portfolio(self, data: Dict[str, Any]):
        """Persist portfolio state to JSON file."""
        try:
            with open(self.db_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving portfolio database: {str(e)}")

    def buy_stock(self, ticker: str, shares: float, price: float, notes: str = "") -> Dict[str, Any]:
        """Execute a stock purchase order."""
        if shares <= 0 or price <= 0:
            return {"success": False, "message": "Shares and price must be positive numbers."}

        ticker = ticker.upper()
        portfolio = self.load_portfolio()
        total_cost = shares * price

        if portfolio["cash"] < total_cost:
            return {
                "success": False,
                "message": f"Insufficient funds. Required: ${total_cost:,.2f}, Available: ${portfolio['cash']:,.2f}"
            }

        # Deduct cash
        portfolio["cash"] -= total_cost

        # Update holdings
        holdings = portfolio["holdings"]
        if ticker in holdings:
            current_shares = holdings[ticker]["shares"]
            current_avg_cost = holdings[ticker]["avg_cost"]
            new_shares = current_shares + shares
            # Recalculate average cost basis
            new_avg_cost = ((current_shares * current_avg_cost) + total_cost) / new_shares
            holdings[ticker] = {"shares": round(new_shares, 6), "avg_cost": round(new_avg_cost, 2)}
        else:
            holdings[ticker] = {"shares": round(shares, 6), "avg_cost": round(price, 2)}

        # Record transaction
        tx = {
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ticker": ticker,
            "action": "BUY",
            "shares": round(shares, 6),
            "price": round(price, 2),
            "total_value": round(total_cost, 2),
            "notes": notes
        }
        portfolio["transactions"].insert(0, tx) # Prepend to show newest first

        self.save_portfolio(portfolio)
        return {"success": True, "message": f"Successfully purchased {shares} shares of {ticker} for ${total_cost:,.2f}."}

    def sell_stock(self, ticker: str, shares: float, price: float, notes: str = "") -> Dict[str, Any]:
        """Execute a stock sales order."""
        if shares <= 0 or price <= 0:
            return {"success": False, "message": "Shares and price must be positive numbers."}

        ticker = ticker.upper()
        portfolio = self.load_portfolio()
        holdings = portfolio["holdings"]

        if ticker not in holdings or holdings[ticker]["shares"] < shares:
            owned = holdings[ticker]["shares"] if ticker in holdings else 0.0
            return {
                "success": False,
                "message": f"Insufficient shares. Trying to sell: {shares}, Owned: {owned}"
            }

        total_revenue = shares * price
        
        # Credit cash
        portfolio["cash"] += total_revenue

        # Update holdings
        holdings[ticker]["shares"] = round(holdings[ticker]["shares"] - shares, 6)
        if holdings[ticker]["shares"] <= 0.0001:
            holdings.pop(ticker)

        # Record transaction
        tx = {
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ticker": ticker,
            "action": "SELL",
            "shares": round(shares, 6),
            "price": round(price, 2),
            "total_value": round(total_revenue, 2),
            "notes": notes
        }
        portfolio["transactions"].insert(0, tx)

        self.save_portfolio(portfolio)
        return {"success": True, "message": f"Successfully sold {shares} shares of {ticker} for ${total_revenue:,.2f}."}

    def toggle_watchlist(self, ticker: str) -> Dict[str, Any]:
        """Add or remove a ticker from the watchlist."""
        ticker = ticker.upper()
        portfolio = self.load_portfolio()
        watchlist = portfolio["watchlist"]

        if ticker in watchlist:
            watchlist.remove(ticker)
            action = "removed"
        else:
            watchlist.append(ticker)
            action = "added"

        self.save_portfolio(portfolio)
        return {"success": True, "action": action, "watchlist": watchlist}
        
    def get_watchlist(self) -> List[str]:
        """Return the watchlist tickers."""
        portfolio = self.load_portfolio()
        return portfolio.get("watchlist", [])
