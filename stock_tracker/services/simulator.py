import random
from datetime import datetime, timedelta
from typing import Dict, Any, List

class MarketSimulator:
    """
    Simulates real-time and historical stock market data using
    Geometric Brownian Motion and random walk approximations.
    """
    def __init__(self):
        # Base prices, volatility, and drift for simulated assets
        self.assets = {
            # Ticker: (Base Price, Daily Volatility %, Annual Drift %)
            "SPY": {"price": 510.50, "vol": 0.008, "drift": 0.09, "name": "S&P 500 ETF"},
            "QQQ": {"price": 438.20, "vol": 0.012, "drift": 0.12, "name": "Nasdaq 100 ETF"},
            "DIA": {"price": 390.10, "vol": 0.007, "drift": 0.08, "name": "Dow Jones ETF"},
            "AAPL": {"price": 172.50, "vol": 0.015, "drift": 0.15, "name": "Apple Inc."},
            "MSFT": {"price": 415.80, "vol": 0.013, "drift": 0.14, "name": "Microsoft Corp."},
            "GOOGL": {"price": 150.20, "vol": 0.016, "drift": 0.13, "name": "Alphabet Inc."},
            "AMZN": {"price": 178.40, "vol": 0.018, "drift": 0.16, "name": "Amazon.com Inc."},
            "NVDA": {"price": 875.00, "vol": 0.035, "drift": 0.35, "name": "NVIDIA Corp."},
            "TSLA": {"price": 175.60, "vol": 0.028, "drift": 0.20, "name": "Tesla Inc."},
            "NFLX": {"price": 610.30, "vol": 0.022, "drift": 0.18, "name": "Netflix Inc."},
            "META": {"price": 505.20, "vol": 0.021, "drift": 0.22, "name": "Meta Platforms"},
            "BTC": {"price": 67500.00, "vol": 0.040, "drift": 0.45, "name": "Bitcoin"},
            "ETH": {"price": 3500.00, "vol": 0.045, "drift": 0.40, "name": "Ethereum"}
        }
        
        # Track current state (latest ticking prices and daily open prices)
        self.current_state = {}
        self.initialize_state()

    def initialize_state(self):
        """Initialize the starting state for today's market session."""
        for ticker, data in self.assets.items():
            # Set today's open price (slight pre-market gap from base price)
            open_price = data["price"] * (1 + random.normalvariate(0, 0.005))
            self.current_state[ticker] = {
                "open": open_price,
                "price": open_price,  # Current ticking price
                "high": open_price,
                "low": open_price,
                "volume": int(random.randint(50000, 200000)),
                "name": data["name"]
            }

    def get_market_status(self) -> Dict[str, Any]:
        """Check if market is currently open (simulates open between 9:30 AM - 4:00 PM EST)."""
        now = datetime.now()
        # Always simulate as OPEN if weekday, otherwise simulate normal session hours
        is_weekend = now.weekday() >= 5
        is_market_hours = 9 <= now.hour < 16 or (now.hour == 16 and now.minute == 0)
        
        # Override to keep market open for demonstration purposes if desired
        is_open = not is_weekend or (now.hour % 2 == 0) # Open on weekends during even hours for demonstration
        
        return {
            "status": "OPEN" if is_open else "CLOSED",
            "local_time": now.strftime("%Y-%m-%d %H:%M:%S"),
            "timezone": "EST"
        }

    def tick(self):
        """Simulate a tick update (small price fluctuations) for all assets."""
        for ticker, data in self.assets.items():
            state = self.current_state[ticker]
            current_price = state["price"]
            vol = data["vol"]
            
            # Simulated price step using normal distribution (Geometric Brownian Motion step)
            # Volatility scaling for tick updates
            change_percent = random.normalvariate(0, vol * 0.1)
            new_price = current_price * (1 + change_percent)
            
            # Update high and low
            state["high"] = max(state["high"], new_price)
            state["low"] = min(state["low"], new_price)
            state["price"] = new_price
            
            # Increment volume slightly
            state["volume"] += random.randint(100, 1500)

    def get_quote(self, ticker: str) -> Dict[str, Any]:
        """Get the current live quote for a specific ticker."""
        self.tick()  # Tick the market to get fresh updates
        
        ticker = ticker.upper()
        if ticker not in self.current_state:
            return {}
            
        state = self.current_state[ticker]
        open_price = state["open"]
        price = state["price"]
        price_change = price - open_price
        price_change_pct = (price_change / open_price) * 100
        
        return {
            "ticker": ticker,
            "name": state["name"],
            "price": round(price, 2),
            "open": round(open_price, 2),
            "high": round(state["high"], 2),
            "low": round(state["low"], 2),
            "volume": state["volume"],
            "change": round(price_change, 2),
            "change_percent": round(price_change_pct, 2)
        }

    def get_all_quotes(self) -> List[Dict[str, Any]]:
        """Get quotes for all tracked assets."""
        return [self.get_quote(ticker) for ticker in self.assets.keys()]

    def get_indices(self) -> List[Dict[str, Any]]:
        """Get quotes for major indices (SPY, QQQ, DIA)."""
        index_tickers = ["SPY", "QQQ", "DIA"]
        return [self.get_quote(ticker) for ticker in index_tickers]

    def get_gainers_losers(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get sorted lists of top 5 gainers and top 5 losers (excluding indices)."""
        quotes = [self.get_quote(t) for t in self.assets.keys() if t not in ["SPY", "QQQ", "DIA"]]
        sorted_quotes = sorted(quotes, key=lambda x: x["change_percent"], reverse=True)
        return {
            "gainers": sorted_quotes[:5],
            "losers": sorted_quotes[-5:][::-1]  # reverse to show worst losers first
        }

    def get_history(self, ticker: str, range_type: str = "1m") -> List[Dict[str, Any]]:
        """
        Generate realistic historical candle (OHLCV) data for charts.
        Supported ranges: 1d, 5d, 1m, 3m, 1y
        """
        ticker = ticker.upper()
        if ticker not in self.assets:
            return []
            
        asset_info = self.assets[ticker]
        base_price = self.current_state[ticker]["price"]
        vol = asset_info["vol"]
        
        # Configure data interval points based on range type
        if range_type == "1d":
            # 24 hours of 5-minute bars (288 candles)
            points = 288
            delta = timedelta(minutes=5)
            noise_scale = vol * 0.15
        elif range_type == "5d":
            # 5 days of 1-hour bars (120 candles)
            points = 120
            delta = timedelta(hours=1)
            noise_scale = vol * 0.35
        elif range_type == "1m":
            # 30 days of daily bars
            points = 30
            delta = timedelta(days=1)
            noise_scale = vol
        elif range_type == "3m":
            points = 90
            delta = timedelta(days=1)
            noise_scale = vol
        else:  # 1y
            points = 365
            delta = timedelta(days=1)
            noise_scale = vol
            
        history = []
        current_time = datetime.now() - (delta * points)
        current_price = base_price * (1 - (asset_info["drift"] * (points / 365.0))) # Start backward
        
        for i in range(points):
            current_time += delta
            
            # Simulating stock daily price movement
            # Add drift and vol
            drift_step = asset_info["drift"] / 365.0
            price_change = current_price * (drift_step + random.normalvariate(0, noise_scale))
            new_price = current_price + price_change
            
            # Generate OHLC
            o = current_price
            c = new_price
            h = max(o, c) * (1 + abs(random.normalvariate(0, noise_scale * 0.3)))
            l = min(o, c) * (1 - abs(random.normalvariate(0, noise_scale * 0.3)))
            
            # Format time appropriately for charts (unix timestamp in seconds or string date)
            if range_type in ["1d", "5d"]:
                time_val = int(current_time.timestamp())
            else:
                time_val = current_time.strftime("%Y-%m-%d")
                
            history.append({
                "time": time_val,
                "open": round(o, 2),
                "high": round(h, 2),
                "low": round(l, 2),
                "close": round(c, 2),
                "volume": int(random.randint(500000, 3000000))
            })
            
            current_price = new_price
            
        # Ensure the final candle matches the latest ticking price
        history[-1]["close"] = round(base_price, 2)
        return history
